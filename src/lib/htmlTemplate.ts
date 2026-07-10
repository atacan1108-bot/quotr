/**
 * Fills a contractor-authored HTML quote template with real quote data.
 * ONE template system for both one-off and recurring quotes — line items
 * always use the same tokens either way.
 *
 * Three mechanisms:
 *  - Scalar tokens: {{token_name}} anywhere in the document, replaced with
 *    an HTML-escaped string (safe in both text nodes and quoted attributes,
 *    e.g. src="{{business_logo}}").
 *  - Line items: a repeating region between the literal HTML comments
 *    <!-- LINE_ITEMS_START --> and <!-- LINE_ITEMS_END -->. Everything
 *    between the markers is treated as the row template and repeated once
 *    per line item, with item_* tokens filled per row. Same region, same
 *    tokens, for both quote types.
 *  - Recurring section: an OPTIONAL region between
 *    <!-- RECURRING_START --> and <!-- RECURRING_END -->. Its content is
 *    kept (with tokens filled) only for recurring quotes — for a one-off
 *    quote the whole region, markers included, is removed, so a template
 *    author can put contract-terms headings/labels inside it without
 *    worrying about them showing up empty on a one-off PDF.
 *
 * All money figures are pre-formatted strings handed in from the pricing
 * engine's output (via buildTemplateData) — this module never computes or
 * rounds a number, it only substitutes text. SERVER-ONLY.
 */

export interface TemplateData {
  [key: string]:     string
  business_logo:     string
  business_name:     string
  business_address:  string
  business_email:    string
  business_phone:    string
  business_website:  string
  business_kvk:       string
  business_btw:       string
  business_iban:      string
  customer_name:     string
  customer_address:  string
  customer_email:    string
  customer_phone:    string
  quote_number:      string
  quote_date:        string
  cover_note:        string
  scope_text:        string
  subtotal:          string
  vat_percent:       string
  vat_amount:        string
  total:             string
  terms_text:        string
  footer_text:       string
  // Recurring quotes only — meaningful inside a <!-- RECURRING_START/END -->
  // region (see above). Blank for one-off quotes. See buildTemplateData.
  total_per_week:        string
  total_per_month:       string
  total_per_year:        string
  total_contract_term:   string
  contract_term_months:  string
  notice_period_months:  string
  // Static-label tokens — one template serves both languages. Resolved
  // from src/lib/pdf/pdfLabels.ts by job.language, not the token system
  // itself. A template author uses these instead of typing "Subtotaal"/
  // "Subtotal" etc. directly.
  lbl_quote:                  string
  lbl_quote_for:              string
  lbl_a_note_from:            string
  lbl_client:                 string
  lbl_from:                   string
  lbl_details:                string
  lbl_quote_number:           string
  lbl_date:                   string
  lbl_description:            string
  lbl_quantity:                string
  lbl_rate:                   string
  lbl_amount:                 string
  lbl_subtotal:               string
  lbl_vat:                    string
  lbl_total:                  string
  lbl_scope_of_work:          string
  lbl_terms_and_conditions:   string
  lbl_for_approval_contractor: string
  lbl_for_approval_client:    string
  lbl_signature_and_date:     string
  lbl_initials:               string
  lbl_page:                   string
  lbl_of:                     string
  lbl_dear:                   string
}

/** One repeated row in the LINE_ITEMS region — identical for both quote types. */
export interface TemplateLineItem {
  [key: string]:    string
  item_label:       string
  item_quantity:    string
  item_unit_price:  string
  item_total:       string
}

export const SCALAR_TOKENS = [
  'business_logo', 'business_name', 'business_address', 'business_email',
  'business_phone', 'business_website', 'business_kvk', 'business_btw', 'business_iban',
  'customer_name', 'customer_address', 'customer_email', 'customer_phone',
  'quote_number', 'quote_date', 'cover_note', 'scope_text',
  'subtotal', 'vat_percent', 'vat_amount', 'total', 'terms_text', 'footer_text',
  'total_per_week', 'total_per_month', 'total_per_year', 'total_contract_term',
  'contract_term_months', 'notice_period_months',
  'lbl_quote', 'lbl_quote_for', 'lbl_a_note_from', 'lbl_client', 'lbl_from', 'lbl_details', 'lbl_quote_number', 'lbl_date',
  'lbl_description', 'lbl_quantity', 'lbl_rate', 'lbl_amount', 'lbl_subtotal', 'lbl_vat', 'lbl_total',
  'lbl_scope_of_work', 'lbl_terms_and_conditions', 'lbl_for_approval_contractor',
  'lbl_for_approval_client', 'lbl_signature_and_date', 'lbl_initials', 'lbl_page', 'lbl_of', 'lbl_dear',
] as const satisfies readonly (keyof TemplateData)[]

export const LINE_ITEM_TOKENS = ['item_label', 'item_quantity', 'item_unit_price', 'item_total'] as const

const LINE_ITEMS_REGION  = /<!--\s*LINE_ITEMS_START\s*-->([\s\S]*?)<!--\s*LINE_ITEMS_END\s*-->/
const RECURRING_REGION   = /<!--\s*RECURRING_START\s*-->([\s\S]*?)<!--\s*RECURRING_END\s*-->/

/**
 * sanitize-html (like most HTML sanitizers) strips comments outright, which
 * would destroy the *_START/*_END markers. sanitizeTemplateHtml() uses
 * these to pull each region out into a plain-text placeholder before
 * sanitizing, then puts real comments back afterwards — safe to call
 * through sanitization any number of times.
 */
const LINE_ITEMS_PLACEHOLDER = 'QUOTR_LINE_ITEMS_PLACEHOLDER_x7f2k9'
const RECURRING_PLACEHOLDER  = 'QUOTR_RECURRING_PLACEHOLDER_k9m3p1'

