/**
 * Converts QuoteExportData (job, proposal, rate card, priced breakdown)
 * into the flat TemplateData + TemplateLineItem[] shape that
 * fillTemplate() substitutes into a contractor's uploaded HTML template.
 * SERVER-ONLY. No numbers are computed here — everything comes straight
 * from the pricing engine's breakdown or is formatted as-is.
 */
import type { QuoteExportData } from '@/lib/quoteData'
import type { TemplateData, TemplateLineItem } from '@/lib/htmlTemplate'
import { euro, fmtDate, TYPE_META } from '@/lib/pdf/shared'

export function buildTemplateData(data: QuoteExportData): { data: TemplateData; items: TemplateLineItem[] } {
  const { job, proposal, rateCard, breakdown, quoteSequence } = data
  const client = job.clients
  const branding = rateCard.branding

  const quoteNumber = quoteSequence != null
    ? `${branding?.quoteNumberPrefix ?? ''}${String(quoteSequence).padStart(3, '0')}`
    : ''

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
  }

  const items: TemplateLineItem[] = breakdown.items.map(item => ({
    item_label:      item.label,
    item_quantity:   (TYPE_META[item.type] ?? (() => ''))(item.quantity),
    item_unit_price: euro(item.unit_cost),
    item_total:      euro(item.line_total),
  }))

  return { data: templateData, items }
}
