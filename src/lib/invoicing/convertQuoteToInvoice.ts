/**
 * Builds a draft invoice's insert payload from an ACCEPTED quote — the
 * "Convert to invoice" hero feature. Pure function: no DB access, no I/O,
 * so it's directly testable and the API route (convert-to-invoice/route.ts)
 * just calls this and inserts the result.
 *
 * One-off quote: copies job.line_items as-is (a real, itemized invoice
 * appears, not a lump sum), adding rateCard.vat_percent to every line since
 * one-off quotes have no per-item VAT concept.
 *
 * Recurring quote: bills ONE billing period (per confirmed product
 * decision — the contractor converts the same accepted quote again next
 * period for the next invoice, rather than invoicing the whole contract
 * value at once). Uses calculateRecurringItemPeriods' existing, unmodified
 * per-item MONTHLY figures — one 'fixed' invoice line per original item,
 * quantity 1, unit_cost = that item's per-month ex-VAT amount.
 */
import { calculateProposal, calculateRecurringItemPeriods } from '@/lib/pricing'
import type { InvoiceLineItem } from '@/lib/pricing'
import type { Job, Client, RateCard } from '@/lib/types'
import { formatDate } from '@/lib/formatDate'

export interface NewInvoiceInput {
  owner_id:           string
  client_id:          string | null
  job_id:             string
  title:              string | null
  language:           'nl' | 'en'
  client_name:        string
  client_address:     string | null
  client_email:        string | null
  line_items:          InvoiceLineItem[]
  invoice_date:        string
  due_date:             string
  payment_terms_days:   number
  status:               'draft'
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function buildInvoiceDraftFromQuote(
  job:       Job & { clients: Client | null },
  rateCard:  Pick<RateCard, 'labour_rate_per_hour' | 'material_markup_percent' | 'vat_percent' | 'branding'>,
): NewInvoiceInput {
  const vatPercent = rateCard.vat_percent ?? 0
  const paymentTermsDays = rateCard.branding?.paymentTermsDays ?? 30
  const today = new Date().toISOString().slice(0, 10)

  let lineItems: InvoiceLineItem[]

  if (job.quote_type === 'recurring' && job.recurring_config) {
    const terms = {
      days_per_week:        job.recurring_config.days_per_week,
      weeks_per_year:       job.recurring_config.weeks_per_year,
      contract_term_months: job.recurring_config.contract_term_months,
    }
    // Same pricing engine call every recurring quote already runs — its
    // priced items (one occurrence's worth, e.g. one day) are what
    // calculateRecurringItemPeriods needs, not the raw unpriced LineItems.
    const pricedItems = calculateProposal(job.line_items, rateCard).items
    // calculateRecurringItemPeriods returns each item's own WEEKLY figure
    // (period_total) — the per-item MONTHLY amount isn't separately
    // exposed, so it's derived here the same way calculateRecurringPeriods
    // derives the quote-level monthly figure from the weekly one:
    // yearly = weekly × weeks_per_year, monthly = round(yearly / 12).
    // This mirrors that exact scaling, applied per line instead of to the
    // whole quote's subtotal.
    const itemPeriods = calculateRecurringItemPeriods(pricedItems, terms, vatPercent)
    const periodLabel = formatDate(today, job.language, 'short')

    lineItems = job.line_items.map((item, i) => {
      const weeklyExVat = itemPeriods[i]?.period_total.ex_vat ?? 0
      const yearlyExVat = weeklyExVat * terms.weeks_per_year
      const monthlyExVat = Math.round((yearlyExVat / 12) * 100) / 100
      return {
        label:     `${item.label} (${periodLabel})`,
        type:      'fixed',
        quantity:  1,
        unit_cost: monthlyExVat,
        vat_rate:  vatPercent,
      }
    })
  } else {
    // Two of the three one-off types need real translation, not a
    // straight copy, because calculateInvoice's per-line arithmetic is
    // deliberately simpler than calculateProposal's (see pricing.ts's own
    // comment on this) — it has no rate-card lookup and no markup step:
    //  - labour: job.line_items stores unit_cost:0 (calculateProposal reads
    //    the rate straight from the rate card) — so the rate card's
    //    labour_rate_per_hour must be copied in explicitly here, or the
    //    converted line would price at zero.
    //  - material: job.line_items stores the PRE-markup supplier cost —
    //    calculateInvoice would charge that with no markup added. Collapsed
    //    to a single quantity-1 'fixed' line at the item's already-priced,
    //    post-markup line_total instead, which reproduces the accepted
    //    quote's total exactly (no division-then-round risk from splitting
    //    a marked-up total back across a quantity).
    //  - fixed (incl. day_rate/hourly rate_type): raw unit_cost/quantity
    //    already reproduce the total exactly via the same formula
    //    calculateProposal itself uses for these — copied as-is.
    lineItems = job.line_items.map(item => {
      if (item.type === 'labour') {
        return { label: item.label, type: 'labour', quantity: item.quantity, unit_cost: rateCard.labour_rate_per_hour ?? 0, hours: item.hours, vat_rate: vatPercent }
      }
      if (item.type === 'material') {
        const priced = calculateProposal([item], rateCard).items[0]
        return { label: item.label, type: 'fixed', quantity: 1, unit_cost: priced.line_total, vat_rate: vatPercent }
      }
      return { label: item.label, type: item.type, quantity: item.quantity, unit_cost: item.unit_cost, hours: item.hours, rate_type: item.rate_type, vat_rate: vatPercent }
    })
  }

  return {
    owner_id:       job.owner_id,
    client_id:      job.client_id,
    job_id:         job.id,
    title:          job.title,
    language:       job.language,
    client_name:    job.clients?.name ?? '',
    client_address: job.clients?.address ?? null,
    client_email:   job.clients?.email ?? null,
    line_items:     lineItems,
    invoice_date:   today,
    due_date:       addDays(today, paymentTermsDays),
    payment_terms_days: paymentTermsDays,
    status:         'draft',
  }
}
