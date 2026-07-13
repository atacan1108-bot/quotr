/**
 * Quotr Pricing Engine
 * =======================
 * The ONLY place in the codebase where money is calculated.
 * No AI, no randomness — just deterministic arithmetic on integers.
 *
 * WHY INTEGERS (CENTS)?
 * JavaScript uses 64-bit floating-point for all numbers.
 * That means 0.1 + 0.2 === 0.30000000000000004 in plain JS.
 * We avoid this entirely by converting euros → cents (×100, rounded)
 * at the very start, doing all additions and multiplications as whole
 * numbers, and only dividing back to euros at the very end.
 *
 * ROUNDING POLICY
 * Every multiplication result is rounded to the nearest cent immediately.
 * This mirrors how real accountancy software works and ensures that
 * calculateProposal called twice with the same inputs always returns
 * identical numbers — no drift, ever.
 */

import type { RateCard } from './types'

// ─── Input & output types ────────────────────────────────────────────────────

export type ItemType = 'labour' | 'material' | 'fixed'

/**
 * Recurring-quote-only line rate types. A recurring contract's line items
 * use these instead of labour/material — day_rate/hourly/fixed replace
 * labour/material/fixed for the duration of a service contract. This is
 * NOT a second line-item system: it's one extra optional field on the
 * exact same LineItem below, read by the exact same calculateProposal()
 * and stored in the exact same jobs.line_items array as one-off items.
 */
export type RecurringRateType = 'day_rate' | 'hourly' | 'fixed'

/**
 * One line in a job, as entered by the contractor.
 * Mirrors the LineItem shape stored in jobs.line_items (JSONB).
 */
export interface LineItem {
  label:     string
  type:      ItemType
  /**
   * How many of this item.
   * - labour:   number of hours worked
   * - material: number of units purchased
   * - fixed:    typically 1 (but can be > 1, e.g. "2 service calls at €150 each")
   * - rate_type 'day_rate': hours/day, shown for reference only — never
   *   multiplied into the price (see calculateProposal)
   * - rate_type 'hourly'/'fixed': same meaning as labour/fixed above
   */
  quantity:  number
  /**
   * Cost per unit in euros, BEFORE any markup.
   * - labour:   ignored — rate comes from the rate card
   * - material: supplier cost per unit
   * - fixed:    the flat price per occurrence
   * - rate_type 'day_rate': the flat rate for one day
   * - rate_type 'hourly':   the rate per hour for this line (NOT the rate
   *   card's labour rate — recurring contracts often negotiate their own)
   * - rate_type 'fixed':    the flat amount per occurrence
   */
  unit_cost: number
  /** Alias for quantity when type === 'labour', kept for display. */
  hours?:    number
  /**
   * Recurring quotes only. When set, this line is priced by rate_type
   * instead of by `type` — `type` is still stored (always 'fixed') for
   * schema consistency but calculateProposal ignores it once rate_type is
   * present. One-off items never set this field.
   */
  rate_type?: RecurringRateType
}

/**
 * One fully-priced line, returned in ProposalBreakdown.items.
 * For material lines we expose base_cost and markup_amount separately
 * so the proposal PDF can show the breakdown to the client.
 */
export interface PricedItem {
  label:         string
  type:          ItemType
  /** Recurring quotes only — see LineItem.rate_type. */
  rate_type?:    RecurringRateType
  quantity:      number
  unit_cost:     number    // the effective cost-per-unit used (rate card rate for labour)
  base_cost:     number    // cost before markup  (labour/fixed → same as line_total)
  markup_amount: number    // markup added in euros (labour/fixed → 0)
  line_total:    number    // what the client pays for this whole line
}

/**
 * The complete breakdown returned by calculateProposal.
 * This is what gets stored in proposals.computed_totals
 * (minus the items array, which lives in jobs.line_items).
 */
