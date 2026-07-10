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
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getQuoteExportData } from '@/lib/quoteData'
import { ProposalPDF } from '@/app/quotes/[id]/ProposalPDF'
import { fillTemplate } from '@/lib/htmlTemplate'
import { buildTemplateData } from '@/lib/pdf/buildTemplateData'
import { renderHtmlToPdf } from '@/lib/pdf/renderHtmlPdf'
import { generateWording, WordingGenerationError } from '@/lib/generateWording'

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
  const tErrors = await getTranslations('errors')
  const tApi    = await getTranslations('generatePdfApi')
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
  if (!data.proposal) {
    return NextResponse.json({ error: tApi('noProposalYet') }, { status: 400 })
  }
  // Captured once, up front — `data.proposal` gets reassigned below when
  // wording is auto-generated, which erases TypeScript's null-narrowing on
  // the property for the rest of this function.
  const proposalId = data.proposal.id

  // Guard: never render a PDF from zero line items — one-off and recurring
  // quotes share the exact same job.line_items source now.
  const isRecurring   = data.job.quote_type === 'recurring'
  const lineItemCount = data.job.line_items.length
  if (lineItemCount === 0) {
    return NextResponse.json(
      { error: tApi('noLineItems') },
      { status: 400 },
    )
  }

  // The built-in design (ProposalPDF) only understands one-off pricing —
  // for a recurring quote with no custom template there's nothing correct
  // to fall back to, so refuse clearly instead of rendering the wrong thing.
  if (isRecurring && !data.rateCard.template_html) {
    return NextResponse.json(
      { error: tApi('recurringNeedsTemplate') },
      { status: 400 },
    )
  }

  const logCtx = {
    proposalId: data.proposal.id, jobId: id,
    hasTemplate: !!data.rateCard.template_html, quoteType: data.job.quote_type, lineItemCount,
  }

  // Guard: a PDF must never go out with a silently blank cover note or
  // scope of work. "Generate wording" is a separate, skippable manual step
  // on the quote page — if it was never run (or only ran halfway), generate
  // and save the missing piece(s) now rather than rendering an incomplete
  // document. If generation itself fails, fail the PDF request with a
  // specific reason instead of producing one with a blank section.
  if (!data.proposal.cover_note?.trim() || !data.proposal.scope_text?.trim()) {
    try {
      const wording = await generateWording({
        jobTitle:   data.job.title,
        clientName: data.job.clients?.name ?? null,
        quoteType:  data.job.quote_type,
        language:   data.job.language,
        ...(isRecurring
          ? { recurringConfig: data.job.recurring_config }
          : { lineItems: data.job.line_items.map(i => ({ label: i.label, type: i.type, quantity: i.quantity })) }),
      })

      const { data: updatedProposal, error: wordingSaveError } = await supabase
        .from('proposals')
        .update({ cover_note: wording.cover_note, scope_text: wording.scope_text })
        .eq('id', proposalId)
        .select()
        .single()
      if (wordingSaveError) throw wordingSaveError

      data.proposal = updatedProposal
      console.log('generate-pdf: auto-generated missing wording', logCtx)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('generate-pdf: could not auto-generate missing wording', { ...logCtx, error: message })
      return NextResponse.json(
        { error: tApi('wordingAutoGenerateFailed', { message }) },
        { status: err instanceof WordingGenerationError ? err.status : 502 },
      )
    }
  }

  let buffer: Buffer
  let fellBack = false
  let fallbackReason: string | null = null

  if (data.rateCard.template_html) {
    try {
      // Stage (d): replace {{tokens}} and expand the line-item region.
      const { data: templateData, items, isRecurring: isRecurringData } = buildTemplateData(data)
      console.log('generate-pdf: built template data', { ...logCtx, itemCount: items.length })
      if (items.length === 0) {
        // Should be unreachable — the lineItemCount guard above already
        // caught this — but this is the exact failure mode that produced a
        // blank PDF before, so it gets its own explicit, specific check.
        throw new Error('No line items were passed to the template — refusing to render an empty quote.')
      }

      const filledHtml = fillTemplate(data.rateCard.template_html, templateData, items, isRecurringData)
      console.log('generate-pdf: filled template HTML', { ...logCtx, filledHtmlLength: filledHtml.length })
      if (!filledHtml.trim()) {
        throw new Error('Token replacement produced empty HTML — the uploaded template may be malformed.')
      }

      // Stage (e): launch headless Chromium and render to PDF.
      buffer = await renderHtmlToPdf(filledHtml)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('generate-pdf: custom template render failed', {
        ...logCtx,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
        cause: (err as { cause?: unknown })?.cause,
      })

      // The built-in design only understands one-off pricing — falling back
      // to it for a recurring quote would just reproduce the original
      // blank-PDF bug in a different shape, so recurring quotes fail
      // loudly here instead of silently rendering the wrong thing.
      if (isRecurring) {
        return NextResponse.json(
          { error: tApi('templateRenderFailed', { message }) },
          { status: 502 },
        )
      }

      fellBack = true
      fallbackReason = message

      try {
        buffer = await renderToBuffer(<ProposalPDF data={data} />)
      } catch (fallbackErr) {
        console.error('generate-pdf: fallback render also failed', { ...logCtx, error: fallbackErr })
        return NextResponse.json(
          { error: tApi('templateAndFallbackFailed', { message }) },
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
        { error: tApi('builtInRenderFailed', { message: err instanceof Error ? err.message : 'unknown rendering error' }) },
        { status: 502 },
      )
    }
  }

  // Stage (f): upload to Supabase Storage and save proposals.pdf_url.
  const path = `${user.id}/${proposalId}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('proposals')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('generate-pdf: upload to storage failed', { ...logCtx, error: uploadError })
    return NextResponse.json(
      { error: tApi('uploadFailed', { message: uploadError.message }) },
      { status: 502 },
    )
  }

  const { data: publicUrlData } = supabase.storage.from('proposals').getPublicUrl(path)
  const pdfUrl = publicUrlData.publicUrl

  const { error: updateError } = await supabase
    .from('proposals')
    .update({ pdf_url: pdfUrl })
    .eq('id', proposalId)

  if (updateError) {
    console.error('generate-pdf: saving pdf_url failed', { ...logCtx, error: updateError })
    return NextResponse.json(
      { error: tApi('saveUrlFailed', { message: updateError.message }) },
      { status: 502 },
    )
  }

  return NextResponse.json({ pdfUrl, fellBack, fallbackReason })
}
