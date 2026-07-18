/**
 * Server-only. Calls the Anthropic API to draft two blocks of prose for a
 * quote: a scope-of-work description and a client-facing cover note.
 *
 * Shared by two callers:
 *  - /api/generate-wording — the manual "Generate wording" button on the
 *    quote page.
 *  - /api/quote/[id]/generate-pdf — auto-invoked if a quote's wording is
 *    still missing when a PDF is requested, so a PDF is never produced
 *    with a silently blank cover note or scope of work.
 *
 * The model is instructed never to output prices, totals, or VAT figures —
 * all money numbers come exclusively from src/lib/pricing.ts. As a second
 * line of defense (models can still slip), the response is scanned for
 * currency/percentage patterns before it's returned; if any are found this
 * throws rather than risk showing an invented price to a contractor.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Locale } from '@/i18n/config'
import { containsPriceLeak } from '@/lib/priceLeakGuard'

const MODEL = 'claude-sonnet-5'

// The QUOTE's own language (see src/i18n/config.ts) drives which language
// the AI writes in — independent of whichever contractor is logged in and
// clicked "Generate wording". Natural native prose, not a translation.
const LANGUAGE_INSTRUCTION: Record<Locale, string> = {
  nl: 'Write BOTH pieces of text entirely in natural, professional business Dutch (Nederlands). Write as a native Dutch business copywriter would — do not write in English and translate it, and avoid stiff or translation-flavored phrasing.',
  en: 'Write BOTH pieces of text entirely in natural, professional business English. Write as a native English business copywriter would — do not write in another language and translate it, and avoid stiff or translation-flavored phrasing.',
}

function systemPromptFor(locale: Locale): string {
  return `You are a copywriting assistant embedded in Stipt, an app contractors use to send price quotes to their clients. You write two short pieces of prose for each quote. You never see and must never invent prices — those are computed separately by the app's own pricing engine and inserted afterwards.

${LANGUAGE_INSTRUCTION[locale] ?? LANGUAGE_INSTRUCTION.nl} The writing style is clear, professional but friendly, suited to the Dutch contracting market — direct, warm, no filler, no hard sell.

You will be given a job title, an optional client name, and either (a) a list of labour and material line items (with quantities but no cost data) for a one-off job, or (b) a recurring service contract's schedule (days/week, weeks/year, contract length, notice period, auto-renewal — no cost data). Produce exactly two pieces of text:

1. scope_text — a concise scope-of-work description. Summarize the labour and materials involved in plain language a client can understand, as a short paragraph or a few sentences. This is not a legal contract clause — keep it readable.
2. cover_note — a short, warm note addressed to the client by name (3-4 sentences), the kind of thing that would appear above the quote when it's sent. Thank them, briefly frame what the quote covers, and invite them to reach out with questions.

CRITICAL — absolute rules, no exceptions:
- Never write any prices, monetary amounts, currency symbols (€, $, £), percentages, VAT figures, discounts, or totals. All pricing is handled entirely outside of you.
- Never estimate, guess, or imply a price range, even vaguely ("affordably priced", "a fraction of the cost", etc.).
- You MAY mention quantities or durations that describe the work itself, since those describe scope, not cost (e.g. "installing 12 solar panels" or "8 hours of electrical work").
- If a client name is not given, address them generically ("Hi there," or similar) rather than inventing a name.

Respond with nothing but the two text blocks in the required JSON shape.`
}

export interface WordingLineItemInput {
  label:    string
  type:     'labour' | 'material' | 'fixed'
  quantity: number
}

export interface WordingRecurringConfigInput {
  days_per_week:        number
  weeks_per_year:       number
  contract_term_months: number
  notice_period_months: number | null
  auto_renewal:          boolean
}

export interface WordingInput {
  jobTitle:        string
  clientName:      string | null
  quoteType:       'one_off' | 'recurring'
  lineItems?:      WordingLineItemInput[]
  recurringConfig?: WordingRecurringConfigInput | null
  // The QUOTE's own language — not the logged-in contractor's app language.
  language:        Locale
}

export interface WordingResult {
  scope_text: string
  cover_note: string
}

/** Carries the HTTP status the original failure corresponds to, so callers
 * that expose this over an API route can propagate it accurately. */
export class WordingGenerationError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'WordingGenerationError'
    this.status = status
  }
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

function itemLine(item: WordingLineItemInput): string {
  const qty = item.type === 'fixed' ? '' : ` — quantity: ${item.quantity}${item.type === 'labour' ? ' hours' : ''}`
  return `- ${item.label} (${item.type}${qty})`
}

export async function generateWording(input: WordingInput): Promise<WordingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_ANTHROPIC_API_KEY_HERE') {
    throw new WordingGenerationError('AI wording isn\'t set up yet — add ANTHROPIC_API_KEY in .env.local.', 500)
  }

  const jobTitle   = input.jobTitle?.trim()
  const clientName = input.clientName?.trim() || null
  const quoteType  = input.quoteType === 'recurring' ? 'recurring' : 'one_off'

  if (!jobTitle) {
    throw new WordingGenerationError('Missing job title.', 400)
  }

  let contextBlock: string
  if (quoteType === 'recurring') {
    const rc = input.recurringConfig
    if (!rc || !rc.days_per_week || !rc.weeks_per_year || !rc.contract_term_months) {
      throw new WordingGenerationError('Missing contract terms.', 400)
    }
    contextBlock = `This is a recurring service contract, not a one-off job.
Schedule: ${rc.days_per_week} days per week, ${rc.weeks_per_year} weeks per year.
Contract length: ${rc.contract_term_months} months${rc.notice_period_months ? `, with a ${rc.notice_period_months}-month notice period` : ''}.
${rc.auto_renewal ? 'The contract automatically renews after the term.' : 'The contract ends at the end of the term unless renewed.'}`
  } else {
    const lineItems = input.lineItems ?? []
    if (lineItems.length === 0) {
      throw new WordingGenerationError('Missing line items.', 400)
    }
    contextBlock = `Line items:\n${lineItems.map(itemLine).join('\n')}`
  }

  const userPrompt = `Job title: ${jobTitle}
Client name: ${clientName ?? '(not provided)'}

${contextBlock}

Write scope_text and cover_note as instructed.`

  const client = new Anthropic({ apiKey })

  let parsed: WordingResult
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPromptFor(input.language),
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
    })

    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new WordingGenerationError('The AI didn\'t return any text — please try again.', 502)
    }

    parsed = JSON.parse(textBlock.text) as WordingResult
  } catch (err) {
    if (err instanceof WordingGenerationError) throw err
    console.error('generateWording: Anthropic request failed', err)
    throw new WordingGenerationError('Could not reach the AI service — please try again.', 502)
  }

  if (containsPriceLeak(parsed.scope_text) || containsPriceLeak(parsed.cover_note)) {
    console.error('generateWording: blocked a response containing a price-like pattern')
    throw new WordingGenerationError('The AI included a price, which isn\'t allowed here — please try again.', 422)
  }

  return parsed
}
