/**
 * Server-only. Calls the Anthropic API to draft the BODY of the email a
 * contractor sends a client along with their quote/invoice PDF. Mirrors
 * generateWording.ts's structure exactly (same model, same
 * output_config/json_schema shape, same price-leak defense-in-depth) —
 * read that file first if this one is unclear, the two are deliberately
 * parallel.
 *
 * Only the body is AI-written. The subject line is built deterministically
 * by the calling API route from pdfLabels (e.g. "Offerte 2026-042 –
 * Aksoy Cleaning Services") rather than trusted to the model — one less
 * thing the price-leak guard needs to police, and it matches the exact
 * "sensible default" format requested rather than whatever format the
 * model happens to pick.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Locale } from '@/i18n/config'
import { containsPriceLeak } from '@/lib/priceLeakGuard'

const MODEL = 'claude-sonnet-5'

// The document's own language (job.language / invoice.language) drives
// this — independent of whichever contractor is logged in and clicked
// "Draft email". Natural native prose, not a translation.
const LANGUAGE_INSTRUCTION: Record<Locale, string> = {
  nl: 'Write the email entirely in natural, professional business Dutch (Nederlands). Write as a native Dutch business copywriter would — do not write in English and translate it, and avoid stiff or translation-flavored phrasing.',
  en: 'Write the email entirely in natural, professional business English. Write as a native English business copywriter would — do not write in another language and translate it, and avoid stiff or translation-flavored phrasing.',
}

const DOCUMENT_WORD: Record<Locale, Record<EmailDraftInput['documentType'], string>> = {
  nl: { quote: 'offerte', invoice: 'factuur' },
  en: { quote: 'quote', invoice: 'invoice' },
}

function systemPromptFor(locale: Locale, documentType: EmailDraftInput['documentType']): string {
  const docWord = DOCUMENT_WORD[locale][documentType]
  return `You are a copywriting assistant embedded in Stipt, an app contractors use to send ${documentType === 'quote' ? 'price quotes' : 'invoices'} to their clients. You write the BODY of a short email that accompanies a ${docWord} PDF attachment. You never see and must never invent prices, totals, or amounts — those live only in the attached PDF.

${LANGUAGE_INSTRUCTION[locale] ?? LANGUAGE_INSTRUCTION.nl} The tone is warm, professional, and brief — this is a real business email, not marketing copy. No filler, no hard sell.

You will be given the client's name, the business's name, and the ${docWord}'s reference number. Write a short email body (3-5 sentences) that:
- Greets the client by name.
- Mentions that the attached ${docWord} covers what was discussed/agreed, referring them to the attachment for the details.
- ${documentType === 'invoice' ? 'Mentions that payment details are included in the attached invoice.' : 'Invites them to reach out with any questions.'}
- Signs off warmly with the business name.

CRITICAL — absolute rules, no exceptions:
- Never write any prices, monetary amounts, currency symbols (€, $, £), percentages, VAT figures, discounts, due amounts, or totals. All figures are in the attached PDF only.
- Never estimate, guess, or imply a price range, even vaguely.
- Do not restate the reference number in a way that requires you to also invent surrounding figures — just mention it plainly if natural.
- If the client name is not given, address them generically ("Hi there," / "Beste," or similar) rather than inventing a name.

Respond with nothing but the email body in the required JSON shape.`
}

export interface EmailDraftInput {
  documentType:   'quote' | 'invoice'
  documentNumber: string
  businessName:   string
  clientName:     string
  // The document's own language — not the logged-in contractor's app language.
  language:       Locale
}

export interface EmailDraftResult {
  body: string
}

/** Carries the HTTP status the original failure corresponds to, so callers
 * that expose this over an API route can propagate it accurately. */
export class EmailDraftError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'EmailDraftError'
    this.status = status
  }
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    body: { type: 'string' },
  },
  required: ['body'],
  additionalProperties: false,
} as const

export async function generateEmailDraft(input: EmailDraftInput): Promise<EmailDraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_ANTHROPIC_API_KEY_HERE') {
    throw new EmailDraftError('AI email drafting isn\'t set up yet — add ANTHROPIC_API_KEY in .env.local.', 500)
  }

  const businessName = input.businessName?.trim() || (input.language === 'nl' ? 'Ons bedrijf' : 'Our business')
  const clientName    = input.clientName?.trim() || null
  const documentNumber = input.documentNumber?.trim() || ''

  const userPrompt = `Client name: ${clientName ?? '(not provided)'}
Business name: ${businessName}
${input.documentType === 'quote' ? 'Quote' : 'Invoice'} reference number: ${documentNumber || '(not yet assigned)'}

Write the email body as instructed.`

  const client = new Anthropic({ apiKey })

  let parsed: EmailDraftResult
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: systemPromptFor(input.language, input.documentType),
      messages: [{ role: 'user', content: userPrompt }],
      output_config: {
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
    })

    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new EmailDraftError('The AI didn\'t return any text — please try again.', 502)
    }

    parsed = JSON.parse(textBlock.text) as EmailDraftResult
  } catch (err) {
    if (err instanceof EmailDraftError) throw err
    console.error('generateEmailDraft: Anthropic request failed', err)
    throw new EmailDraftError('Could not reach the AI service — please try again.', 502)
  }

  if (containsPriceLeak(parsed.body)) {
    console.error('generateEmailDraft: blocked a response containing a price-like pattern')
    throw new EmailDraftError('The AI included a price, which isn\'t allowed here — please try again.', 422)
  }

  return parsed
}
