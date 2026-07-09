/**
 * Renders the branded proposal PDF, uploads it to Supabase Storage, and
 * saves the resulting public URL onto the proposal's pdf_url column.
 *
 * Unlike /api/quote/[id]/pdf (which streams a fresh PDF straight to the
 * browser for an immediate download), this route persists the PDF so it
 * can be linked to or previewed later — e.g. from the public share page.
 *
 * Two rendering paths:
 *  - rate_cards.template_html set → fill the contractor's own uploaded
 *    HTML design with real quote data and render it with headless
 *    Chromium (renderHtmlToPdf).
 *  - not set (the default/unchanged behavior for every existing
 *    contractor) → the built-in @react-pdf/renderer ProposalPDF, exactly
 *    as before.
 */
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getQuoteExportData } from '@/lib/quoteData'
import { ProposalPDF } from '@/app/quotes/[id]/ProposalPDF'
import { fillTemplate } from '@/lib/htmlTemplate'
import { buildTemplateData } from '@/lib/pdf/buildTemplateData'
import { renderHtmlToPdf } from '@/lib/pdf/renderHtmlPdf'

// Headless-Chromium cold start + render can take longer than Next.js/Vercel's
// default function timeout, especially on a cold serverless invocation —
// this is a Vercel-respected route-segment config, not just documentation.
export const maxDuration = 60

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 })
  }

  const headersList = await headers()
  const host  = headersList.get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  const data = await getQuoteExportData(id, baseUrl)
  if (!data) {
    return NextResponse.json({ error: 'Quote not found.' }, { status: 404 })
  }
  if (!data.proposal) {
    return NextResponse.json({ error: 'This quote doesn\'t have a saved proposal yet.' }, { status: 400 })
  }

  const logCtx = { proposalId: data.proposal.id, jobId: id, hasTemplate: !!data.rateCard.template_html }

  let buffer: Buffer
  let fellBack = false
  let fallbackReason: string | null = null

  if (data.rateCard.template_html) {
    try {
      // Stage (d): replace {{tokens}} and expand the line-item region.
      const { data: templateData, items } = buildTemplateData(data)
      const filledHtml = fillTemplate(data.rateCard.template_html, templateData, items)
      console.log('generate-pdf: filled template HTML', { ...logCtx, filledHtmlLength: filledHtml.length, itemCount: items.length })
      if (!filledHtml.trim()) {
        throw new Error('Token replacement produced empty HTML — the uploaded template may be malformed.')
      }

      // Stage (e): launch headless Chromium and render to PDF.
      buffer = await renderHtmlToPdf(filledHtml)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('generate-pdf: custom template render failed — falling back to built-in design', {
        ...logCtx,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
        cause: (err as { cause?: unknown })?.cause,
      })
      fellBack = true
      fallbackReason = message

      try {
        buffer = await renderToBuffer(<ProposalPDF data={data} />)
      } catch (fallbackErr) {
        console.error('generate-pdf: fallback render also failed', { ...logCtx, error: fallbackErr })
        return NextResponse.json(
          { error: `Your custom template failed (${message}), and the backup design also failed to render. Please try again.` },
          { status: 502 },
        )
      }
    }
  } else {
    try {
      // No custom template on file — the original, unchanged built-in design.
      buffer = await renderToBuffer(<ProposalPDF data={data} />)
    } catch (err) {
      console.error('generate-pdf: built-in render failed', { ...logCtx, error: err })
      return NextResponse.json(
        { error: `Could not build the PDF: ${err instanceof Error ? err.message : 'unknown rendering error'}` },
        { status: 502 },
      )
    }
  }

  // Stage (f): upload to Supabase Storage and save proposals.pdf_url.
  const path = `${user.id}/${data.proposal.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('proposals')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('generate-pdf: upload to storage failed', { ...logCtx, error: uploadError })
    return NextResponse.json(
      { error: `Could not upload the PDF to storage: ${uploadError.message}` },
      { status: 502 },
    )
  }

  const { data: publicUrlData } = supabase.storage.from('proposals').getPublicUrl(path)
  const pdfUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from('proposals')
    .update({ pdf_url: pdfUrl })
    .eq('id', data.proposal.id)

  if (updateError) {
    console.error('generate-pdf: saving pdf_url failed', { ...logCtx, error: updateError })
    return NextResponse.json(
      { error: `The PDF was created but could not be saved to the quote: ${updateError.message}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ pdfUrl, fellBack, fallbackReason })
}
