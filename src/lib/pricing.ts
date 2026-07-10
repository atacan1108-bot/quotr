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

  function periodAmount(cents: number): RecurringPeriodAmount {
    const vatCents = Math.round(cents * vatPercent / 100)
    return {
      ex_vat:     fromCents(cents),
      vat_amount: fromCents(vatCents),
      incl_vat:   fromCents(cents + vatCents),
    }
  }

  return {
    days_per_week:         daysPerWeek,
    weeks_per_year:        weeksPerYear,
    contract_term_months:  contractTermMonths,
    per_day:        periodAmount(dailyCents),
    per_week:       periodAmount(weeklyCents),
    per_month:      periodAmount(monthlyCents),
    per_year:       periodAmount(yearlyCents),
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