export interface ProposalBreakdown {
  items:           PricedItem[]
  labour_total:    number    // sum of all labour line_totals
  material_total:  number    // sum of all material line_totals (after markup)
  fixed_total:     number    // sum of all fixed line_totals
  subtotal:        number    // labour_total + material_total + fixed_total
  vat_percent:     number    // e.g. 21  — stored so the receipt is self-contained
  vat_amount:      number    // subtotal × vat_percent / 100, rounded to 2dp
  total:           number    // subtotal + vat_amount
}

// ─── Rate card shape (only the fields we need) ───────────────────────────────

type PricingRateCard = Pick<
  RateCard,
  'labour_rate_per_hour' | 'material_markup_percent' | 'vat_percent'
>

// ─── Core engine ─────────────────────────────────────────────────────────────

/**
 * calculateProposal — the main pricing function.
 *
 * Converts every monetary value to integer cents, performs all arithmetic
 * in cents, then converts back to euros only at the very end.
 *
 * @param lineItems  The raw line items from the job (empty array is valid).
 * @param rateCard   The contractor's active rate card.
 * @returns          A fully itemized ProposalBreakdown with exact 2-dp values.
 */
export function calculateProposal(
  lineItems: LineItem[],
  rateCard:  PricingRateCard,
): ProposalBreakdown {
  // Safely read rate card fields — default to 0 if somehow missing
  const labourRateCents  = toCents(rateCard.labour_rate_per_hour    ?? 0)
  const markupPercent    = rateCard.material_markup_percent          ?? 0
  const vatPercent       = rateCard.vat_percent                     ?? 0

  let labourTotalCents   = 0
  let materialTotalCents = 0
  let fixedTotalCents    = 0

  const pricedItems: PricedItem[] = (lineItems ?? []).map(raw => {
    // Sanitise inputs — coerce anything missing/NaN/negative to 0
    const label    = raw.label    ?? ''
    const type     = raw.type     ?? 'fixed'
    // Default 0 (not 1) so that a completely missing quantity costs nothing.
    // The UI always initialises new items with quantity: 1, so this only
    // matters for corrupted/missing data coming in from outside.
    const quantity = safeNum(raw.quantity, 0)
    const unitCost = safeNum(raw.unit_cost, 0)

    let baseCostCents     = 0
    let markupCents       = 0
    let lineTotalCents    = 0
    let effectiveUnitCost = unitCost

    switch (type) {
      case 'labour': {
        // Hours to use: prefer the explicit `hours` field, fall back to quantity.
        // Rate comes entirely from the rate card — unit_cost is not used.
        const hours = safeNum(raw.hours ?? quantity, 0)

        // Multiply in cents: Math.round prevents fractional-cent accumulation.
        // e.g. 1.5 hrs × 6500¢/hr = Math.round(9750) = 9750¢ = €97.50 ✓
        lineTotalCents    = Math.round(hours * labourRateCents)
        baseCostCents     = lineTotalCents   // no markup on labour
        markupCents       = 0
        effectiveUnitCost = fromCents(labourRateCents)  // show rate for display
        labourTotalCents += lineTotalCents
        break
      }

      case 'material': {
        // Base cost = how much the contractor paid the supplier
        baseCostCents = Math.round(quantity * toCents(unitCost))

        // Markup = supplier cost × markup% / 100, rounded to nearest cent
        // e.g. 20000¢ base × 15% = Math.round(3000) = 3000¢ = €30.00 ✓
        markupCents    = Math.round(baseCostCents * markupPercent / 100)
        lineTotalCents = baseCostCents + markupCents
        materialTotalCents += lineTotalCents
        break
      }

      case 'fixed': {
        if (raw.rate_type === 'day_rate') {
          // Day rate: a flat amount for ONE occurrence (one day on site).
          // quantity may hold "hours/day" for reference/display (see
          // recurringRateItemText below) but never multiplies into the
          // price — a day rate doesn't change because the crew worked a
          // little more or less that day.
          lineTotalCents = toCents(unitCost)
        } else {
          // One-off 'fixed', and recurring rate types 'fixed'/'hourly':
          // quantity × unit_cost, no markup.
          // e.g. 2 service calls × €150 = 2 × 15000¢ = 30000¢ = €300.00
          lineTotalCents = Math.round(quantity * toCents(unitCost))
        }
        baseCostCents  = lineTotalCents
        markupCents    = 0
        fixedTotalCents += lineTotalCents
        break
      }
    }

    return {
      label,
      type,
      rate_type:     raw.rate_type,
      quantity,
      unit_cost:     effectiveUnitCost,
      base_cost:     fromCents(baseCostCents),
      markup_amount: fromCents(markupCents),
      line_total:    fromCents(lineTotalCents),
    }
  })

  // Subtotal: integer addition — no rounding needed here
  const subtotalCents = labourTotalCents + materialTotalCents + fixedTotalCents

  // VAT: round to nearest cent
  // e.g. 42500¢ × 21 / 100 = Math.round(8925.0) = 8925¢ = €89.25 ✓
  const vatCents = Math.round(subtotalCents * vatPercent / 100)

  // Total: pure integer addition
  const totalCents = subtotalCents + vatCents

  return {
    items:           pricedItems,
    labour_total:    fromCents(labourTotalCents),
    material_total:  fromCents(materialTotalCents),
    fixed_total:     fromCents(fixedTotalCents),
    subtotal:        fromCents(subtotalCents),
    vat_percent:     vatPercent,
    vat_amount:      fromCents(vatCents),
    total:           fromCents(totalCents),
  }
}

