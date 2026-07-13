/**
 * Converts InvoiceExportData (invoice row + rate card + priced breakdown)
 * into the flat InvoiceTemplateData + line/VAT rows fillInvoiceTemplate()
 * substitutes into the built-in invoice template. Pure formatting/mapping —
 * no numbers are computed here, mirrors buildTemplateData.ts's role for quotes.
 */
import type { InvoiceExportData } from '@/lib/invoiceData'
import type { InvoiceTemplateData, InvoiceTemplateLineItem, InvoiceTemplateVatRow, FillInvoiceTemplateOptions } from '@/lib/pdf/invoiceTemplate'
import { euro } from '@/lib/pdf/shared'
import { formatDate } from '@/lib/formatDate'
import { pdfLabels, typeMeta, vatLabel } from '@/lib/pdf/pdfLabels'
import type { ItemType } from '@/lib/pricing'

export function buildInvoiceTemplateData(data: InvoiceExportData): {
  data: InvoiceTemplateData
  items: InvoiceTemplateLineItem[]
  vatRows: InvoiceTemplateVatRow[]
  options: FillInvoiceTemplateOptions
} {
  const { invoice, rateCard, breakdown } = data
  const branding = rateCard.branding
  const locale = invoice.language
  const l = pdfLabels(locale)

  const customerExtraLine = [
    invoice.client_btw ? `BTW ${invoice.client_btw}` : '',
    invoice.client_kvk ? `KvK ${invoice.client_kvk}` : '',
  ].filter(Boolean).join(' · ')

  const templateData: InvoiceTemplateData = {
    business_logo:    rateCard.logo_url ?? '',
    business_name:    rateCard.business_name ?? '',
    business_address: rateCard.business_address ?? '',
    business_email:   rateCard.business_email ?? '',
    business_phone:   branding?.phone ?? '',
    business_website: branding?.website ?? '',
    business_kvk:     branding?.kvk ?? '',
    business_btw:     branding?.btw ?? '',
    business_iban:    branding?.iban ?? '',
    customer_name:    invoice.client_name,
    customer_address: invoice.client_address ?? '',
    customer_email:   invoice.client_email ?? '',
    customer_extra_line: customerExtraLine,
    invoice_number:   invoice.invoice_number ?? '',
    invoice_date:     formatDate(invoice.invoice_date, locale),
    due_date:         formatDate(invoice.due_date, locale),
    iban:             branding?.iban ?? '',
    account_holder:   branding?.accountHolderName ?? rateCard.business_name ?? '',
    payment_reference: invoice.payment_reference ?? invoice.invoice_number ?? '',
    note_text:        invoice.note_text ?? '',
    subtotal:         euro(breakdown.subtotal),
    discount_amount:  euro(breakdown.discount_amount),
    taxable_subtotal: euro(breakdown.taxable_subtotal),
    vat_amount:       euro(breakdown.vat_amount),
    total:            euro(breakdown.total),
    reverse_charge_note: invoice.reverse_charge ? l.reverseChargeNote : '',
    paid_stamp:       invoice.status === 'paid' ? l.paidStamp : '',
    lbl_invoice:             l.invoice,
    lbl_invoice_number:      l.invoiceNumber,
    lbl_invoice_date:        l.invoiceDate,
    lbl_due_date:            l.dueDate,
    lbl_client:              l.client,
    lbl_from:                l.from,
    lbl_details:             l.details,
    lbl_description:         l.description,
    lbl_quantity:            l.quantity,
    lbl_rate:                l.rate,
    lbl_vat_column:          l.vatShort,
    lbl_amount:              l.amount,
    lbl_subtotal:            l.subtotal,
    lbl_discount:            l.discountLabel,
    lbl_taxable_subtotal:    l.subtotalExclVat,
    lbl_amount_due:          l.amountDue,
    lbl_payment_details:     l.paymentDetails,
    lbl_iban:                l.iban,
    lbl_account_holder:      l.accountHolder,
    lbl_payment_reference:   l.paymentReference,
  }

  // priceInvoiceLine (pricing.ts) coerces 'text' rows to type:'fixed' with
  // zero values so calculateInvoice's arithmetic doesn't need a special
  // case — but that also erases the 'text' marker calculateInvoice's output
  // needs for DISPLAY (a free-form note shouldn't show "Fixed price / €0.00
  // / 21%" like a real zero-value line). Recover it from the original,
  // unpriced invoice.line_items array, matched back by position — both
  // arrays come from the same .map() call in calculateInvoice, so the
  // order is guaranteed identical.
  const items: InvoiceTemplateLineItem[] = breakdown.items.map((item, i) => {
    const isText = invoice.line_items[i]?.type === 'text'
    return {
      item_label:      item.label,
      item_quantity:   isText ? '' : typeMeta(locale, item.type as ItemType, item.quantity),
      item_unit_price: isText ? '' : euro(item.unit_cost),
      item_total:      isText ? '' : euro(item.line_total),
      item_vat_rate:   isText ? '' : `${item.vat_rate}%`,
    }
  })

  const vatRows: InvoiceTemplateVatRow[] = breakdown.vat_breakdown.map(row => ({
    vat_rate_label: vatLabel(locale, row.vat_rate),
    vat_base:       euro(row.taxable_amount),
    vat_row_amount: euro(row.vat_amount),
  }))

  const options: FillInvoiceTemplateOptions = {
    hasDiscount:   breakdown.discount_amount > 0,
    reverseCharge: invoice.reverse_charge,
    isPaid:        invoice.status === 'paid',
  }

  return { data: templateData, items, vatRows, options }
}
