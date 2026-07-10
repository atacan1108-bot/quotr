/**
 * Fake-but-realistic data used to render a preview PDF from an uploaded
 * template before any real quote exists yet — lets a contractor see their
 * design filled in immediately after upload. Numbers are internally
 * consistent (items sum to subtotal, VAT computed at 21%) but entirely
 * fictional; never used for a real quote.
 */
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import { euro } from '@/lib/pdf/shared'
import { formatDate } from '@/lib/formatDate'
import { calculateRecurringPeriods } from '@/lib/pricing'
import { pdfLabels, vatLabel } from '@/lib/pdf/pdfLabels'
import type { Locale } from '@/i18n/config'

// The SAME three sample items work for both quote types — there's only
// ever one line-item shape now. item_quantity follows the preview's own
// locale (labour/material unit words), same as a real quote's items would.
const SAMPLE_ITEM_LABELS: Record<Locale, { labour: string; tap: string; calloutQty: string }> = {
  nl: { labour: 'Arbeid — loodgieterswerk', tap: 'Vervangen kraan', calloutQty: '4 uur' },
  en: { labour: 'Labour — plumbing repair', tap: 'Replacement tap', calloutQty: '4 hours' },
}

export function getSampleTemplateItems(locale: Locale): TemplateLineItem[] {
  const l = SAMPLE_ITEM_LABELS[locale] ?? SAMPLE_ITEM_LABELS.nl
  const unitQty = locale === 'nl' ? '1 stuk' : '1 unit'
  return [
    { item_label: l.labour, item_quantity: l.calloutQty, item_unit_price: euro(65),  item_total: euro(260) },
    { item_label: l.tap,    item_quantity: unitQty,       item_unit_price: euro(138), item_total: euro(138) },
    { item_label: locale === 'nl' ? 'Voorrijkosten' : 'Call-out fee', item_quantity: '1', item_unit_price: euro(45), item_total: euro(45) },
  ]
}

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

const SAMPLE_TEXT: Record<Locale, { coverNote: string; scopeText: string; termsText: string }> = {
  nl: {
    coverNote: 'Bedankt voor de kans om op deze klus te offreren — hieronder de opbouw.',
    scopeText: 'Vervang de keukenkraan en verhelp het lek onder de gootsteen.',
    termsText: 'Betaling binnen 14 dagen. Offerte 30 dagen geldig.',
  },
  en: {
    coverNote: 'Thanks for the opportunity to quote on this job — see the breakdown below.',
    scopeText: 'Replace the kitchen tap and fix the under-sink leak.',
    termsText: 'Payment due within 14 days. Quote valid for 30 days.',
  },
}

/** Preview data for a template upload, in whichever language the
 * contractor is currently previewing in (their own app language — no
 * real quote exists yet to have its own language). */
export function getSampleTemplateData(locale: Locale): TemplateData {
  const l = pdfLabels(locale)
  const text = SAMPLE_TEXT[locale] ?? SAMPLE_TEXT.nl
  return {
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
    quote_date:        formatDate(new Date(), locale),
    cover_note:        text.coverNote,
    scope_text:        text.scopeText,
    subtotal:          euro(SUBTOTAL),
    vat_percent:       '21',
    vat_amount:        euro(VAT),
    total:             euro(TOTAL),
    terms_text:        text.termsText,
    footer_text:       'Your Business Name · Amsterdam',
    total_per_week:        euro(samplePeriods.per_week.incl_vat),
    total_per_month:       euro(samplePeriods.per_month.incl_vat),
    total_per_year:        euro(samplePeriods.per_year.incl_vat),
    total_contract_term:   euro(samplePeriods.contract_total.incl_vat),
    contract_term_months:  String(samplePeriods.contract_term_months),
    notice_period_months:  '1',
    lbl_quote:                   l.quote,
    lbl_quote_for:               l.quoteFor,
    lbl_a_note_from:             l.aNoteFrom,
    lbl_client:                  l.client,
    lbl_from:                    l.from,
    lbl_details:                 l.details,
    lbl_quote_number:            l.quoteNumber,
    lbl_date:                    l.date,
    lbl_description:             l.description,
    lbl_quantity:                l.quantity,
    lbl_rate:                    l.rate,
    lbl_amount:                  l.amount,
    lbl_subtotal:                l.subtotal,
    lbl_vat:                     vatLabel(locale, 21),
    lbl_total:                   l.total,
    lbl_scope_of_work:           l.scopeOfWork,
    lbl_terms_and_conditions:    l.termsAndConditions,
    lbl_for_approval_contractor: l.forApprovalContractor,
    lbl_for_approval_client:     l.forApprovalClient,
    lbl_signature_and_date:      l.signatureAndDate,
    lbl_initials:                l.initials,
    lbl_page:                    l.page,
    lbl_of:                      l.of,
    lbl_dear:                    l.dear,
  }
}

