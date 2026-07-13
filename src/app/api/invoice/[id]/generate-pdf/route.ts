/**
 * Renders the invoice PDF, uploads it to Supabase Storage, and saves the
 * resulting public URL onto invoices.pdf_url. Mirrors
 * /api/quote/[id]/generate-pdf's shape, but simpler: invoices always use
 * the one built-in HTML template (no contractor-uploaded design, no
 * react-pdf fallback path — see the plan's Phase 3 decision) and never
 * auto-generate AI wording (invoices have no AI-written content at all).
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceExportData } from '@/lib/invoiceData'
import { DEFAULT_INVOICE_TEMPLATE_HTML, injectInvoiceBrandColors } from '@/lib/pdf/defaultInvoiceTemplate'
import { buildInvoiceTemplateData } from '@/lib/pdf/invoiceTemplateData'
import { fillInvoiceTemplate, buildInvoiceFooterTemplate, INVOICE_FOOTER_HEIGHT } from '@/lib/pdf/invoiceTemplate'
import { renderHtmlToPdf } from '@/lib/pdf/renderHtmlPdf'

export const maxDuration = 60

/** Thrown by generateAndSaveInvoicePdf with a plain, technical message —
 * callers translate/wrap it for their own audience (the route below wraps
 * it via generateInvoicePdfApi; send-email/route.ts wraps it via emailApi). */
export class GenerateInvoicePdfError extends Error {
  status: number
  stage?: 'render' | 'upload' | 'saveUrl'
  constructor(message: string, status = 502, stage?: 'render' | 'upload' | 'saveUrl') {
    super(message)
    this.name = 'GenerateInvoicePdfError'
    this.status = status
    this.stage = stage
  }
}

/**
 * Renders the invoice PDF, uploads it, and saves invoices.pdf_url. Pure,
 * reusable core — both this route's own POST handler and
 * /api/invoice/[id]/send-email (which needs to regenerate the PDF right
 * after assigning a real invoice number, so the attachment never shows a
 * blank/stale number) call this instead of duplicating the render/upload
 * steps.
 */
export async function generateAndSaveInvoicePdf(invoiceId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new GenerateInvoicePdfError('Not logged in.', 401)

  const data = await getInvoiceExportData(invoiceId)
  if (!data) throw new GenerateInvoicePdfError('Invoice not found.', 404)
  if (data.invoice.line_items.length === 0) throw new GenerateInvoicePdfError('No line items.', 400)

  const logCtx = { invoiceId }

  let buffer: Buffer
  try {
    const { data: templateData, items, vatRows, options } = buildInvoiceTemplateData(data)
    const template = injectInvoiceBrandColors(
      DEFAULT_INVOICE_TEMPLATE_HTML,
      data.rateCard.branding?.primaryColor,
      data.rateCard.branding?.accentColor,
    )
    const filledHtml = fillInvoiceTemplate(template, templateData, items, vatRows, options)

    buffer = await renderHtmlToPdf(filledHtml, {
      footerTemplate: buildInvoiceFooterTemplate(templateData, data.invoice.language),
      footerHeight: INVOICE_FOOTER_HEIGHT,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('generateAndSaveInvoicePdf: render failed', { ...logCtx, error: message })
    throw new GenerateInvoicePdfError(message, 502, 'render')
  }

  const path = `${user.id}/${invoiceId}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('generateAndSaveInvoicePdf: upload to storage failed', { ...logCtx, error: uploadError })
    throw new GenerateInvoicePdfError(uploadError.message, 502, 'upload')
  }

  const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(path)
  const pdfUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ pdf_url: pdfUrl })
    .eq('id', invoiceId)

  if (updateError) {
    console.error('generateAndSaveInvoicePdf: saving pdf_url failed', { ...logCtx, error: updateError })
    throw new GenerateInvoicePdfError(updateError.message, 502, 'saveUrl')
  }

  return pdfUrl
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const tErrors = await getTranslations('errors')
  const tApi = await getTranslations('generateInvoicePdfApi')

  try {
    const pdfUrl = await generateAndSaveInvoicePdf(id)
    return NextResponse.json({ pdfUrl })
  } catch (err) {
    if (err instanceof GenerateInvoicePdfError && err.status === 401) {
      return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
    }
    if (err instanceof GenerateInvoicePdfError && err.status === 404) {
      return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
    }
    if (err instanceof GenerateInvoicePdfError && err.status === 400) {
      return NextResponse.json({ error: tApi('noLineItems') }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof GenerateInvoicePdfError && err.stage === 'upload') {
      return NextResponse.json({ error: tApi('uploadFailed', { message }) }, { status: 502 })
    }
    if (err instanceof GenerateInvoicePdfError && err.stage === 'saveUrl') {
      return NextResponse.json({ error: tApi('saveUrlFailed', { message }) }, { status: 502 })
    }
    return NextResponse.json({ error: tApi('renderFailed', { message }) }, { status: 502 })
  }
}
