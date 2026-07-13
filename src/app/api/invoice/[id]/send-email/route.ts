/**
 * Sends the (contractor-reviewed/edited) invoice email via
 * sendDocumentEmail — shared with the quote route. If the invoice is
 * still a draft (unnumbered), sending is the moment it becomes official:
 * assigns the real invoice number first (same assignInvoiceNumber() the
 * manual "Mark as sent" button uses), regenerates the PDF so the
 * attachment shows that real number (never blank/stale), THEN sends.
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceExportData } from '@/lib/invoiceData'
import { assignInvoiceNumber } from '@/lib/invoicing/assignInvoiceNumber'
import { generateAndSaveInvoicePdf } from '@/app/api/invoice/[id]/generate-pdf/route'
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
  const tApi = await getTranslations('generateInvoicePdfApi')
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
  let subject = payload.subject?.trim() ?? ''
  const body = payload.body?.trim() ?? ''
  if (!EMAIL_PATTERN.test(to)) {
    return NextResponse.json({ error: tEmail('invalidEmail') }, { status: 400 })
  }
  if (!subject || !body) {
    return NextResponse.json({ error: tEmail('missingSubjectOrBody') }, { status: 400 })
  }

  let data = await getInvoiceExportData(id)
  if (!data) {
    return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
  }

  // Sending an unnumbered (draft) invoice is what makes it official — the
  // number is assigned right here, then the PDF is rebuilt so what's
  // attached always shows the real, final number, never blank.
  if (data.invoice.status === 'draft') {
    try {
      const previewNumber = data.invoice.invoice_number ?? ''
      await assignInvoiceNumber(supabase, id)
      data = await getInvoiceExportData(id)
      if (!data) {
        return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
      }
      // The contractor's edited subject likely contains the FORECAST number
      // shown at draft time — swap in the real one if it turned out
      // different (rare: only if another invoice was numbered in between).
      const realNumber = data.invoice.invoice_number ?? ''
      if (previewNumber && realNumber && previewNumber !== realNumber && subject.includes(previewNumber)) {
        subject = subject.replaceAll(previewNumber, realNumber)
      }
      await generateAndSaveInvoicePdf(id)
      data = await getInvoiceExportData(id)
      if (!data) {
        return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('invoice send-email: numbering/PDF regeneration failed', { invoiceId: id, error: err })
      return NextResponse.json({ error: tEmail('numberingFailed', { message }) }, { status: 502 })
    }
  }

  if (!data.invoice.pdf_url) {
    return NextResponse.json({ error: tEmail('noPdfYet') }, { status: 400 })
  }

  const l = pdfLabels(data.invoice.language)
  const businessName = data.rateCard.business_name || 'Quotr'

  let attachmentBuffer: Buffer
  try {
    const res = await fetch(data.invoice.pdf_url)
    if (!res.ok) throw new Error(`PDF fetch failed with status ${res.status}`)
    attachmentBuffer = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.error('invoice send-email: could not fetch PDF for attachment', { invoiceId: id, error: err })
    return NextResponse.json({ error: tEmail('attachmentFetchFailed') }, { status: 502 })
  }

  const safeName = (data.invoice.invoice_number ?? data.invoice.client_name)
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
      attachmentFilename: `${l.invoice.toLowerCase()}-${safeName || id}.pdf`,
      attachmentBuffer,
    })
  } catch (err) {
    const message = err instanceof SendDocumentEmailError ? err.message : tErrors('somethingWentWrong')
    console.error('invoice send-email: send failed', { invoiceId: id, error: err })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  await supabase.from('invoices').update({ email_sent_to: to }).eq('id', id)

  return NextResponse.json({ sentAt, sentTo: to })
}