// ─── Recurring period derivation ─────────────────────────────────────────────
//
// Recurring quotes use the EXACT SAME line items and the EXACT SAME
// calculateProposal() above as one-off quotes — there is no separate
// recurring pricing model. The only thing that differs for a recurring
// quote is the contract-terms block (days/week, weeks/year, contract
// length): calculateRecurringPeriods takes calculateProposal's own output
// (treated as the cost of ONE occurrence — e.g. one day on site) and scales
// it up through that contract cadence to get week/month/year/contract-term
// figures. It never recomputes or duplicates the base pricing.

/** Per-quote contract facts — lives on jobs.recurring_config, see RecurringConfig in types.ts. */
export interface RecurringContractTerms {
  days_per_week:        number
  weeks_per_year:       number
  contract_term_months: number
}

/** One period's money, always computed both ways — prices_shown_excluding_vat only affects display. */
export interface RecurringPeriodAmount {
  ex_vat:     number
  vat_amount: number
  incl_vat:   number
}

export interface RecurringPeriods {
  days_per_week:        number
  weeks_per_year:        number
  contract_term_months:  number
  per_day:        RecurringPeriodAmount  // == the base calculateProposal breakdown, for reference
  per_week:       RecurringPeriodAmount
  per_month:      RecurringPeriodAmount
  per_year:       RecurringPeriodAmount
  contract_total: RecurringPeriodAmount
}

/**
 * calculateRecurringPeriods — derives week/month/year/contract-term figures
 * from a one-off breakdown (the SAME calculateProposal() output every quote
 * already gets) plus the contract terms. 100% deterministic: no AI, no
 * invented numbers, same integer-cents rounding discipline as the rest of
 * this file.
 *
 * The base breakdown's subtotal is treated as ONE occurrence (one day on
 * site) and scaled: weekly = daily × days_per_week, yearly = weekly ×
 * weeks_per_year, monthly = round(yearly / 12), contract_total = monthly
 * (rounded) × contract_term_months — matching how a real contract is
 * actually invoiced: a fixed amount every month for the term, not an
 * unrounded fraction of the year.
 *
 * Missing/zero inputs (e.g. a contract being drafted with fields not filled
 * in yet, or zero line items) produce zeroed-out results rather than
 * throwing or returning NaN.
 */
