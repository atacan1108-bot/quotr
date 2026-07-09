/**
 * Fake-but-realistic data used to render a preview PDF from an uploaded
 * template before any real quote exists yet — lets a contractor see their
 * design filled in immediately after upload. Numbers are internally
 * consistent (items sum to subtotal, VAT computed at 21%) but entirely
 * fictional; never used for a real quote.
 */
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import { euro, fmtDate } from '@/lib/pdf/shared'

// Every sample line item fills BOTH one-off tokens (item_quantity/
// item_unit_price/item_total) and recurring tokens (item_rate/
// item_frequency/item_period_total/item_year_total) with parallel, sensible
// values — a preview doesn't know in advance which set the uploaded
// template's row actually uses, so both are always real, not blank.
export const SAMPLE_TEMPLATE_ITEMS: TemplateLineItem[] = [
  { item_label: 'Labour — plumbing repair', item_quantity: '4 hours', item_unit_price: euro(65),   item_total: euro(260),
    item_rate: `${euro(65)}/hr`,   item_frequency: '1×/week',   item_period_total: euro(260),   item_year_total: euro(3120) },
  { item_label: 'Replacement tap',          item_quantity: '1 unit',  item_unit_price: euro(138),  item_total: euro(138),
    item_rate: euro(138),          item_frequency: '1×/month',  item_period_total: euro(138),   item_year_total: euro(1656) },
  { item_label: 'Call-out fee',             item_quantity: '1',       item_unit_price: euro(45),   item_total: euro(45),
    item_rate: `${euro(45)}/day`,  item_frequency: '1 day/week', item_period_total: euro(45),    item_year_total: euro(2340) },
]

const SUBTOTAL = 260 + 138 + 45
const VAT = Math.round(SUBTOTAL * 0.21 * 100) / 100
const TOTAL = SUBTOTAL + VAT

// Recurring quote-level sample figures — a realistic multi-line contract
// (not derived from the one-off items above, which are a different scenario).
const REC_PER_WEEK  = 1696.38
const REC_PER_MONTH = 7351.00
const REC_PER_YEAR  = 88212.00
const REC_TERM      = 88212.00

export const SAMPLE_TEMPLATE_DATA: TemplateData = {
  business_logo:     '',
  business_name:     'Your Business Name',
  business_address:  '123 Example Street, 1000 AB Amsterdam',
  business_email:    'you@example.com',
  business_phone:    '+31 6 12345678',
  business_website:  'www.example.com',
  business_kvk:       '12345678',
  business_btw:       'NL123456789B01',
  business_iban:      'NL91 ABNA 0417 1643 00',
  customer_name:     'Jane Customer',
  customer_address:  '456 Sample Avenue, 2000 CD Rotterdam',
  customer_email:    'jane@example.com',
  customer_phone:    '+31 6 87654321',
  quote_number:      '2026-001',
  quote_date:        fmtDate(new Date()),
  cover_note:        'Thanks for the opportunity to quote on this job — see the breakdown below.',
  scope_text:        'Replace the kitchen tap and fix the under-sink leak.',
  subtotal:          euro(SUBTOTAL),
  vat_percent:       '21',
  vat_amount:        euro(VAT),
  total:             euro(TOTAL),
  terms_text:        'Payment due within 14 days. Quote valid for 30 days.',
  footer_text:       'Your Business Name · Amsterdam',
  total_per_week:        euro(REC_PER_WEEK),
  total_per_month:       euro(REC_PER_MONTH),
  total_per_year:        euro(REC_PER_YEAR),
  total_contract_term:   euro(REC_TERM),
  contract_term_months:  '12',
}
