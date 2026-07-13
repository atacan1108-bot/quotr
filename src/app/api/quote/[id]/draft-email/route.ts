/**
 * Drafts (but does not send) the email a contractor would send a client
 * alongside a quote PDF. No DB writes — purely computes a draft the
 * contractor reviews/edits client-side before an explicit "Send email"
 * (see .../send-email/route.ts) actually sends it.
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getQuoteExportData } from '@/lib/quoteData'
import { generateEmailDraft, EmailDraftError } from '@/lib/generateEmailDraft'
import { pdfLabels } from '@/lib/pdf/pdfLabels'

export async function POST(
  _req: Request,
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

  const locale = data.job.language
  const l = pdfLabels(locale)
  const businessName = data.rateCard.business_name ?? ''
  const clientName = data.job.clients?.name ?? ''
  const quoteNumber = data.quoteSequence != null
    ? `${data.rateCard.branding?.quoteNumberPrefix ?? ''}${String(data.quoteSequence).padStart(3, '0')}`
    : ''

  const subject = `${l.quote} ${quoteNumber} – ${businessName}`.trim()

  let body: string
  try {
    const draft = await generateEmailDraft({
      documentType: 'quote',
      documentNumber: quoteNumber,
      businessName,
      clientName,
      language: locale,
    })
    body = draft.body
  } catch (err) {
    const status = err instanceof EmailDraftError ? err.status : 502
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }

  const safeName = data.job.title
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  return NextResponse.json({
    to: data.job.clients?.email ?? '',
    ccSelf: data.rateCard.business_email ?? '',
    subject,
    body,
    attachmentFilename: `${l.quote.toLowerCase()}-${safeName || quoteNumber || id}.pdf`,
  })
}
