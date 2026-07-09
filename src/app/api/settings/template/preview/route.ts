/**
 * Authenticated route: renders an uploaded template with realistic sample
 * data to an actual PDF, via the same fill + headless-Chromium pipeline
 * used for real quotes — so what a contractor sees here is exactly what
 * their customers will get, not just an HTML approximation. Never saves
 * anything.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTemplateHtml } from '@/lib/sanitizeTemplateHtml'
import { fillTemplate } from '@/lib/htmlTemplate'
import { renderHtmlToPdf } from '@/lib/pdf/renderHtmlPdf'
import { SAMPLE_TEMPLATE_DATA, SAMPLE_TEMPLATE_ITEMS } from '@/lib/pdf/sampleTemplateData'

const MAX_CHARS = 2 * 1024 * 1024

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 })
  }

  let body: { html?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const html = body.html
  if (!html || !html.trim()) {
    return NextResponse.json({ error: 'No template HTML was sent.' }, { status: 400 })
  }
  if (html.length > MAX_CHARS) {
    return NextResponse.json({ error: 'That template is too large — please simplify it.' }, { status: 413 })
  }

  try {
    const sanitizedHtml = sanitizeTemplateHtml(html)
    const filledHtml = fillTemplate(sanitizedHtml, SAMPLE_TEMPLATE_DATA, SAMPLE_TEMPLATE_ITEMS)
    const pdf = await renderHtmlToPdf(filledHtml)
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('template/preview: render failed', { error: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not render a preview — please try again.' },
      { status: 502 },
    )
  }
}
