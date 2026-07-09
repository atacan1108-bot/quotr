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
   */
  quantity:  number
  /**
   * Cost per unit in euros, BEFORE any markup.
   * - labour:   ignored — rate comes from the rate card
   * - material: supplier cost per unit
   * - fixed:    the flat price per occurrence
   */
  unit_cost: number
  /** Alias for quantity when type === 'labour', kept for display. */
  hours?:    number
}

/**
 * One fully-priced line, returned in ProposalBreakdown.items.
 * For material lines we expose base_cost and markup_amount separately
 * so the proposal PDF can show the breakdown to the client.
 */
export interface PricedItem {
  label:         string
  type:          ItemType
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
        // Fixed price: quantity × unit_cost, no markup.
        // e.g. 2 service calls × €150 = 2 × 15000¢ = 30000¢ = €300.00
        lineTotalCents = Math.round(quantity * toCents(unitCost))
        baseCostCents  = lineTotalCents
        markupCents    = 0
        fixedTotalCents += lineTotalCents
        break
      }
    }

    return {
      label,
      type,
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

// ─── Recurring service-contract engine ───────────────────────────────────────
//
// A second, independent pricing mode for itemized recurring contracts (e.g.
// a cleaning crew billed at a day rate X days/week, plus an hourly extra-work
// line, plus a monthly fixed fee — each line can have its own rate shape).
// Shares this file's cents-based rounding discipline and helpers, but never
// touches calculateProposal's inputs, outputs, or behavior above — one-off
// quotes are completely unaffected.

export type RecurringRateType  = 'day_rate' | 'hourly' | 'fixed_per_period'
export type RecurringFrequency = 'per_day' | 'per_week' | 'per_month' | 'per_year'

/**
 * One itemized recurring charge. quantity is informational for 'day_rate'
 * (e.g. hours/day, shown for reference — the flat amount is the actual cost,
 * never amount × quantity) and a real multiplier for 'hourly'/'fixed_per_period'
 * (hours worked, or a unit count). occurrences is how many times this line
 * bills within its own frequency unit: frequency 'per_day' + occurrences 5
 * means "5 days a week"; 'per_month' + occurrences 1 means "once a month".
 */
export interface RecurringLineItem {
  label:       string
  rate_type:   RecurringRateType
  amount:      number
  quantity:    number
  frequency:   RecurringFrequency
  occurrences: number
}

/** Per-quote contract facts — lives on jobs.recurring_config, see RecurringConfig in types.ts. */
export interface RecurringContractTerms {
  weeks_per_year:       number
  contract_term_months: number
}

type RecurringRateCard = Pick<RateCard, 'vat_percent' | 'prices_shown_excluding_vat'>

/** One period's money, always computed both ways — prices_shown_excluding_vat only affects display. */
export interface RecurringPeriodAmount {
  ex_vat:     number
  vat_amount: number
  incl_vat:   number
}

/** One priced recurring line, ex-VAT only — VAT is applied once at the quote level, same as calculateProposal. */
export interface RecurringPricedItem {
  label:               string
  rate_type:           RecurringRateType
  amount:              number
  quantity:            number
  frequency:           RecurringFrequency
  occurrences:         number
  cost_per_occurrence: number
  per_week:            number
  per_month:           number
  per_year:            number
  contract_total:      number
}

export interface RecurringBreakdown {
  items:                 RecurringPricedItem[]
  weeks_per_year:        number
  contract_term_months:  number
  vat_percent:           number
  prices_shown_excluding_vat: boolean
  per_week:       RecurringPeriodAmount
  per_month:      RecurringPeriodAmount
  per_year:       RecurringPeriodAmount
  contract_total: RecurringPeriodAmount
}

/**
 * calculateRecurringProposal — the recurring-contract counterpart to
 * calculateProposal. 100% deterministic: no AI, no invented numbers, same
 * integer-cents rounding discipline as the rest of this file.
 *
 * Each line's cost-per-occurrence is annualized directly (occurrences ×
 * weeks_per_year for day/week frequencies, × 12 for monthly, × 1 for yearly)
 * and rounded once — then quote-level week/month/year/contract-term figures
 * are derived from the SUM of every line's exact yearly cents, not from
 * summing already-rounded per-line monthly figures, so the quote total never
 * silently drifts from what the math actually says. contract_total = monthly
 * (rounded) × contract_term_months, matching how a real contract is actually
 * invoiced: a fixed amount every month for the term.
 *
 * Missing/zero inputs (e.g. a contract being drafted with fields not filled
 * in yet, or zero line items) produce zeroed-out results rather than
 * throwing or returning NaN.
 */
export function calculateRecurringProposal(
  lineItems: RecurringLineItem[],
  terms:     RecurringContractTerms,
  rateCard:  RecurringRateCard,
): RecurringBreakdown {
  const weeksPerYear       = safeNum(terms.weeks_per_year, 0)
  const contractTermMonths = safeNum(terms.contract_term_months, 0)
  const vatPercent         = safeNum(rateCard.vat_percent, 0)
  const exVatDisplay       = !!rateCard.prices_shown_excluding_vat

  let totalYearlyCents = 0

  const pricedItems: RecurringPricedItem[] = (lineItems ?? []).map(raw => {
    const label      = raw.label ?? ''
    const rateType    = raw.rate_type ?? 'fixed_per_period'
    const frequency   = raw.frequency ?? 'per_month'
    const amountCents = toCents(safeNum(raw.amount, 0))
    const quantity    = safeNum(raw.quantity, 0)
    const occurrences = safeNum(raw.occurrences, 0)

    // Day rate is a flat price for the day — quantity (hours/day) is shown
    // for reference only and never multiplies the cost.
    const costPerOccurrenceCents = rateType === 'day_rate'
      ? amountCents
      : Math.round(amountCents * quantity)

    let yearlyCents: number
    switch (frequency) {
      case 'per_day':
      case 'per_week':
        yearlyCents = Math.round(costPerOccurrenceCents * occurrences * weeksPerYear)
        break
      case 'per_month':
        yearlyCents = Math.round(costPerOccurrenceCents * occurrences * 12)
        break
      case 'per_year':
        yearlyCents = Math.round(costPerOccurrenceCents * occurrences)
        break
    }

    totalYearlyCents += yearlyCents

    const lineMonthlyCents = Math.round(yearlyCents / 12)
    const lineWeeklyCents  = weeksPerYear > 0 ? Math.round(yearlyCents / weeksPerYear) : 0
    const lineContractTotalCents = Math.round(lineMonthlyCents * contractTermMonths)

    return {
      label, rate_type: rateType, amount: fromCents(amountCents), quantity, frequency, occurrences,
      cost_per_occurrence: fromCents(costPerOccurrenceCents),
      per_week:            fromCents(lineWeeklyCents),
      per_month:           fromCents(lineMonthlyCents),
      per_year:            fromCents(yearlyCents),
      contract_total:      fromCents(lineContractTotalCents),
    }
  })

  // Quote-level totals come from the summed exact yearly cents across every
  // line, not from summing each line's already-rounded monthly/weekly
  // display figures — see doc comment above.
  const monthlyCents = Math.round(totalYearlyCents / 12)
  const weeklyCents  = weeksPerYear > 0 ? Math.round(totalYearlyCents / weeksPerYear) : 0
  const contractTotalCents = Math.round(monthlyCents * contractTermMonths)

  function periodAmount(cents: number): RecurringPeriodAmount {
    const vatCents = Math.round(cents * vatPercent / 100)
    return {
      ex_vat:     fromCents(cents),
      vat_amount: fromCents(vatCents),
      incl_vat:   fromCents(cents + vatCents),
    }
  }

  return {
    items:                 pricedItems,
    weeks_per_year:        weeksPerYear,
    contract_term_months:  contractTermMonths,
    vat_percent:                vatPercent,
    prices_shown_excluding_vat: exVatDisplay,
    per_week:       periodAmount(weeklyCents),
    per_month:      periodAmount(monthlyCents),
    per_year:       periodAmount(totalYearlyCents),
    contract_total: periodAmount(contractTotalCents),
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
