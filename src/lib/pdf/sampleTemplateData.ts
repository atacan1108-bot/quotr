/**
 * Fake-but-realistic data used to render a preview PDF from an uploaded
 * template before any real quote exists yet — lets a contractor see their
 * design filled in immediately after upload. Numbers are internally
 * consistent (items sum to subtotal, VAT computed at 21%) but entirely
 * fictional; never used for a real quote.
 */
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import { euro, fmtDate } from '@/lib/pdf/shared'
import { calculateRecurringPeriods } from '@/lib/pricing'

// The SAME three sample items work for both quote types — there's only
// ever one line-item shape now.
export const SAMPLE_TEMPLATE_ITEMS: TemplateLineItem[] = [
  { item_label: 'Labour — plumbing repair', item_quantity: '4 hours', item_unit_price: euro(65),  item_total: euro(260) },
  { item_label: 'Replacement tap',          item_quantity: '1 unit',  item_unit_price: euro(138), item_total: euro(138) },
  { item_label: 'Call-out fee',             item_quantity: '1',       item_unit_price: euro(45),  item_total: euro(45) },
]

const SUBTOTAL = 260 + 138 + 45
const VAT = Math.round(SUBTOTAL * 0.21 * 100) / 100
const TOTAL = SUBTOTAL + VAT

// Recurring sample figures are DERIVED from that same €443 "one day" bundle
// via the real pricing function (not hand-computed), for a sample 5-day/
// week, 52-week, 12-month contract — so the preview is internally
// consistent with the line items above, same as a real recurring quote.
const samplePeriods = calculateRecurringPeriods(
  { subtotal: SUBTOTAL, vat_percent: 21 },
  { days_per_week: 5, weeks_per_year: 52, contract_term_months: 12 },
)

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
  total_per_week:        euro(samplePeriods.per_week.incl_vat),
  total_per_month:       euro(samplePeriods.per_month.incl_vat),
  total_per_year:        euro(samplePeriods.per_year.incl_vat),
  total_contract_term:   euro(samplePeriods.contract_total.incl_vat),
  contract_term_months:  String(samplePeriods.contract_term_months),
  notice_period_months:  '1',
}