export function calculateRecurringPeriods(
  baseBreakdown: Pick<ProposalBreakdown, 'subtotal' | 'vat_percent'>,
  terms:         RecurringContractTerms,
): RecurringPeriods {
  const dailyCents         = toCents(safeNum(baseBreakdown.subtotal, 0))
  const vatPercent         = safeNum(baseBreakdown.vat_percent, 0)
  const daysPerWeek        = safeNum(terms.days_per_week, 0)
  const weeksPerYear       = safeNum(terms.weeks_per_year, 0)
  const contractTermMonths = safeNum(terms.contract_term_months, 0)

  const weeklyCents  = Math.round(dailyCents * daysPerWeek)
  const yearlyCents  = Math.round(weeklyCents * weeksPerYear)
  const monthlyCents = Math.round(yearlyCents / 12)
  const contractTotalCents = Math.round(monthlyCents * contractTermMonths)

  return {
    days_per_week:         daysPerWeek,
    weeks_per_year:        weeksPerYear,
    contract_term_months:  contractTermMonths,
    per_day:        periodAmount(dailyCents, vatPercent),
    per_week:       periodAmount(weeklyCents, vatPercent),
    per_month:      periodAmount(monthlyCents, vatPercent),
    per_year:       periodAmount(yearlyCents, vatPercent),
    contract_total: periodAmount(contractTotalCents, vatPercent),
  }
}

/** Shared by calculateRecurringPeriods and calculateRecurringItemPeriods —
 * ONE formula for "cents → {ex_vat, vat_amount, incl_vat}", used identically
 * whether it's applied to the whole quote's subtotal or to a single line. */
function periodAmount(cents: number, vatPercent: number): RecurringPeriodAmount {
  const vatCents = Math.round(cents * vatPercent / 100)
  return {
    ex_vat:     fromCents(cents),
    vat_amount: fromCents(vatCents),
    incl_vat:   fromCents(cents + vatCents),
  }
}

/** One line item's own week/year figures — same day→week→year scaling as
 * calculateRecurringPeriods above, just applied per line instead of to the
 * whole quote's subtotal. Never used as the source of the quote-level
 * totals (those always come from calculateRecurringPeriods itself) — this
 * is purely for showing a per-line breakdown alongside the per-line daily
 * rate a template already displays. */
export interface RecurringItemPeriod {
  label:        string
  period_total: RecurringPeriodAmount  // per week — the item's own weekly contribution
  year_total:   RecurringPeriodAmount
}

export function calculateRecurringItemPeriods(
  items:      Pick<PricedItem, 'label' | 'line_total'>[],
  terms:      RecurringContractTerms,
  vatPercent: number,
): RecurringItemPeriod[] {
  const daysPerWeek  = safeNum(terms.days_per_week, 0)
  const weeksPerYear = safeNum(terms.weeks_per_year, 0)

  return items.map(item => {
    const dailyCents  = toCents(safeNum(item.line_total, 0))
    const weeklyCents = Math.round(dailyCents * daysPerWeek)
    const yearlyCents = Math.round(weeklyCents * weeksPerYear)
    return {
      label:        item.label,
      period_total: periodAmount(weeklyCents, vatPercent),
      year_total:   periodAmount(yearlyCents, vatPercent),
    }
  })
}

// ─── Invoice pricing ──────────────────────────────────────────────────────────
//
// Invoices reuse the exact same integer-cents discipline as calculateProposal
// above, but differ in three ways a quote never needs: each line can carry
// its own VAT rate (quotes use one flat rate_cards.vat_percent for the whole
// document), the whole invoice can have a discount, and the whole invoice can
// be VAT-reverse-charged ("BTW verlegd" — B2B/EU, VAT becomes 0 and is stated
// as a note instead of a breakdown). Per-line pricing intentionally does NOT
// replicate calculateProposal's material markup step — by the time a number
// reaches an invoice line, any markup has already been decided (either baked
// into unit_cost by the contractor, or carried over from an already-priced
// quote line at conversion time). Every non-text line is simply
// quantity × unit_cost (hours × unit_cost for labour, flat unit_cost for a
// day_rate line — mirroring calculateProposal's own special cases exactly),
// which is also what makes the model generic across industries (hours, days,
// pieces, m² — point 2 of the invoicing spec).

/** A free-form description-only row, invoice-only — no cost, just text. */
export type InvoiceItemType = ItemType | 'text'

/** One line in an invoice. Structurally close to LineItem, plus a required
 * per-line VAT rate. Not stored in jobs.line_items — invoices snapshot their
 * own line_items column so a sent/paid invoice never silently changes. */