export function extractLineItemsRegion(html: string): { outerWithPlaceholder: string; rowTemplate: string } | null {
  const match = html.match(LINE_ITEMS_REGION)
  if (!match) return null
  return {
    outerWithPlaceholder: html.replace(LINE_ITEMS_REGION, LINE_ITEMS_PLACEHOLDER),
    rowTemplate: match[1],
  }
}

export function reinsertLineItemsRegion(outerWithPlaceholder: string, rowTemplate: string): string {
  return outerWithPlaceholder.replace(
    LINE_ITEMS_PLACEHOLDER,
    () => `<!-- LINE_ITEMS_START -->${rowTemplate}<!-- LINE_ITEMS_END -->`,
  )
}

export function extractRecurringRegion(html: string): { outerWithPlaceholder: string; innerTemplate: string } | null {
  const match = html.match(RECURRING_REGION)
  if (!match) return null
  return {
    outerWithPlaceholder: html.replace(RECURRING_REGION, RECURRING_PLACEHOLDER),
    innerTemplate: match[1],
  }
}

export function reinsertRecurringRegion(outerWithPlaceholder: string, innerTemplate: string): string {
  return outerWithPlaceholder.replace(
    RECURRING_PLACEHOLDER,
    () => `<!-- RECURRING_START -->${innerTemplate}<!-- RECURRING_END -->`,
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * cover_note and scope_text are free-form AI-written prose, not a single
 * line — rendered as real <p> paragraphs (a blank line starts a new
 * paragraph; a single newline becomes <br>) instead of one run-on escaped
 * string. Deliberately sets no font/color/size of its own: it inherits
 * whatever typography the surrounding template container already
 * declares, so it reads as typeset with the document rather than pasted
 * in. break-inside/page-break-inside keep a short paragraph from being
 * split across a PDF page boundary.
 */
const PARAGRAPH_TOKENS = new Set(['cover_note', 'scope_text'])

function escapeHtmlParagraphs(value: string): string {
  const paragraphs = value.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return paragraphs
    .map((p, i) => {
      const margin = i < paragraphs.length - 1 ? 'margin:0 0 0.85em;' : 'margin:0;'
      return `<p style="${margin}break-inside:avoid;page-break-inside:avoid;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
    })
    .join('')
}

function replaceTokens(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token: string) => {
    if (!(token in values)) return match // unknown token — leave visible rather than silently vanish
    return PARAGRAPH_TOKENS.has(token) ? escapeHtmlParagraphs(values[token]) : escapeHtml(values[token])
  })
}

/**
 * Fills every scalar token, repeats the line-item region, and keeps or
 * strips the optional recurring region. Returns the final HTML ready to
 * hand to the PDF renderer.
 *
 * @param isRecurring  When false (one-off), the entire RECURRING_START/END
 *   region — markers and content — is removed before token replacement, so
 *   there's never an empty contract-terms heading with no value next to it.
 *   When true, the markers are stripped but the content stays, with its
 *   tokens filled normally.
 */
export function fillTemplate(
  templateHtml: string,
  data:         TemplateData,
  items:        TemplateLineItem[],
  isRecurring:  boolean,
): string {
  let html = templateHtml.replace(LINE_ITEMS_REGION, (_match, rowTemplate: string) => {
    return items.map(item => replaceTokens(rowTemplate, item)).join('')
  })
  html = html.replace(RECURRING_REGION, (_match, inner: string) => (isRecurring ? inner : ''))
  html = replaceTokens(html, data)
  return html
}

export interface TemplateValidation {
  hasLineItemsRegion: boolean
  hasRecurringRegion: boolean
  missingRequiredTokens: string[] // required tokens never referenced anywhere in the template
  unknownTokens: string[]         // {{...}} placeholders that don't match any known token
}

/** Tokens a usable template should reference — everything else is optional. */
const REQUIRED_TOKENS: readonly string[] = [
  'business_name', 'customer_name', 'quote_number', 'quote_date', 'total',
]

export function validateTemplate(templateHtml: string): TemplateValidation {
  const hasLineItemsRegion = LINE_ITEMS_REGION.test(templateHtml)
  const hasRecurringRegion = RECURRING_REGION.test(templateHtml)
  const regionMatch = templateHtml.match(LINE_ITEMS_REGION)
  const rowTemplate = regionMatch?.[1] ?? ''
  const outsideRegion = templateHtml.replace(LINE_ITEMS_REGION, '').replace(RECURRING_REGION, '')

  const allKnown = new Set<string>([...SCALAR_TOKENS, ...LINE_ITEM_TOKENS])
  const found = new Set<string>()
  const unknownTokens = new Set<string>()

  // Tokens inside the recurring region are scalar tokens too (e.g.
  // {{total_per_year}}), just scoped to when the quote is recurring —
  // validate them against SCALAR_TOKENS the same as the rest of the page.
  const recurringMatch = templateHtml.match(RECURRING_REGION)
  const recurringInner = recurringMatch?.[1] ?? ''

  for (const [text, tokenSet] of [
    [outsideRegion + recurringInner, SCALAR_TOKENS] as const,
    [rowTemplate, LINE_ITEM_TOKENS] as const,
  ]) {
    for (const m of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
      const token = m[1]
      found.add(token)
      if (!allKnown.has(token) || !tokenSet.includes(token as never)) unknownTokens.add(token)
    }
  }

  const missingRequiredTokens = REQUIRED_TOKENS.filter(t => !found.has(t))

  return {
    hasLineItemsRegion,
    hasRecurringRegion,
    missingRequiredTokens,
    unknownTokens: [...unknownTokens],
  }
}
