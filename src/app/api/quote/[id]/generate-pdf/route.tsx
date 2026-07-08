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

  let buffer: Buffer
  try {
    if (data.rateCard.template_html) {
      const { data: templateData, items } = buildTemplateData(data)
      const filledHtml = fillTemplate(data.rateCard.template_html, templateData, items)
      buffer = await renderHtmlToPdf(filledHtml)
    } else {
      buffer = await renderToBuffer(<ProposalPDF data={data} />)
    }
  } catch (err) {
    console.error('generate-pdf: render failed', err)
    return NextResponse.json(
      { error: 'Could not build the PDF — please try again.' },
      { status: 502 },
    )
  }

  const path = `${user.id}/${data.proposal.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('proposals')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('generate-pdf: upload failed', uploadError)
    return NextResponse.json(
      { error: 'Could not save the PDF — please try again.' },
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
    console.error('generate-pdf: saving pdf_url failed', updateError)
    return NextResponse.json(
      { error: 'The PDF was created but could not be linked to the quote — please try again.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ pdfUrl })
}
