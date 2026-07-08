/**
 * Server-only route. Calls the Anthropic API to draft two blocks of prose for
 * a quote: a scope-of-work description and a client-facing cover note.
 *
 * The Anthropic API key lives in ANTHROPIC_API_KEY (server env only — see
 * .env.local) and is never sent to the browser. This route is the only place
 * in the app that talks to Anthropic.
 *
 * The model is instructed never to output prices, totals, or VAT figures —
 * all money numbers come exclusively from src/lib/pricing.ts. As a second
 * line of defense (models can still slip), the response is scanned for
 * currency/percentage patterns before it's returned; if any are found the
 * request fails rather than risk showing an invented price to a contractor.
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const MODEL = 'claude-sonnet-5'

const SYSTEM_PROMPT = `You are a copywriting assistant embedded in Quotr, an app contractors use to send price quotes to their clients. You write two short pieces of prose for each quote. You never see and must never invent prices — those are computed separately by the app's own pricing engine and inserted afterwards.

Write in clear, professional but friendly business English suited to the Dutch contracting market — direct, warm, no filler, no hard sell.

You will be given a job title, an optional client name, and a list of labour and material line items (with quantities but no cost data). Produce exactly two pieces of text:

1. scope_text — a concise scope-of-work description. Summarize the labour and materials involved in plain language a client can understand, as a short paragraph or a few sentences. This is not a legal contract clause — keep it readable.
2. cover_note — a short, warm note addressed to the client by name (3-4 sentences), the kind of thing that would appear above the quote when it's sent. Thank them, briefly frame what the quote covers, and invite them to reach out with questions.

CRITICAL — absolute rules, no exceptions:
- Never write any prices, monetary amounts, currency symbols (€, $, £), percentages, VAT figures, discounts, or totals. All pricing is handled entirely outside of you.
- Never estimate, guess, or imply a price range, even vaguely ("affordably priced", "a fraction of the cost", etc.).
- You MAY mention quantities or durations that describe the work itself, since those describe scope, not cost (e.g. "installing 12 solar panels" or "8 hours of electrical work").
- If a client name is not given, address them generically ("Hi there," or similar) rather than inventing a name.

Respond with nothing but the two text blocks in the required JSON shape.`

interface LineItemInput {
  label: string
  type: 'labour' | 'material' | 'fixed'
  quantity: number
}

interface RequestBody {
  jobTitle: string
  clientName: string | null
  lineItems: LineItemInput[]
}

interface WordingResult {
  scope_text: string
  cover_note: string
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    scope_text: { type: 'string' },
    cover_note: { type: 'string' },
  },
  required: ['scope_text', 'cover_note'],
  additionalProperties: false,
} as const

// Defense-in-depth: reject any response that looks like it contains a price,
// a percentage (VAT/markup), or a currency figure, even though the system
// prompt already forbids it.
const PRICE_LEAK_PATTERNS: RegExp[] = [
  /[€$£¥]\s?\d/,
  /\d[\d.,]*\s?(EUR|USD|GBP)\b/i,
  /\bVAT\b[^.]{0,20}?\d/i,
  /\d+(\.\d+)?\s?%/,
]

function containsPriceLeak(text: string): boolean {
  return PRICE_LEAK_PATTERNS.some(pattern => pattern.test(text))
}

function itemLine(item: LineItemInput): string {
  const qty = item.type === 'fixed' ? '' : ` — quantity: ${item.quantity}${item.type === 'labour' ? ' hours' : ''}`
  return `- ${item.label} (${item.type}${qty})`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be logged in.' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_ANTHROPIC_API_KEY_HERE') {
    return NextResponse.json(
      { error: 'AI wording isn\'t set up yet — add ANTHROPIC_API_KEY in .env.local.' },
      { status: 500 },
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const jobTitle = body.jobTitle?.trim()
  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : []
  if (!jobTitle || lineItems.length === 0) {
    return NextResponse.json({ error: 'Missing job title or line items.' }, { status: 400 })
  }
  const clientName = body.clientName?.trim() || null

  const userPrompt = `Job title: ${jobTitle}
Client name: ${clientName ?? '(not provided)'}

Line items:
${lineItems.map(itemLine).join('\n')}

Write scope_text and cover_note as instructed.`

  const client = new Anthropic({ apiKey })

  let parsed: WordingResult
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
    })

    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'The AI didn\'t return any text — please try again.' }, { status: 502 })
    }

    parsed = JSON.parse(textBlock.text) as WordingResult
  } catch (err) {
    console.error('generate-wording: Anthropic request failed', err)
    return NextResponse.json({ error: 'Could not reach the AI service — please try again.' }, { status: 502 })
  }

  if (containsPriceLeak(parsed.scope_text) || containsPriceLeak(parsed.cover_note)) {
    console.error('generate-wording: blocked a response containing a price-like pattern')
    return NextResponse.json(
      { error: 'The AI included a price, which isn\'t allowed here — please try again.' },
      { status: 422 },
    )
  }

  return NextResponse.json(parsed)
}