export interface InvoiceLineItem {
  label:      string
  type:       InvoiceItemType
  quantity:   number
  unit_cost:  number
  hours?:     number
  rate_type?: RecurringRateType
  /** VAT percent for this line, e.g. 21, 9, or 0. Ignored entirely when the
   * invoice is reverse-charged. */
  vat_rate:   number
}

export interface InvoiceVatBreakdownRow {
  vat_rate:        number
  taxable_amount:  number
  vat_amount:      number
}

export interface InvoiceBreakdown {
  items:             (PricedItem & { vat_rate: number })[]
  subtotal:          number   // sum of line totals, before discount
  discount_amount:   number   // resolved to an absolute euro amount, clamped to subtotal
  taxable_subtotal:  number   // subtotal - discount_amount
  /** One row per VAT rate actually present with a non-zero taxable base.
   * Always empty when reverse_charge is true. */
  vat_breakdown:     InvoiceVatBreakdownRow[]
  vat_amount:        number   // sum of vat_breakdown; always 0 when reverse_charge is true
  total:             number   // taxable_subtotal + vat_amount
  reverse_charge:    boolean
}

export interface InvoiceCalculationOptions {
  discountType?:  'amount' | 'percent'
  discountValue?: number
  reverseCharge?: boolean
}

/** Prices a single invoice line — same cents discipline as calculateProposal,
 * without the material-markup step (see file-level comment above). */
function priceInvoiceLine(raw: InvoiceLineItem): PricedItem & { vat_rate: number } {
  const label     = raw.label ?? ''
  const type      = raw.type  ?? 'fixed'
  const quantity  = safeNum(raw.quantity, 0)
  const vatRate   = safeNum(raw.vat_rate, 0)

  if (type === 'text') {
    return { label, type: 'fixed', quantity: 0, unit_cost: 0, base_cost: 0, markup_amount: 0, line_total: 0, vat_rate: vatRate }
  }

  const unitCostCents = toCents(safeNum(raw.unit_cost, 0))
  let lineTotalCents: number
  if (type === 'labour') {
    const hours = safeNum(raw.hours ?? quantity, 0)
    lineTotalCents = Math.round(hours * unitCostCents)
  } else if (raw.rate_type === 'day_rate') {
    lineTotalCents = unitCostCents
  } else {
    lineTotalCents = Math.round(quantity * unitCostCents)
  }

  return {
    label,
    type: type as ItemType,
    rate_type:     raw.rate_type,
    quantity,
    unit_cost:     fromCents(unitCostCents),
    base_cost:     fromCents(lineTotalCents),
    markup_amount: 0,
    line_total:    fromCents(lineTotalCents),
    vat_rate:      vatRate,
  }
}

/**
 * calculateInvoice — the invoice equivalent of calculateProposal. Supports
 * per-line VAT rates, a whole-invoice discount (amount or percent, applied
 * proportionally across VAT-rate groups so the breakdown stays correct), and
 * a whole-invoice reverse-charge mode.
 */
