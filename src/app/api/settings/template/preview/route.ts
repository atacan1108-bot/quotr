/**
 * Authenticated route: renders an uploaded template with realistic sample
 * data to an actual PDF, via the same fill + headless-Chromium pipeline
 * used for real quotes — so what a contractor sees here is exactly what
 * their customers will get, not just an HTML approximation. Never saves
 * anything.
 */
import { NextResponse } from 'next/server'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTemplateHtml } from '@/lib/sanitizeTemplateHtml'
import { fillTemplate } from '@/lib/htmlTemplate'
import { renderHtmlToPdf } from '@/lib/pdf/renderHtmlPdf'
import { getSampleTemplateData, getSampleTemplateItems } from '@/lib/pdf/sampleTemplateData'
import { LOCALES } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

const MAX_CHARS = 2 * 1024 * 1024

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  let body: { html?: string; isRecurring?: boolean; locale?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: tErrors('invalidRequest') }, { status: 400 })
  }
  const previewLocale: Locale = LOCALES.includes(body.locale as Locale) ? (body.locale as Locale) : await getLocale() as Locale

  const tTemplate = await getTranslations('templateUpload')
  const html = body.html
  if (!html || !html.trim()) {
    return NextResponse.json({ error: tTemplate('noTemplateHtml') }, { status: 400 })
  }
  if (html.length > MAX_CHARS) {
    return NextResponse.json({ error: tTemplate('templateTooLarge') }, { status: 413 })
  }

  try {
    const sanitizedHtml = sanitizeTemplateHtml(html)
    const filledHtml = fillTemplate(sanitizedHtml, getSampleTemplateData(previewLocale), getSampleTemplateItems(previewLocale), body.isRecurring ?? false)
    const pdf = await renderHtmlToPdf(filledHtml)
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('template/preview: render failed', { error: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : tTemplate('previewFailed') },
      { status: 502 },
    )
  }
}
