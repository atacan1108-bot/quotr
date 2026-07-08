/**
 * PUBLIC, no-auth endpoint — a customer signs on /quote/[token] and this
 * runs. Scoped strictly by the share token via the admin client (see
 * src/lib/supabase/admin.ts and src/lib/publicProposal.ts) — it can only
 * ever touch the one proposal/job that token belongs to.
 *
 * Marks the proposal accepted with the signer's name/signature/audit info,
 * flips the job status, generates the signed PDF, and best-effort emails
 * the contractor. The accept itself must succeed even if the PDF or email
 * step fails — those are follow-on effects, not the source of truth.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicProposalByToken, type PublicQuoteView } from '@/lib/publicProposal'
import { formatEuro } from '@/lib/pricing'
import { SignedQuotePDF } from '@/app/quote/[token]/SignedQuotePDF'

const MAX_SIGNATURE_LENGTH = 2_000_000 // generous cap for a small canvas PNG data URL

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: 'This quote link isn\'t valid.' }, { status: 404 })
  }

  let body: { signerName?: string; signatureDataUrl?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const signerName = body.signerName?.trim().slice(0, 200) ?? ''
  if (!signerName) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }

  const signatureDataUrl: string | null = body.signatureDataUrl?.trim() || null
  if (signatureDataUrl) {
    if (signatureDataUrl.length > MAX_SIGNATURE_LENGTH || !signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'That signature couldn\'t be read — please try again.' }, { status: 400 })
    }
  }

  let quote: PublicQuoteView | null
  try {
    quote = await getPublicProposalByToken(token)
  } catch (err) {
    console.error('accept: failed to load proposal', err)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
  if (!quote) {
    return NextResponse.json({ error: 'This quote link isn\'t valid.' }, { status: 404 })
  }

  const businessName = quote.business.name ?? 'The business'

  // Already accepted (either from an earlier click, or a concurrent one
  // that wins the race below) — respond the same way, no duplicate email.
  if (quote.acceptedAt) {
    return NextResponse.json({ ok: true, businessName, signedPdfUrl: quote.signedPdfUrl })
  }
  if (quote.status === 'declined') {
    return NextResponse.json({ error: 'This quote is no longer available.' }, { status: 409 })
  }
  if (quote.status === 'expired') {
    return NextResponse.json({ error: 'This quote has expired.' }, { status: 409 })
  }

  const admin = createAdminClient()
  const signedAt = new Date().toISOString()

  const forwardedFor = req.headers.get('x-forwarded-for')
  const acceptIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const acceptUserAgent = req.headers.get('user-agent') || null

  // Atomic accept: only succeeds for whichever request gets there first.
  // `.select('id')` lets us tell whether THIS request won the race.
  const { data: updatedRows, error: updateError } = await admin
    .from('proposals')
    .update({
      accepted_at:        signedAt,
      signer_name:        signerName,
      signature_data_url: signatureDataUrl,
      accept_ip:          acceptIp,
      accept_user_agent:  acceptUserAgent,
    })
    .eq('id', quote.proposalId)
    .is('accepted_at', null)
    .select('id')

  if (updateError) {
    console.error('accept: failed to update proposal', updateError)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 502 })
  }

  const wonRace = (updatedRows?.length ?? 0) > 0
  if (!wonRace) {
    // Someone else's click landed first in the last few milliseconds — still a success.
    return NextResponse.json({ ok: true, businessName, signedPdfUrl: quote.signedPdfUrl })
  }

  // Keep the job's own status field in sync with the accepted proposal —
  // this is what the contractor's dashboard and quote screen read.
  const { data: proposalRow } = await admin
    .from('proposals')
    .select('job_id, owner_id, computed_totals')
    .eq('id', quote.proposalId)
    .maybeSingle()

  if (proposalRow?.job_id) {
    await admin.from('jobs').update({ status: 'accepted' }).eq('id', proposalRow.job_id)
  }

  // Generate + store the signed PDF. Best-effort: the acceptance itself is
  // already durable above, so a PDF failure shouldn't fail the request.
  let signedPdfUrl: string | null = null
  if (proposalRow?.owner_id) {
    try {
      const buffer = await renderToBuffer(
        <SignedQuotePDF quote={quote} signerName={signerName} signatureDataUrl={signatureDataUrl} signedAt={signedAt} />,
      )
      const path = `${proposalRow.owner_id}/${quote.proposalId}-signed.pdf`
      const { error: uploadError } = await admin.storage
        .from('proposals')
        .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw uploadError

      signedPdfUrl = admin.storage.from('proposals').getPublicUrl(path).data.publicUrl
      await admin.from('proposals').update({ signed_pdf_url: signedPdfUrl }).eq('id', quote.proposalId)
    } catch (err) {
      console.error('accept: signed PDF generation/upload failed', err)
    }
  }

  // Best-effort notification — never let an email problem fail the accept.
  try {
    await notifyContractor({
      ownerId:     proposalRow?.owner_id ?? null,
      businessName,
      businessEmail: quote.business.email,
      clientName:  quote.clientName ?? signerName,
      jobTitle:    quote.jobTitle,
      total:       (proposalRow?.computed_totals as { total?: number } | null)?.total ?? quote.breakdown.total,
      signedPdfUrl,
    })
  } catch (err) {
    console.error('accept: notification email failed', err)
  }

  return NextResponse.json({ ok: true, businessName, signedPdfUrl })
}

async function notifyContractor(opts: {
  ownerId:        string | null
  businessName:   string
  businessEmail:  string | null
  clientName:     string
  jobTitle:       string
  total:          number
  signedPdfUrl:   string | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_RESEND_API_KEY_HERE') {
    console.warn('accept: RESEND_API_KEY not set — skipping notification email')
    return
  }

  // The contractor's own login email is the most reliable "notify them"
  // address — falls back to their displayed business email if that lookup
  // fails for some reason.
  let toEmail = opts.businessEmail
  if (opts.ownerId) {
    try {
      const admin = createAdminClient()
      const { data } = await admin.auth.admin.getUserById(opts.ownerId)
      toEmail = data.user?.email ?? toEmail
    } catch (err) {
      console.error('accept: could not look up contractor login email', err)
    }
  }
  if (!toEmail) {
    console.warn('accept: no contractor email available — skipping notification email')
    return
  }

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from:    'Quotr <onboarding@resend.dev>',
    to:      toEmail,
    subject: `${opts.clientName} accepted your quote — ${formatEuro(opts.total)}`,
    html: `
      <p><strong>${escapeHtml(opts.clientName)}</strong> just accepted and signed the quote for <strong>${escapeHtml(opts.jobTitle)}</strong>.</p>
      <p>Total: <strong>${formatEuro(opts.total)}</strong></p>
      ${opts.signedPdfUrl ? `<p><a href="${opts.signedPdfUrl}">Download the signed PDF</a></p>` : ''}
      <p>— ${escapeHtml(opts.businessName)}</p>
    `,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