export function calculateInvoice(
  lineItems: InvoiceLineItem[],
  options:   InvoiceCalculationOptions = {},
): InvoiceBreakdown {
  const reverseCharge = options.reverseCharge ?? false
  const pricedItems = (lineItems ?? []).map(priceInvoiceLine)

  const subtotalCents = pricedItems.reduce((sum, item) => sum + toCents(item.line_total), 0)

  let discountCents = 0
  if (options.discountType === 'percent') {
    discountCents = Math.round(subtotalCents * safeNum(options.discountValue, 0) / 100)
  } else if (options.discountType === 'amount') {
    discountCents = toCents(safeNum(options.discountValue, 0))
  }
  discountCents = Math.min(Math.max(discountCents, 0), subtotalCents)

  // Group by VAT rate, then spread the discount across groups by each
  // group's share of the subtotal — the last group absorbs any rounding
  // remainder so the distributed discount always sums back to discountCents.
  const groupCentsByRate = new Map<number, number>()
  for (const item of pricedItems) {
    const cents = toCents(item.line_total)
    groupCentsByRate.set(item.vat_rate, (groupCentsByRate.get(item.vat_rate) ?? 0) + cents)
  }
  const rates = [...groupCentsByRate.keys()]

  const vatBreakdown: InvoiceVatBreakdownRow[] = []
  let vatCentsTotal      = 0
  let taxableCentsTotal  = 0
  let distributedDiscount = 0
  rates.forEach((rate, i) => {
    const groupCents = groupCentsByRate.get(rate)!
    const groupDiscountCents = i === rates.length - 1
      ? discountCents - distributedDiscount
      : (subtotalCents > 0 ? Math.round(discountCents * groupCents / subtotalCents) : 0)
    distributedDiscount += groupDiscountCents
    const taxableCents = groupCents - groupDiscountCents
    taxableCentsTotal += taxableCents
    if (!reverseCharge) {
      const vatCents = Math.round(taxableCents * rate / 100)
      vatCentsTotal += vatCents
      if (taxableCents !== 0) {
        vatBreakdown.push({ vat_rate: rate, taxable_amount: fromCents(taxableCents), vat_amount: fromCents(vatCents) })
      }
    }
  })

  return {
    items:            pricedItems,
    subtotal:         fromCents(subtotalCents),
    discount_amount:  fromCents(discountCents),
    taxable_subtotal: fromCents(taxableCentsTotal),
    vat_breakdown:    vatBreakdown.sort((a, b) => b.vat_rate - a.vat_rate),
    vat_amount:       fromCents(vatCentsTotal),
    total:            fromCents(taxableCentsTotal + vatCentsTotal),
    reverse_charge:   reverseCharge,
  }
}

// ─── Convenience helpers (exported for use in the UI) ────────────────────────

/**
 * Format a euro amount using Dutch locale (e.g. "€ 514,25").
 * Pass a different currency code for other currencies.
 */
export function formatEuro(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(amount)
}

/**
 * Compute the line_total for a single item — used for real-time
 * UI feedback as the contractor types (no need to price the whole job).
 */
export function itemTotal(
  item:     LineItem,
  rateCard: PricingRateCard,
): number {
  const result = calculateProposal([item], rateCard)
  return result.items[0]?.line_total ?? 0
}

/**
 * Effective hourly-equivalent for a day-rate line — DISPLAY ONLY, never
 * used in the money calculation itself (a day rate is charged flat per day
 * regardless of how many hours were actually worked that day).
 * e.g. effectiveHourlyRate(255, 5) === 51
 */
export function effectiveHourlyRate(dayRate: number, hoursPerDay: number): number | null {
  if (!(hoursPerDay > 0)) return null
  return Math.round((dayRate / hoursPerDay) * 100) / 100
}

// Display text for a recurring line's quantity/rate columns (e.g. "€
// 255,00/day (€ 51,00/hr)") now lives in src/lib/pdf/pdfLabels.ts —
// bilingual, since it's shown to end users (quote intake UI in the
// contractor's app language, PDFs/DOCX/public page in the quote's own
// language). This file stays language-agnostic; formatEuro/effectiveHourlyRate
// above are the pure-math pieces that file builds on.

// ─── Private helpers ─────────────────────────────────────────────────────────

/** Convert a euro amount to whole cents (integer). */
function toCents(euros: number): number {
  // Math.round handles float imprecision in the input itself:
  // toCents(65.0)  → 6500  (exact)
  // toCents(33.33) → 3333  (rounded from 3332.9999...)
  return Math.round(euros * 100)
}

/** Convert cents back to a euro value with exactly 2 decimal places. */
function fromCents(cents: number): number {
  // Integer division: 8925 / 100 = 89.25 (exact in IEEE-754)
  // We round here just to eliminate any residual float noise from the division.
  return Math.round(cents) / 100
}

/**
 * Sanitise a numeric input that might be undefined, null, NaN, or negative.
 * @param value     The raw value.
 * @param fallback  What to use if the value is missing or non-positive.
 */
function safeNum(value: number | undefined | null, fallback: number): number {
  if (value == null || !Number.isFinite(value) || value < 0) return fallback
  return value
}
