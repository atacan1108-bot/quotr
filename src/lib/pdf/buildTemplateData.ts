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
import { euro } from '@/lib/pdf/shared'
import { formatDate } from '@/lib/formatDate'
import { pdfLabels, typeMeta, recurringRateItemText, vatLabel } from '@/lib/pdf/pdfLabels'

export function buildTemplateData(data: QuoteExportData): { data: TemplateData; items: TemplateLineItem[]; isRecurring: boolean } {
  const { job, proposal, rateCard, breakdown, recurringPeriods, quoteSequence } = data
  const client = job.clients
  const branding = rateCard.branding
  const isRecurring = job.quote_type === 'recurring' && !!recurringPeriods
  // Every piece of customer-facing text in this document follows the
  // QUOTE's own language — independent of whoever is currently logged in
  // and generating it. See src/i18n/config.ts for the two-locale model.
  const locale = job.language
  const l = pdfLabels(locale)

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
    quote_date:       formatDate(proposal ? new Date(proposal.created_at) : new Date(), locale),
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
    lbl_vat:                     vatLabel(locale, breakdown.vat_percent),
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

  // Recurring lines (rate_type set) show their rate and what it's per
  // ("€ 255,00/day (€ 51,00/hr)", "€ 65,00/hr", etc.) instead of the
  // one-off labour/material/fixed formatting — same item_quantity/
  // item_unit_price tokens either way, just different text in them.
  const items: TemplateLineItem[] = breakdown.items.map(item => {
    if (item.rate_type) {
      const { quantityText, rateText } = recurringRateItemText(locale, item.rate_type, item.quantity, item.unit_cost)
      return {
        item_label:      item.label,
        item_quantity:   quantityText,
        item_unit_price: rateText,
        item_total:      euro(item.line_total),
      }
    }
    return {
      item_label:      item.label,
      item_quantity:   typeMeta(locale, item.type, item.quantity),
      item_unit_price: euro(item.unit_cost),
      item_total:      euro(item.line_total),
    }
  })

  return { data: templateData, items, isRecurring }
}
