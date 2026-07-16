/**
 * Fills the built-in invoice HTML template (src/lib/pdf/defaultInvoiceTemplate.ts)
 * with real invoice data. Deliberately a SEPARATE, small function — not an
 * extension of fillTemplate() in src/lib/htmlTemplate.ts — because that
 * template is code-authored (not contractor-uploaded), so it needs no
 * sanitization pass-through, and touching the quote-side fillTemplate for an
 * invoice-only feature would add regression risk to quotes for no reuse
 * benefit. This file only IMPORTS already-exported, already-safe primitives
 * from htmlTemplate.ts (escapeHtml, findLeftoverTokens, UnfilledTokenError) —
 * it never modifies that file. The design still lets a future
 * contractor-customizable invoice template reuse these same primitives.
 *
 * Same three mechanisms as the quote template, plus one more:
 *  - Scalar tokens: {{token_name}}, HTML-escaped.
 *  - LINE_ITEMS: repeating region, one row per invoice line — same marker
 *    syntax as the quote template.
 *  - VAT_BREAKDOWN: repeating region, one row per distinct VAT rate present
 *    (0-3 rows for NL rates 21/9/0) — empty (zero rows) when reverse-charged.
 *  - Conditional blocks (DISCOUNT / REVERSE_CHARGE / PAID): shown only when
 *    applicable, stripped entirely (markers included) otherwise — same
 *    "keep or strip the whole marked region" idea as the quote template's
 *    RECURRING_START/END, generalized into one small local helper here.
 */
import { escapeHtml, findLeftoverTokens, UnfilledTokenError } from '@/lib/htmlTemplate'
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { FOOTER_HEIGHT } from '@/lib/pdf/footerTemplate'
import type { Locale } from '@/i18n/config'

export interface InvoiceTemplateData {
  [key: string]: string
  business_logo:         string
  business_name:         string
  business_address:      string
  business_email:        string
  business_phone:        string
  business_website:      string
  business_kvk:           string
  business_btw:           string
  business_iban:          string
  customer_name:          string
  customer_address:       string
  customer_email:         string
  /** Pre-composed "BTW NL123... · KvK 12345678" line, blank if neither is
   * set — built server-side (see invoiceTemplateData.ts) so the template
   * only needs one token wrapped in a `:empty`-hiding element, rather than
   * a whole conditional region for an optional one-line detail. */
  customer_extra_line:    string
  invoice_number:         string
  invoice_date:           string
  due_date:               string
  iban:                   string
  account_holder:         string
  payment_reference:      string
  note_text:              string
  subtotal:               string
  discount_amount:        string
  taxable_subtotal:       string
  vat_amount:             string
  total:                  string
  reverse_charge_note:    string
  paid_stamp:             string
  /** Mollie hosted-checkout URL for this invoice's current payment —
   * empty when no payment has been created yet (see invoicing/types.ts's
   * mollie_checkout_url). Only rendered when options.showPayNow is true. */
  pay_now_url:            string
  lbl_pay_now:             string
  lbl_invoice:             string
  lbl_invoice_number:      string
  lbl_invoice_date:        string
  lbl_due_date:            string
  lbl_client:              string
  lbl_from:                string
  lbl_details:             string
  lbl_description:         string
  lbl_quantity:             string
  lbl_rate:                string
  lbl_vat_column:          string
  lbl_amount:              string
  lbl_subtotal:            string
  lbl_discount:            string
  lbl_taxable_subtotal:    string
  lbl_amount_due:          string
  lbl_payment_details:     string
  lbl_iban:                string
  lbl_account_holder:      string
  lbl_payment_reference:   string
}

export interface InvoiceTemplateLineItem {
  [key: string]: string
  item_label:      string
  item_quantity:   string
  item_unit_price: string
  item_total:      string
  item_vat_rate:   string
}

export interface InvoiceTemplateVatRow {
  [key: string]: string
  vat_rate_label:  string  // e.g. "21%"
  vat_base:        string  // formatted euro
  vat_row_amount:  string  // formatted euro
}

function region(markerName: string): RegExp {
  return new RegExp(`<!--\\s*${markerName}_START\\s*-->([\\s\\S]*?)<!--\\s*${markerName}_END\\s*-->`)
}

/** Repeats the content between MARKER_START/END once per row, filling each
 * row's own tokens — same idea as the quote template's LINE_ITEMS region. */
