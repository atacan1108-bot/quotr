/**
 * Shared defense-in-depth check for any AI-generated customer-facing text
 * that must never contain a price: quote/invoice wording (generateWording.ts)
 * and email drafts (generateEmailDraft.ts). The system prompt in each caller
 * already instructs the model never to write prices — this is the second
 * line of defense in case a model slips anyway.
 *
 * Extracted verbatim from generateWording.ts (same regexes, same behavior)
 * so both callers share one guard instead of two copies that could drift.
 */
const PRICE_LEAK_PATTERNS: RegExp[] = [
  /[€$£¥]\s?\d/,
  /\d[\d.,]*\s?(EUR|USD|GBP)\b/i,
  /\bVAT\b[^.]{0,20}?\d/i,
  /\d+(\.\d+)?\s?%/,
]

export function containsPriceLeak(text: string): boolean {
  return PRICE_LEAK_PATTERNS.some(pattern => pattern.test(text))
}
