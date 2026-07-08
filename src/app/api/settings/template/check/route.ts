/**
 * Authenticated route: sanitizes an uploaded HTML template and reports
 * what's usable about it — never saves anything.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTemplateHtml } from '@/lib/sanitizeTemplateHtml'
import { validateTemplate } from '@/lib/htmlTemplate'

const MAX_CHARS = 2 * 1024 * 1024 // 2MB of HTML text

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

  const sanitizedHtml = sanitizeTemplateHtml(html)
  const validation = validateTemplate(sanitizedHtml)

  return NextResponse.json({ sanitizedHtml, validation })
}
