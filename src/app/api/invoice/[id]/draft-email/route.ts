/**
 * Drafts (but does not send) the email a contractor would send a client
 * alongside an invoice PDF. No DB writes, no number assignment — if the
 * invoice hasn't been sent yet, the number shown here is a non-destructive
 * FORECAST (same read used for Settings' "next invoice number" preview),
 * not the real assigned number. The real number is only assigned at
 * actual send (see .../send-email/route.ts) — drafting must never burn one.
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceExportData } from '@/lib/invoiceData'
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
  const tApi = await getTranslations('generateInvoicePdfApi')
  const tEmail = await getTranslations('emailApi')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  const data = await getInvoiceExportData(id)
  if (!data) {
    return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
  }
  if (!data.invoice.pdf_url) {
    return NextResponse.json({ error: tEmail('noPdfYet') }, { status: 400 })
  }

  const locale = data.invoice.language
  const l = pdfLabels(locale)
  const businessName = data.rateCard.business_name ?? ''

  let invoiceNumber = data.invoice.invoice_number
  if (!invoiceNumber) {
    // Non-destructive forecast — mirrors nextInvoiceNumberPreview() in
    // SettingsForm.tsx exactly, does not touch the counter.
    const { data: rc } = await supabase
      .from('rate_cards')
      .select('invoice_next_sequence, invoice_next_sequence_year, branding')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const year = new Date().getFullYear()
    const sequence = rc?.invoice_next_sequence_year === year ? rc.invoice_next_sequence : 1
    const prefix = (rc?.branding as { invoiceNumberPrefix?: string | null } | null)?.invoiceNumberPrefix ?? ''
    invoiceNumber = `${prefix}${year}-${String(sequence ?? 1).padStart(4, '0')}`
  }

  const subject = `${l.invoice} ${invoiceNumber} – ${businessName}`.trim()

  let body: string
  try {
    const draft = await generateEmailDraft({
      documentType: 'invoice',
      documentNumber: invoiceNumber,
      businessName,
      clientName: data.invoice.client_name,
      language: locale,
    })
    body = draft.body
  } catch (err) {
    const status = err instanceof EmailDraftError ? err.status : 502
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }

  const safeName = (data.invoice.invoice_number ?? data.invoice.client_name)
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  return NextResponse.json({
    to: data.invoice.client_email ?? '',
    ccSelf: data.rateCard.business_email ?? '',
    subject,
    body,
    attachmentFilename: `${l.invoice.toLowerCase()}-${safeName || id}.pdf`,
  })
}
