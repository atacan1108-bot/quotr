/**
 * PUBLIC, no-auth endpoint — a customer declines on /quote/[token] and this
 * runs. Scoped strictly by the share token via the admin client, same trust
 * boundary as the accept route right next to it — see
 * src/lib/supabase/admin.ts and src/lib/publicProposal.ts.
 *
 * Marks the proposal declined (+ optional reason), flips the job status,
 * and best-effort emails the contractor via the SAME notifyContractor()
 * used by the accept route — see src/lib/notifyContractor.ts. The decline
 * itself must succeed even if the email step fails.
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicProposalByToken, type PublicQuoteView } from '@/lib/publicProposal'
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { notifyContractor } from '@/lib/notifyContractor'
import { DEFAULT_LOCALE } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

const MAX_REASON_LENGTH = 2000

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  // No quote loaded yet at this point, so there's no job.language to read —
  // same fallback the accept route and the public page itself use.
  const lFallback = pdfLabels(DEFAULT_LOCALE)
  if (!token) {
    return NextResponse.json({ error: lFallback.linkNotValid }, { status: 404 })
  }

  let body: { reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: lFallback.invalidRequest }, { status: 400 })
  }

  const reason: string | null = body.reason?.trim().slice(0, MAX_REASON_LENGTH) || null

  let quote: PublicQuoteView | null
  try {
    quote = await getPublicProposalByToken(token)
  } catch (err) {
    console.error('decline: failed to load proposal', err)
    return NextResponse.json({ error: lFallback.somethingWentWrong }, { status: 500 })
  }
  if (!quote) {
    return NextResponse.json({ error: lFallback.linkNotValid }, { status: 404 })
  }

  const locale: Locale = quote.language
  const l = pdfLabels(locale)
  const businessName = quote.business.name ?? l.thisBusiness

  // Mutually exclusive with accept: an already-accepted quote can't be
  // declined. An already-declined quote is idempotent — same response, no
  // second email — matching how the accept route treats a repeat accept.
  if (quote.acceptedAt) {
    return NextResponse.json({ error: l.alreadyAcceptedCannotDecline }, { status: 409 })
  }
  if (quote.declinedAt) {
    return NextResponse.json({ ok: true, businessName })
  }
  if (quote.status === 'expired') {
    return NextResponse.json({ error: l.quoteExpiredShort }, { status: 409 })
  }

  const admin = createAdminClient()
  const declinedAt = new Date().toISOString()

  const forwardedFor = req.headers.get('x-forwarded-for')
  const declineIp = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const declineUserAgent = req.headers.get('user-agent') || null

  // Atomic decline: only succeeds for whichever request gets there first,
  // AND only while the quote hasn't been accepted in the meantime — the
  // same mutual-exclusivity guard the accept route uses in reverse.
  const { data: updatedRows, error: updateError } = await admin
    .from('proposals')
    .update({
      declined_at:         declinedAt,
      decline_reason:      reason,
      decline_ip:          declineIp,
      decline_user_agent:  declineUserAgent,
    })
    .eq('id', quote.proposalId)
    .is('declined_at', null)
    .is('accepted_at', null)
    .select('id')

  if (updateError) {
    console.error('decline: failed to update proposal', updateError)
    return NextResponse.json({ error: l.somethingWentWrong }, { status: 502 })
  }

  const wonRace = (updatedRows?.length ?? 0) > 0
  if (!wonRace) {
    // Someone else's click (accept or decline) landed first in the last few
    // milliseconds. Re-check which one — respond accordingly, no email.
    const { data: freshProposal } = await admin
      .from('proposals')
      .select('accepted_at')
      .eq('id', quote.proposalId)
      .maybeSingle()
    if (freshProposal?.accepted_at) {
      return NextResponse.json({ error: l.alreadyAcceptedCannotDecline }, { status: 409 })
    }
    return NextResponse.json({ ok: true, businessName })
  }

  // Keep the job's own status field in sync — this is what the contractor's
  // dashboard and quote screen read (deriveQuoteStatus in src/lib/types.ts).
  const { data: proposalRow } = await admin
    .from('proposals')
    .select('job_id, owner_id, computed_totals')
    .eq('id', quote.proposalId)
    .maybeSingle()

  if (proposalRow?.job_id) {
    await admin.from('jobs').update({ status: 'declined' }).eq('id', proposalRow.job_id)
  }

  // Best-effort notification — never let an email problem fail the decline.
  // This is the ONE notification code path, shared with the accept route —
  // see src/lib/notifyContractor.ts.
  try {
    const headersList = await headers()
    const host  = headersList.get('host') ?? 'localhost:3000'
    const proto = host.includes('localhost') ? 'http' : 'https'
    await notifyContractor({
      kind:        'declined',
      ownerId:     proposalRow?.owner_id ?? null,
      jobId:       proposalRow?.job_id ?? '',
      businessName,
      businessEmail: quote.business.email,
      clientName:  quote.clientName ?? l.you,
      jobTitle:    quote.jobTitle,
      total:       (proposalRow?.computed_totals as { total?: number } | null)?.total ?? quote.breakdown.total,
      eventAt:     declinedAt,
      baseUrl:     `${proto}://${host}`,
      declineReason: reason,
    })
  } catch (err) {
    console.error('decline: notification email failed', err)
  }

  return NextResponse.json({ ok: true, businessName })
}
