/**
 * Fetches all data needed to export an invoice as PDF. Mirrors
 * getQuoteExportData in src/lib/quoteData.ts: the pricing engine
 * (calculateInvoice) is always run FRESH here from the invoice's own
 * stored line_items/discount/reverse_charge — never from the
 * invoices.computed_totals snapshot column, which exists for display
 * elsewhere (the invoices list) the same way proposals.computed_totals
 * does. This guarantees a rendered invoice PDF always exactly matches
 * what calculateInvoice() produces for those exact inputs.
 */
import { createClient } from './supabase/server'
import { calculateInvoice } from './pricing'
import type { InvoiceBreakdown } from './pricing'
import type { RateCard } from './types'
import { EMPTY_BRANDING } from './types'
import type { Invoice } from './invoicing/types'

export interface InvoiceExportData {
  invoice: Invoice
  rateCard: Pick<RateCard, 'business_name' | 'business_address' | 'business_email' | 'logo_url' | 'branding'>
  breakdown: InvoiceBreakdown
}

const DEFAULT_RC = {
  business_name:    null,
  business_address: null,
  business_email:   null,
  logo_url:         null,
  branding:         EMPTY_BRANDING,
}

export async function getInvoiceExportData(invoiceId: string): Promise<InvoiceExportData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: invoice }, { data: rateCard }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', invoiceId).eq('owner_id', user.id).single(),
    supabase
      .from('rate_cards')
      .select('business_name, business_address, business_email, logo_url, branding')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!invoice) return null
  const rc = rateCard ?? DEFAULT_RC

  const breakdown = calculateInvoice(invoice.line_items ?? [], {
    discountType: invoice.discount_type ?? undefined,
    discountValue: invoice.discount_value ?? undefined,
    reverseCharge: invoice.reverse_charge,
  })

  return { invoice: invoice as Invoice, rateCard: rc, breakdown }
}