function fillRepeatingRegion(html: string, markerName: string, rows: Record<string, string>[]): string {
  return html.replace(region(markerName), (_match, rowTemplate: string) =>
    rows.map(row => replaceScalarTokens(rowTemplate, row)).join(''),
  )
}

/** Keeps the region's content (with its tokens filled later, alongside the
 * rest of the page) when `keep` is true; removes the whole region — markers
 * included — when false, so nothing empty is ever left in the output. */
function stripConditionalBlock(html: string, markerName: string, keep: boolean): string {
  return html.replace(region(markerName), (_match, inner: string) => (keep ? inner : ''))
}

function replaceScalarTokens(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token: string) => {
    if (!(token in values)) return match // unknown token — left visible so findLeftoverTokens catches it
    return escapeHtml(values[token])
  })
}

export interface FillInvoiceTemplateOptions {
  hasDiscount:    boolean
  reverseCharge:  boolean
  isPaid:         boolean
  /** Show the "Pay now" button — true only when a Mollie checkout URL
   * exists AND the invoice isn't already paid (an already-paid invoice
   * has nothing left to pay, regardless of whether an old link exists). */
  showPayNow:     boolean
}

/**
 * @throws UnfilledTokenError (re-exported from htmlTemplate.ts) if any
 *   {{token}} survives filling — the same hard stop quotes get, so a
 *   broken invoice PDF can never reach a customer either.
 */
export function fillInvoiceTemplate(
  templateHtml: string,
  data:         InvoiceTemplateData,
  items:        InvoiceTemplateLineItem[],
  vatRows:      InvoiceTemplateVatRow[],
  options:      FillInvoiceTemplateOptions,
): string {
  let html = fillRepeatingRegion(templateHtml, 'LINE_ITEMS', items)
  html = fillRepeatingRegion(html, 'VAT_BREAKDOWN', vatRows)
  html = stripConditionalBlock(html, 'DISCOUNT', options.hasDiscount)
  html = stripConditionalBlock(html, 'REVERSE_CHARGE', options.reverseCharge)
  html = stripConditionalBlock(html, 'PAID', options.isPaid)
  html = stripConditionalBlock(html, 'PAY_NOW', options.showPayNow)
  html = replaceScalarTokens(html, data)

  const leftover = findLeftoverTokens(html)
  if (leftover.length > 0) throw new UnfilledTokenError(leftover)

  return html
}

export { FOOTER_HEIGHT as INVOICE_FOOTER_HEIGHT }

/**
 * The invoice's own repeating page footer for Puppeteer (see
 * renderHtmlToPdf's footerTemplate option) — same idea as
 * src/lib/pdf/footerTemplate.ts's buildFooterTemplate, but typed against
 * InvoiceTemplateData instead of the quote-only TemplateData (which
 * requires ~90 quote-specific fields an invoice doesn't have). A small,
 * deliberate duplication rather than forcing an invoice's data through a
 * type it doesn't structurally fit — footerTemplate.ts itself is untouched.
 */
export function buildInvoiceFooterTemplate(data: InvoiceTemplateData, locale: Locale): string {
  const l = pdfLabels(locale)

  const businessLine = [data.business_name, data.business_address, data.business_phone, data.business_email]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &middot; ')

  const identityLine = [
    data.business_kvk ? `KvK ${escapeHtml(data.business_kvk)}` : '',
    data.business_btw ? `BTW ${escapeHtml(data.business_btw)}` : '',
    data.invoice_number ? `${escapeHtml(l.invoiceNumber)} ${escapeHtml(data.invoice_number)}` : '',
  ].filter(Boolean).join(' &middot; ')

  const pageOf = l.pageOf
    .replace('{current}', '<span class="pageNumber"></span>')
    .replace('{total}', '<span class="totalPages"></span>')

  return `
    <div style="width:100%;font-family:'Archivo',sans-serif;font-size:11px;color:#5a686e;padding:0 56px;box-sizing:border-box;-webkit-print-color-adjust:exact;">
      <div style="border-top:2px solid #215968;padding-top:8px;display:flex;justify-content:space-between;align-items:baseline;font-weight:500;gap:16px;">
        <div>${businessLine}${identityLine ? ` &middot; ${identityLine}` : ''}</div>
        <div style="white-space:nowrap;">${pageOf}</div>
      </div>
    </div>
  `
}
