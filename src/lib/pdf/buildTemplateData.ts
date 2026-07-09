/**
 * Converts QuoteExportData (job, proposal, rate card, priced breakdown)
 * into the flat TemplateData + TemplateLineItem[] shape that
 * fillTemplate() substitutes into a contractor's uploaded HTML template.
 * SERVER-ONLY. No numbers are computed here — everything comes straight
 * from the pricing engine's breakdown or is formatted as-is.
 *
 * Branches on job.quote_type:
 *  - 'one_off': unchanged from before — items come from breakdown.items,
 *    money tokens (subtotal/vat_amount/total) from breakdown.
 *  - 'recurring': items come from recurringBreakdown.items (day/hourly/fixed
 *    line items), money tokens map to the contract total (so a template
 *    using only the generic {{total}} still shows something sensible), and
 *    the recurring-only tokens (total_per_week etc.) are also filled.
 */
import type { QuoteExportData } from '@/lib/quoteData'
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import type { RecurringPricedItem } from '@/lib/pricing'
import { euro, fmtDate, TYPE_META } from '@/lib/pdf/shared'

function formatFrequency(item: RecurringPricedItem): string {
  switch (item.frequency) {
    case 'per_day':   return `${item.occurrences} day${item.occurrences === 1 ? '' : 's'}/week`
    case 'per_week':  return `${item.occurrences}×/week`
    case 'per_month': return `${item.occurrences}×/month`
    case 'per_year':  return `${item.occurrences}×/year`
  }
}

function formatRate(item: RecurringPricedItem): string {
  switch (item.rate_type) {
    case 'day_rate':         return `${euro(item.amount)}/day`
    case 'hourly':           return `${euro(item.amount)}/hr`
    case 'fixed_per_period': return euro(item.amount)
  }
}

const BLANK_LINE_ITEM_EXTRAS = { item_quantity: '', item_unit_price: '', item_total: '', item_rate: '', item_frequency: '', item_period_total: '', item_year_total: '' }

export function buildTemplateData(data: QuoteExportData): { data: TemplateData; items: TemplateLineItem[] } {
  const { job, proposal, rateCard, breakdown, recurringBreakdown, quoteSequence } = data
  const client = job.clients
  const branding = rateCard.branding

  const quoteNumber = quoteSequence != null
    ? `${branding?.quoteNumberPrefix ?? ''}${String(quoteSequence).padStart(3, '0')}`
    : ''

  const isRecurring = job.quote_type === 'recurring' && recurringBreakdown

  const baseData = {
    business_logo:    rateCard.logo_url ?? '',
    business_name:    rateCard.business_name ?? '',
    business_address: rateCard.business_address ?? '',
    business_email:   rateCard.business_email ?? '',
    business_phone:   branding?.phone ?? '',
    business_website: branding?.website ?? '',
    business_kvk:     branding?.kvk ?? '',
    business_btw:     branding?.btw ?? '',
    business_iban:    branding?.iban ?? '',
    customer_name:    client?.name ?? '',
    customer_address: client?.address ?? '',
    customer_email:   client?.email ?? '',
    customer_phone:   client?.phone ?? '',
    quote_number:     quoteNumber,
    quote_date:       fmtDate(proposal ? new Date(proposal.created_at) : new Date()),
    cover_note:       proposal?.cover_note ?? '',
    scope_text:       proposal?.scope_text ?? '',
    terms_text:       rateCard.terms_text ?? '',
    footer_text:      branding?.footerText ?? '',
  }

  if (isRecurring) {
    const rb = recurringBreakdown
    const useExVat = rb.prices_shown_excluding_vat
    const templateData: TemplateData = {
      ...baseData,
      // Generic money tokens (subtotal/vat_amount/total) map to the contract
      // total and — unlike the dedicated total_per_* tokens below — total is
      // ALWAYS incl-VAT here, matching one-off's fixed convention. A naive
      // template (not built with the ex/incl-VAT toggle in mind) shows a
      // Subtotal + VAT breakdown expecting Total = Subtotal + VAT; making
      // {{total}} sometimes equal the ex-VAT figure would silently break
      // that arithmetic identity on screen.
      subtotal:    euro(rb.contract_total.ex_vat),
      vat_percent: String(rb.vat_percent),
      vat_amount:  euro(rb.contract_total.vat_amount),
      total:       euro(rb.contract_total.incl_vat),
      total_per_week:       euro(useExVat ? rb.per_week.ex_vat  : rb.per_week.incl_vat),
      total_per_month:      euro(useExVat ? rb.per_month.ex_vat : rb.per_month.incl_vat),
      total_per_year:       euro(useExVat ? rb.per_year.ex_vat  : rb.per_year.incl_vat),
      total_contract_term:  euro(useExVat ? rb.contract_total.ex_vat : rb.contract_total.incl_vat),
      contract_term_months: String(rb.contract_term_months),
    }

    const items: TemplateLineItem[] = rb.items.map(item => ({
      ...BLANK_LINE_ITEM_EXTRAS,
      item_label:        item.label,
      item_rate:         formatRate(item),
      item_frequency:    formatFrequency(item),
      item_period_total: euro(item.per_month),
      item_year_total:   euro(item.per_year),
      // Also fill the one-off tokens with sensible recurring equivalents —
      // a template authored before recurring quotes existed (item_quantity/
      // item_unit_price/item_total only) still shows real data instead of
      // blank cells, without needing to be redesigned. item_total uses the
      // CONTRACT total (not monthly) so the rows sum to `subtotal` above,
      // same as one-off's item_total rows sum to its subtotal.
      item_quantity:   formatFrequency(item),
      item_unit_price: formatRate(item),
      item_total:      euro(item.contract_total),
    }))

    return { data: templateData, items }
  }

  const templateData: TemplateData = {
    ...baseData,
    subtotal:    euro(breakdown.subtotal),
    vat_percent: String(breakdown.vat_percent),
    vat_amount:  euro(breakdown.vat_amount),
    total:       euro(breakdown.total),
    total_per_week:       '',
    total_per_month:      '',
    total_per_year:       '',
    total_contract_term:  '',
    contract_term_months: '',
  }

  const items: TemplateLineItem[] = breakdown.items.map(item => ({
    ...BLANK_LINE_ITEM_EXTRAS,
    item_label:      item.label,
    item_quantity:   (TYPE_META[item.type] ?? (() => ''))(item.quantity),
    item_unit_price: euro(item.unit_cost),
    item_total:      euro(item.line_total),
  }))

  return { data: templateData, items }
}
