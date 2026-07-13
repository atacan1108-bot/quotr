/**
 * Sends the (contractor-reviewed/edited) quote email via
 * sendDocumentEmail — the ONE place that calls Resend with an attachment,
 * shared with the invoice route. On success, records the send and — only
 * if the quote hasn't already moved past draft/quoted — marks it Sent.
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getQuoteExportData } from '@/lib/quoteData'
import { sendDocumentEmail, SendDocumentEmailError } from '@/lib/sendDocumentEmail'
import { pdfLabels } from '@/lib/pdf/pdfLabels'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  const tApi = await getTranslations('generatePdfApi')
  const tEmail = await getTranslations('emailApi')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  let payload: { to?: string; cc?: boolean; subject?: string; body?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: tErrors('invalidRequest') }, { status: 400 })
  }

  const to = payload.to?.trim() ?? ''
  const subject = payload.subject?.trim() ?? ''
  const body = payload.body?.trim() ?? ''
  if (!EMAIL_PATTERN.test(to)) {
    return NextResponse.json({ error: tEmail('invalidEmail') }, { status: 400 })
  }
  if (!subject || !body) {
    return NextResponse.json({ error: tEmail('missingSubjectOrBody') }, { status: 400 })
  }

  const headersList = await headers()
  const host  = headersList.get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  const data = await getQuoteExportData(id, baseUrl)
  if (!data) {
    return NextResponse.json({ error: tApi('quoteNotFound') }, { status: 404 })
  }
  if (!data.proposal?.pdf_url) {
    return NextResponse.json({ error: tEmail('noPdfYet') }, { status: 400 })
  }

  const l = pdfLabels(data.job.language)
  const businessName = data.rateCard.business_name || 'Quotr'

  let attachmentBuffer: Buffer
  try {
    const res = await fetch(data.proposal.pdf_url)
    if (!res.ok) throw new Error(`PDF fetch failed with status ${res.status}`)
    attachmentBuffer = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.error('quote send-email: could not fetch PDF for attachment', { jobId: id, error: err })
    return NextResponse.json({ error: tEmail('attachmentFetchFailed') }, { status: 502 })
  }

  const safeName = data.job.title
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  try {
    await sendDocumentEmail({
      to,
      cc: payload.cc ? (data.rateCard.business_email ?? null) : null,
      fromName: businessName,
      replyTo: data.rateCard.business_email ?? null,
      subject,
      bodyText: body,
      attachmentFilename: `${l.quote.toLowerCase()}-${safeName || id}.pdf`,
      attachmentBuffer,
    })
  } catch (err) {
    const message = err instanceof SendDocumentEmailError ? err.message : tErrors('somethingWentWrong')
    console.error('quote send-email: send failed', { jobId: id, error: err })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  await supabase.from('proposals').update({ email_sent_at: sentAt, email_sent_to: to }).eq('id', data.proposal.id)
  if (data.job.status === 'draft' || data.job.status === 'quoted') {
    await supabase.from('jobs').update({ status: 'sent' }).eq('id', id)
  }

  return NextResponse.json({ sentAt, sentTo: to })
}
