/**
 * Sends the (contractor-reviewed/edited) invoice email via
 * sendDocumentEmail — shared with the quote route. If the invoice is
 * still a draft (unnumbered), sending is the moment it becomes official:
 * assigns the real invoice number first (same assignInvoiceNumber() the
 * manual "Mark as sent" button uses), regenerates the PDF so the
 * attachment shows that real number (never blank/stale), THEN sends.
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceExportData } from '@/lib/invoiceData'
import { assignInvoiceNumber } from '@/lib/invoicing/assignInvoiceNumber'
import { generateAndSaveInvoicePdf } from '@/app/api/invoice/[id]/generate-pdf/route'
import { sendDocumentEmail, SendDocumentEmailError } from '@/lib/sendDocumentEmail'
import { createInvoicePayment, CreateInvoicePaymentError } from '@/lib/mollie/createInvoicePayment'
import { pdfLabels } from '@/lib/pdf/pdfLabels'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A still-draft invoice's send can trigger a full headless-Chromium PDF
// rebuild (see generateAndSaveInvoicePdf below) — needs the same Node
// runtime + generous timeout as the PDF-generation routes themselves, not
// the platform's short default.
export const runtime = 'nodejs'
export const maxDuration = 60

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

  // A fresh Mollie payment (and thus a fresh checkout link) on EVERY send —
  // iDEAL checkout sessions expire, so reusing an old link from a previous
  // send/resend would risk sending the client a dead link. Deliberately
  // soft-fail: Mollie not being set up yet (or rejecting the request) must
  // never block the invoice email itself from going out — the contractor
  // still gets to send invoices normally, just without a Pay-now button
  // until Mollie is configured. The specific reason is surfaced back to
  // the contractor in the response so it's never a silent gap.
  let paymentLinkWarning: string | null = null
  console.log('invoice send-email: payment-link block', { invoiceId: id, invoiceStatus: data.invoice.status, willAttempt: data.invoice.status !== 'paid' })
  if (data.invoice.status !== 'paid') {
    try {
      const headersList = await headers()
      const host = headersList.get('host') ?? 'localhost:3000'
      const proto = host.includes('localhost') ? 'http' : 'https'
      const baseUrl = `${proto}://${host}`
      const { checkoutUrl, paymentId } = await createInvoicePayment(supabase, data, baseUrl)
      console.log('invoice send-email: Mollie payment created', { invoiceId: id, paymentId, checkoutUrl })
      // Re-render the PDF so the ATTACHED file also shows the fresh
      // Pay-now button/link, not the one baked in at a previous send (or
      // none at all, on a first send) — same "never attach a stale
      // document" rule already applied to invoice numbering above.
      await generateAndSaveInvoicePdf(id)
      data = await getInvoiceExportData(id)
      if (!data) {
        return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
      }
      console.log('invoice send-email: invoice after PDF regeneration', { invoiceId: id, mollieCheckoutUrl: data.invoice.mollie_checkout_url })
    } catch (err) {
      const message = err instanceof CreateInvoicePaymentError ? err.message : (err instanceof Error ? err.message : String(err))
      console.error('invoice send-email: could not create Mollie payment link', { invoiceId: id, error: err })
      paymentLinkWarning = message
    }
  }
  // TypeScript can't carry the earlier non-null narrowing of `data` across
  // the try/catch above (the catch path doesn't reassign it) — this is
  // unreachable in practice (data was already confirmed non-null before
  // entering the block, and the catch above doesn't null it out), but
  // satisfies the type checker the same way the guards above do.
  if (!data || !data.invoice.pdf_url) {
    return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
  }

  const l = pdfLabels(data.invoice.language)
  const businessName = data.rateCard.business_name || 'Stipt'

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
      paymentUrl: data.invoice.mollie_checkout_url,
      payNowLabel: l.payNow,
    })
  } catch (err) {
    const message = err instanceof SendDocumentEmailError ? err.message : tErrors('somethingWentWrong')
    console.error('invoice send-email: send failed', { invoiceId: id, error: err })
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const sentAt = new Date().toISOString()
  await supabase.from('invoices').update({ email_sent_to: to }).eq('id', id)

  return NextResponse.json({ sentAt, sentTo: to, paymentLinkWarning })
}
