/**
 * Converts QuoteExportData (job, proposal, rate card, priced breakdown)
 * into the flat TemplateData + TemplateLineItem[] shape that
 * fillTemplate() substitutes into a contractor's uploaded HTML template.
 * SERVER-ONLY. No numbers are computed here — everything comes straight
 * from the pricing engine's breakdown or is formatted as-is.
 *
 * ONE line-item mapping for both quote types — line_items and the
 * LINE_ITEMS region tokens are identical whether the quote is one-off or
 * recurring. The only difference is the extra scalar tokens
 * (total_per_week/month/year/contract_term, contract_term_months,
 * notice_period_months), which are meaningful only inside a template's
 * <!-- RECURRING_START/END --> region and are blank otherwise.
 */
import type { QuoteExportData } from '@/lib/quoteData'
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import { euro, fmtDate, TYPE_META } from '@/lib/pdf/shared'

export function buildTemplateData(data: QuoteExportData): { data: TemplateData; items: TemplateLineItem[]; isRecurring: boolean } {
  const { job, proposal, rateCard, breakdown, recurringPeriods, quoteSequence } = data
  const client = job.clients
  const branding = rateCard.branding
  const isRecurring = job.quote_type === 'recurring' && !!recurringPeriods

  const quoteNumber = quoteSequence != null
    ? `${branding?.quoteNumberPrefix ?? ''}${String(quoteSequence).padStart(3, '0')}`
    : ''

  // Generic money tokens (subtotal/vat_amount/total) always come from the
  // SAME breakdown as the line items below — for a recurring quote that's
  // the cost of one occurrence, exactly like the LINE_ITEMS rows sum to it.
  // The full contract picture lives in the dedicated total_per_* tokens.
  const templateData: TemplateData = {
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
    subtotal:         euro(breakdown.subtotal),
    vat_percent:      String(breakdown.vat_percent),
    vat_amount:       euro(breakdown.vat_amount),
    total:            euro(breakdown.total),
    terms_text:       rateCard.terms_text ?? '',
    footer_text:      branding?.footerText ?? '',
    total_per_week:        '',
    total_per_month:       '',
    total_per_year:        '',
    total_contract_term:   '',
    contract_term_months:  '',
    notice_period_months:  '',
  }

  if (isRecurring) {
    const rp = recurringPeriods
    const useExVat = rateCard.prices_shown_excluding_vat
    templateData.total_per_week       = euro(useExVat ? rp.per_week.ex_vat       : rp.per_week.incl_vat)
    templateData.total_per_month      = euro(useExVat ? rp.per_month.ex_vat      : rp.per_month.incl_vat)
    templateData.total_per_year       = euro(useExVat ? rp.per_year.ex_vat       : rp.per_year.incl_vat)
    templateData.total_contract_term  = euro(useExVat ? rp.contract_total.ex_vat : rp.contract_total.incl_vat)
    templateData.contract_term_months = rp.contract_term_months > 0 ? String(rp.contract_term_months) : ''
    templateData.notice_period_months = job.recurring_config?.notice_period_months
      ? String(job.recurring_config.notice_period_months)
      : ''
  }

  const items: TemplateLineItem[] = breakdown.items.map(item => ({
    item_label:      item.label,
    item_quantity:   (TYPE_META[item.type] ?? (() => ''))(item.quantity),
    item_unit_price: euro(item.unit_cost),
    item_total:      euro(item.line_total),
  }))

  return { data: templateData, items, isRecurring }
}
