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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  const tApi = await getTranslations('generateInvoicePdfApi')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  const data = await getInvoiceExportData(id)
  if (!data) {
    return NextResponse.json({ error: tApi('invoiceNotFound') }, { status: 404 })
  }
  if (data.invoice.line_items.length === 0) {
    return NextResponse.json({ error: tApi('noLineItems') }, { status: 400 })
  }

  const logCtx = { invoiceId: id }

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
    console.error('invoice generate-pdf: render failed', { ...logCtx, error: message })
    return NextResponse.json({ error: tApi('renderFailed', { message }) }, { status: 502 })
  }

  const path = `${user.id}/${id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('invoice generate-pdf: upload to storage failed', { ...logCtx, error: uploadError })
    return NextResponse.json({ error: tApi('uploadFailed', { message: uploadError.message }) }, { status: 502 })
  }

  const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(path)
  const pdfUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ pdf_url: pdfUrl })
    .eq('id', id)

  if (updateError) {
    console.error('invoice generate-pdf: saving pdf_url failed', { ...logCtx, error: updateError })
    return NextResponse.json({ error: tApi('saveUrlFailed', { message: updateError.message }) }, { status: 502 })
  }

  return NextResponse.json({ pdfUrl })
}
