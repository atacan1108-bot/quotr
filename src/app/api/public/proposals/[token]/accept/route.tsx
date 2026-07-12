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
import { headers } from 'next/headers'
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicProposalByToken, type PublicQuoteView } from '@/lib/publicProposal'
import { SignedQuotePDF } from '@/app/quote/[token]/SignedQuotePDF'
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { notifyContractor } from '@/lib/notifyContractor'
import { DEFAULT_LOCALE } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

const MAX_SIGNATURE_LENGTH = 2_000_000 // generous cap for a small canvas PNG data URL

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  // No quote loaded yet at this point, so there's no job.language to read —
  // same fallback the public page itself uses for its own unknown-token case.
  const lFallback = pdfLabels(DEFAULT_LOCALE)
  if (!token) {
    return NextResponse.json({ error: lFallback.linkNotValid }, { status: 404 })
  }

  let body: { signerName?: string; signatureDataUrl?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: lFallback.invalidRequest }, { status: 400 })
  }

  const signerName = body.signerName?.trim().slice(0, 200) ?? ''
  if (!signerName) {
    return NextResponse.json({ error: lFallback.nameRequired }, { status: 400 })
  }

  const signatureDataUrl: string | null = body.signatureDataUrl?.trim() || null
  if (signatureDataUrl) {
    if (signatureDataUrl.length > MAX_SIGNATURE_LENGTH || !signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: lFallback.signatureUnreadable }, { status: 400 })
    }
  }

  let quote: PublicQuoteView | null
  try {
    quote = await getPublicProposalByToken(token)
  } catch (err) {
    console.error('accept: failed to load proposal', err)
    return NextResponse.json({ error: lFallback.somethingWentWrong }, { status: 500 })
  }
  if (!quote) {
    return NextResponse.json({ error: lFallback.linkNotValid }, { status: 404 })
  }

  const locale: Locale = quote.language
  const l = pdfLabels(locale)
  const businessName = quote.business.name ?? l.thisBusiness

  // Already accepted (either from an earlier click, or a concurrent one
  // that wins the race below) — respond the same way, no duplicate email.
  if (quote.acceptedAt) {
    return NextResponse.json({ ok: true, businessName, signedPdfUrl: quote.signedPdfUrl })
  }
  if (quote.status === 'declined') {
    return NextResponse.json({ error: l.noLongerAvailable }, { status: 409 })
  }
  if (quote.status === 'expired') {
    return NextResponse.json({ error: l.quoteExpiredShort }, { status: 409 })
  }

  const admin = createAdminClient()
  const signedAt = new Date().toISOString()

  const forwardedFor = req.headers.get('x-forwarded-for')
  const acceptIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const acceptUserAgent = req.headers.get('user-agent') || null

  // Atomic accept: only succeeds for whichever request gets there first,
  // AND only while the quote hasn't been declined in the meantime (a second
  // guard against a concurrent accept/decline race landing on the same
  // proposal — accept and decline are mutually exclusive).
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
    .is('declined_at', null)
    .select('id')

  if (updateError) {
    console.error('accept: failed to update proposal', updateError)
    return NextResponse.json({ error: l.somethingWentWrong }, { status: 502 })
  }

  const wonRace = (updatedRows?.length ?? 0) > 0
  if (!wonRace) {
    // Someone else's click landed first in the last few milliseconds — could
    // be a duplicate accept (harmless, still a success) or a concurrent
    // decline (the quote is no longer acceptable) — check which, rather
    // than blindly reporting success either way.
    const { data: freshProposal } = await admin
      .from('proposals')
      .select('declined_at')
      .eq('id', quote.proposalId)
      .maybeSingle()
    if (freshProposal?.declined_at) {
      return NextResponse.json({ error: l.noLongerAvailable }, { status: 409 })
    }
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
  // This is the ONE notification code path, shared with the decline route —
  // see src/lib/notifyContractor.ts.
  try {
    const headersList = await headers()
    const host  = headersList.get('host') ?? 'localhost:3000'
    const proto = host.includes('localhost') ? 'http' : 'https'
    await notifyContractor({
      kind:        'accepted',
      ownerId:     proposalRow?.owner_id ?? null,
      jobId:       proposalRow?.job_id ?? '',
      businessName,
      businessEmail: quote.business.email,
      clientName:  quote.clientName ?? signerName,
      jobTitle:    quote.jobTitle,
      total:       (proposalRow?.computed_totals as { total?: number } | null)?.total ?? quote.breakdown.total,
      eventAt:     signedAt,
      baseUrl:     `${proto}://${host}`,
      signedPdfUrl,
    })
  } catch (err) {
    console.error('accept: notification email failed', err)
  }

  return NextResponse.json({ ok: true, businessName, signedPdfUrl })
}
