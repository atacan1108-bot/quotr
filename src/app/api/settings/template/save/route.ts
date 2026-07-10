/**
 * Authenticated route: re-sanitizes the HTML (never trust what the client
 * already sanitized) and saves it as this contractor's active quote
 * template. Creates a rate_cards row on their behalf if they don't have
 * one yet, same as the rest of Settings.
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTemplateHtml } from '@/lib/sanitizeTemplateHtml'

const MAX_CHARS = 2 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  let body: { html?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: tErrors('invalidRequest') }, { status: 400 })
  }

  const tTemplate = await getTranslations('templateUpload')
  const html = body.html
  if (!html || !html.trim()) {
    return NextResponse.json({ error: tTemplate('noTemplateHtml') }, { status: 400 })
  }
  if (html.length > MAX_CHARS) {
    return NextResponse.json({ error: tTemplate('templateTooLarge') }, { status: 413 })
  }

  const sanitizedHtml = sanitizeTemplateHtml(html)

  const { data: existing, error: selectError } = await supabase
    .from('rate_cards').select('id').eq('owner_id', user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 })
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('rate_cards').update({ template_html: sanitizedHtml }).eq('id', existing.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  } else {
    const { error: insertError } = await supabase.from('rate_cards').insert({
      owner_id: user.id,
      template_html: sanitizedHtml,
      labour_rate_per_hour: 65, material_markup_percent: 15, vat_percent: 21,
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
