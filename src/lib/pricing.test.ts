/**
 * Quotr Pricing Engine — Automated Tests
 * ==========================================
 * Run with:  npx tsx src/lib/pricing.test.ts
 *
 * Each test shows the arithmetic step-by-step so you can
 * follow along and confirm the numbers are correct.
 * A "PASS ✓" line means the engine matched the expected value exactly.
 * A "FAIL ✗" line means something is wrong and shows what we got vs expected.
 */

import { calculateProposal, calculateRecurringPeriods, effectiveHourlyRate } from './pricing.js'
import type { LineItem } from './pricing.js'

// ─── Minimal test harness (no framework needed) ──────────────────────────────

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  PASS ✓  ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL ✗  ${name}`)
    console.log(`          ${(err as Error).message}`)
    failed++
  }
}

function expect(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

// ─── Rate card used in most tests ────────────────────────────────────────────

const RC = {
  labour_rate_per_hour:    65,   // €65 per hour
  material_markup_percent: 15,   // +15% on material cost
  vat_percent:             21,   // Dutch VAT
}

// ─── TEST SUITE ──────────────────────────────────────────────────────────────

console.log('\nQuotr Pricing Engine — Test Results')
console.log('======================================\n')

// ── Test 1: The spec example ──────────────────────────────────────────────────
//
// Line items:
//   Labour:   3 hours × €65/hr = €195.00
//   Material: 1 unit × €200.00, +15% markup
//             base = €200.00, markup = €30.00, total = €230.00
//
// Subtotal:   €195.00 + €230.00 = €425.00
// VAT 21%:   €425.00 × 0.21  = €89.25
// Total:     €425.00 + €89.25 = €514.25
//
console.log('Test 1 — Spec example (3 labour hrs + €200 material + 21% VAT)')

const test1Items: LineItem[] = [
  { label: 'Installation labour', type: 'labour',   quantity: 3, unit_cost: 0, hours: 3 },
  { label: 'Solar panel 400W',    type: 'material',  quantity: 1, unit_cost: 200 },
]
const t1 = calculateProposal(test1Items, RC)

test('labour line_total = 195.00',     () => expect(t1.items[0].line_total,    195.00, 'labour total'))
test('material base_cost = 200.00',    () => expect(t1.items[1].base_cost,     200.00, 'material base'))
test('material markup_amount = 30.00', () => expect(t1.items[1].markup_amount,  30.00, 'material markup'))
test('material line_total = 230.00',   () => expect(t1.items[1].line_total,    230.00, 'material total'))
test('subtotal = 425.00',              () => expect(t1.subtotal,               425.00, 'subtotal'))
test('vat_amount = 89.25',             () => expect(t1.vat_amount,              89.25, 'vat'))
test('total = 514.25',                 () => expect(t1.total,                  514.25, 'total'))

// ── Test 2: Empty line items ──────────────────────────────────────────────────
//
// An empty job should return all zeros without crashing.
//
console.log('\nTest 2 — Empty line items')

const t2 = calculateProposal([], RC)

test('items array is empty',  () => expect(t2.items.length,  0,    'items length'))
test('subtotal = 0',          () => expect(t2.subtotal,       0,    'subtotal'))
test('vat_amount = 0',        () => expect(t2.vat_amount,     0,    'vat'))
test('total = 0',             () => expect(t2.total,          0,    'total'))

// ── Test 3: Fractional hours — floating-point precision test ──────────────────
//
// 1.5 hours × €47.50/hr
// In cents: Math.round(1.5 × 4750) = Math.round(7125.0) = 7125¢ = €71.25
// (a naive float approach gives 1.5 × 47.5 = 71.25 — fine here, but test anyway)
//
// Also tests a material with a repeating decimal:
// 3 units × €33.33 at 15% markup
//   base:   Math.round(3 × 3333) = 9999¢ = €99.99
//   markup: Math.round(9999 × 15/100) = Math.round(1499.85) = 1500¢ = €15.00
//   total:  9999 + 1500 = 11499¢ = €114.99
//
// Subtotal: 7125 + 11499 = 18624¢ = €186.24
// VAT 21%:  Math.round(18624 × 21/100) = Math.round(3911.04) = 3911¢ = €39.11
// Total:    18624 + 3911 = 22535¢ = €225.35
//
console.log('\nTest 3 — Fractional hours and repeating-decimal material cost')

const t3 = calculateProposal(
  [
    { label: 'Consultancy',     type: 'labour',   quantity: 1.5, unit_cost: 0,     hours: 1.5 },
    { label: 'Cable per metre', type: 'material', quantity: 3,   unit_cost: 33.33 },
  ],
  { labour_rate_per_hour: 47.50, material_markup_percent: 15, vat_percent: 21 },
)

test('labour line_total = 71.25',   () => expect(t3.items[0].line_total,    71.25,  'labour'))
test('material base_cost = 99.99',  () => expect(t3.items[1].base_cost,     99.99,  'material base'))
test('material markup = 15.00',     () => expect(t3.items[1].markup_amount,  15.00,  'material markup'))
test('material line_total = 114.99',() => expect(t3.items[1].line_total,    114.99, 'material total'))
test('subtotal = 186.24',           () => expect(t3.subtotal,               186.24, 'subtotal'))
test('vat_amount = 39.11',          () => expect(t3.vat_amount,              39.11,  'vat'))
test('total = 225.35',              () => expect(t3.total,                  225.35, 'total'))

// ── Test 4: Fixed items and zero-rate edge cases ──────────────────────────────
//
// Fixed item: 2 service calls × €150 = €300.00  (no markup)
// Labour:     0 hours (edge case) → €0.00
// Material:   0 markup percent → base_cost = line_total, markup = 0
//
// Subtotal: 300 + 0 + 50 = €350.00
// VAT 0%:   €0.00
// Total:    €350.00
//
console.log('\nTest 4 — Fixed items, zero-hour labour, zero VAT')

const t4 = calculateProposal(
  [
    { label: 'Service call',   type: 'fixed',    quantity: 2,  unit_cost: 150 },
    { label: 'Zero hours',     type: 'labour',   quantity: 0,  unit_cost: 0, hours: 0 },
    { label: 'Screws (no mkp)',type: 'material', quantity: 10, unit_cost: 0.50 },
  ],
  { labour_rate_per_hour: 65, material_markup_percent: 0, vat_percent: 0 },
)

test('fixed line_total = 300.00',     () => expect(t4.items[0].line_total,    300.00, 'fixed'))
test('zero-hour labour = 0',          () => expect(t4.items[1].line_total,      0.00, 'zero labour'))
test('zero-markup material = 5.00',   () => expect(t4.items[2].line_total,      5.00, 'zero markup mat'))
test('material markup_amount = 0.00', () => expect(t4.items[2].markup_amount,   0.00, 'markup zero'))
test('subtotal = 305.00',             () => expect(t4.subtotal,               305.00, 'subtotal'))
test('vat_amount = 0.00',             () => expect(t4.vat_amount,               0.00, 'zero vat'))
test('total = 305.00',                () => expect(t4.total,                  305.00, 'total'))

// ── Test 5: Float-trap proof — the famous 0.1 + 0.2 case ─────────────────────
//
// Three fixed items all priced at €0.10 each (10 cents in our integer world).
// Naive float: 0.1 + 0.1 + 0.1 = 0.30000000000000004  ← WRONG
// Our engine:  10¢ + 10¢ + 10¢ = 30¢ = €0.30          ← CORRECT
//
// VAT 10%: Math.round(30 × 10/100) = 3¢ = €0.03
// Total:   33¢ = €0.33
//
console.log('\nTest 5 — Floating-point trap: three × €0.10')

const t5 = calculateProposal(
  [
    { label: 'A', type: 'fixed', quantity: 1, unit_cost: 0.10 },
    { label: 'B', type: 'fixed', quantity: 1, unit_cost: 0.10 },
    { label: 'C', type: 'fixed', quantity: 1, unit_cost: 0.10 },
  ],
  { labour_rate_per_hour: 0, material_markup_percent: 0, vat_percent: 10 },
)

test('subtotal = 0.30 (not 0.30000000000000004)', () => expect(t5.subtotal, 0.30, 'float trap'))
test('vat_amount = 0.03',                          () => expect(t5.vat_amount, 0.03, 'vat'))
test('total = 0.33',                               () => expect(t5.total, 0.33, 'total'))

// ── Test 6: Defensive — missing/undefined fields ──────────────────────────────
//
// The engine must never crash on bad input.
//
console.log('\nTest 6 — Defensive: bad/missing fields')

const t6 = calculateProposal(
  // @ts-expect-error — intentionally passing bad data to test robustness
  [{ label: '', type: 'labour', quantity: undefined, unit_cost: null, hours: undefined }],
  RC,
)

// quantity undefined → safeNum defaults to 0 → 0 hours × any rate = €0
// vat on €0 = €0, total = €0
test('missing quantity → 0 hours → total = 0', () => expect(t6.total, 0, 'bad input total'))

// ── Test 7: Recurring — the exact worked example, from ONE-OFF line items ────
//
// Recurring quotes use the SAME line items and SAME calculateProposal() as
// one-off — there is no separate recurring pricing model. One labour line,
// 5 hours at €51/hr, prices to exactly €255,00 — the "cost of one day".
//   base subtotal (one day)         = 5h × €51,00              = €255,00
//   per_week (ex VAT)  = €255 × 5 days/week                     = €1.275,00
//   per_year (ex VAT)  = €1.275 × 52 weeks                      = €66.300,00
//
console.log('\nTest 7 — Recurring: worked example, derived from one-off line items (5h × €51/hr = €255/day; × 5 days/week × 52 weeks)')

const t7base = calculateProposal(
  [{ label: 'Daily cleaning crew', type: 'labour', quantity: 5, unit_cost: 0, hours: 5 }],
  { labour_rate_per_hour: 51, material_markup_percent: 15, vat_percent: 21 },
)
test('base subtotal (one day) = 255,00', () => expect(t7base.subtotal, 255.00, 'base subtotal'))

const t7 = calculateRecurringPeriods(t7base, { days_per_week: 5, weeks_per_year: 52, contract_term_months: 12 })

test('per_week ex VAT = 1.275,00',  () => expect(t7.per_week.ex_vat, 1275.00, 'week ex vat'))
test('per_year ex VAT = 66.300,00', () => expect(t7.per_year.ex_vat, 66300.00, 'year ex vat'))

// ── Test 8: Recurring — multi-item one-off bundle, scaled to a full contract ─
//
// A realistic "one day on site" bundle — labour + material + a fixed
// call-out fee — priced by the SAME engine as any one-off quote, then
// scaled by the contract terms (5 days/week, 52 weeks/year, 12-month term).
//   labour:   5h × €51,00/hr                          = €255,00
//   material: 2 × €20,00, +15% markup (€40 + €6)       = €46,00
//   fixed:    call-out fee                             = €50,00
//   base subtotal (one day, ex VAT)                    = €351,00
//
//   per_week (ex VAT):  €351 × 5 days                  = €1.755,00
//   per_year (ex VAT):  €1.755 × 52 weeks               = €91.260,00
//   per_month (ex VAT): €91.260 / 12                    = €7.605,00
//   contract_total (ex VAT): €7.605 × 12 months         = €91.260,00
//   contract_total VAT (21%): €91.260 × 21%              = €19.164,60
//   contract_total incl VAT: €91.260 + €19.164,60        = €110.424,60
//
console.log('\nTest 8 — Recurring: multi-item bundle (labour+material+fixed) scaled to a full contract')

const t8base = calculateProposal(
  [
    { label: 'Daily cleaning crew', type: 'labour',   quantity: 5, unit_cost: 0,  hours: 5 },
    { label: 'Cleaning supplies',   type: 'material', quantity: 2, unit_cost: 20 },
    { label: 'Call-out fee',        type: 'fixed',    quantity: 1, unit_cost: 50 },
  ],
  { labour_rate_per_hour: 51, material_markup_percent: 15, vat_percent: 21 },
)
test('base subtotal (one day) = 351,00', () => expect(t8base.subtotal, 351.00, 'base subtotal'))

const t8 = calculateRecurringPeriods(t8base, { days_per_week: 5, weeks_per_year: 52, contract_term_months: 12 })

test('per_week ex VAT = 1.755,00',          () => expect(t8.per_week.ex_vat,        1755.00, 'week ex vat'))
test('per_year ex VAT = 91.260,00',         () => expect(t8.per_year.ex_vat,       91260.00, 'year ex vat'))
test('per_month ex VAT = 7.605,00',         () => expect(t8.per_month.ex_vat,       7605.00, 'month ex vat'))
test('contract_total ex VAT = 91.260,00',   () => expect(t8.contract_total.ex_vat, 91260.00, 'contract ex vat'))
test('contract_total VAT = 19.164,60',      () => expect(t8.contract_total.vat_amount, 19164.60, 'contract vat'))
test('contract_total incl VAT = 110.424,60',() => expect(t8.contract_total.incl_vat, 110424.60, 'contract incl vat'))

// ── Test 9: Recurring — rounding consistency ──────────────────────────────────
//
// Chosen so yearly ÷ 12 does NOT divide evenly, to prove the rule is
// "round the invoiced monthly amount, then × the term" — not "compute the
// term total from an unrounded fraction". This is intentional: a real
// contract invoices a fixed rounded amount every month.
//
//   base subtotal (one day, ex VAT):  €100,00
//   per_year (ex VAT):  €100 × 1 day/week × 53 weeks   = €5.300,00
//   per_month (ex VAT): round(€5.300,00 / 12)          = €441,67
//   contract_total:     €441,67 × 12                   = €5.300,04  (4 cents more than per_year — expected)
//
console.log('\nTest 9 — Recurring: rounding stays exact and consistent, never drifts silently')

const t9base = calculateProposal(
  [{ label: 'Weekly visit', type: 'fixed', quantity: 1, unit_cost: 100 }],
  { labour_rate_per_hour: 0, material_markup_percent: 0, vat_percent: 21 },
)
const t9 = calculateRecurringPeriods(t9base, { days_per_week: 1, weeks_per_year: 53, contract_term_months: 12 })

test('per_year ex VAT = 5.300,00',          () => expect(t9.per_year.ex_vat,        5300.00, 'year ex vat'))
test('per_month ex VAT = 441,67 (rounded)', () => expect(t9.per_month.ex_vat,        441.67, 'month rounded'))
test('contract_total = 5.300,04',           () => expect(t9.contract_total.ex_vat,  5300.04, 'contract total'))

// ── Test 10: Recurring — graceful zeros on empty/missing inputs ──────────────
//
// A contract being drafted with no line items yet (exactly the bug report —
// an empty recurring quote) must never throw or return NaN — everything
// should come back as a clean zero.
//
console.log('\nTest 10 — Recurring: zero line items never throw, always zero')

const t10base = calculateProposal([], { labour_rate_per_hour: 65, material_markup_percent: 15, vat_percent: 21 })
const t10 = calculateRecurringPeriods(t10base, { days_per_week: 0, weeks_per_year: 0, contract_term_months: 0 })

test('per_week ex VAT = 0',         () => expect(t10.per_week.ex_vat,       0, 'week zero'))
test('per_month ex VAT = 0',        () => expect(t10.per_month.ex_vat,      0, 'month zero'))
test('contract_total incl VAT = 0', () => expect(t10.contract_total.incl_vat, 0, 'contract zero'))

// ── Test 11: Recurring rate types — Daily rate / Hourly rate / Fixed ─────────
//
// The three rate types a recurring contract's line items can use, restored
// as a `rate_type` field on the exact same LineItem/calculateProposal used
// everywhere else — not a second pricing model. The exact numbers from the
// request:
//   Daily rate: €255,00/day, 5 hours/day (quantity is reference only)
//     -> line_total = €255,00 (NOT €255 × 5 — a day rate doesn't multiply)
//     -> effective hourly rate = €255 / 5 = €51,00/hr (display only)
//     -> × 5 days/week × 52 weeks/year = €66.300,00/year
//
console.log('\nTest 11 — Recurring rate types: Daily rate / Hourly rate / Fixed')

const t11day = calculateProposal(
  [{ label: 'On-site supervision', type: 'fixed', quantity: 5, unit_cost: 255, rate_type: 'day_rate' }],
  RC,
)
test('day_rate line_total = 255.00 (quantity not multiplied)', () => expect(t11day.items[0].line_total, 255.00, 'day rate total'))
test('effectiveHourlyRate(255, 5) = 51.00',                    () => expect(effectiveHourlyRate(255, 5) ?? -1, 51.00, 'effective hourly'))

const t11dayPeriods = calculateRecurringPeriods(t11day, { days_per_week: 5, weeks_per_year: 52, contract_term_months: 12 })
test('day_rate × 5 days/week × 52 weeks = 66.300,00/year', () => expect(t11dayPeriods.per_year.ex_vat, 66300.00, 'day rate year'))

const t11hourly = calculateProposal(
  [{ label: 'Extra hours', type: 'fixed', quantity: 3, unit_cost: 45, rate_type: 'hourly' }],
  RC,
)
test('hourly line_total = 135.00 (3h × €45/hr)', () => expect(t11hourly.items[0].line_total, 135.00, 'hourly total'))

const t11fixed = calculateProposal(
  [{ label: 'Monthly admin fee', type: 'fixed', quantity: 1, unit_cost: 40, rate_type: 'fixed' }],
  RC,
)
test('fixed rate_type line_total = 40.00', () => expect(t11fixed.items[0].line_total, 40.00, 'fixed rate_type total'))

// Mixed bundle: day rate + hourly extra + fixed admin fee, all in ONE
// recurring quote — same array, same engine, summed like any other quote.
console.log('\nTest 12 — Recurring: mixed Daily/Hourly/Fixed bundle scaled to a full contract')

const t12base = calculateProposal(
  [
    { label: 'On-site supervision', type: 'fixed', quantity: 5, unit_cost: 255, rate_type: 'day_rate' },
    { label: 'Extra hours',         type: 'fixed', quantity: 3, unit_cost: 45,  rate_type: 'hourly'   },
    { label: 'Monthly admin fee',   type: 'fixed', quantity: 1, unit_cost: 40,  rate_type: 'fixed'    },
  ],
  RC,
)
test('bundle subtotal (one day) = 430.00', () => expect(t12base.subtotal, 430.00, 'bundle subtotal'))

const t12 = calculateRecurringPeriods(t12base, { days_per_week: 5, weeks_per_year: 52, contract_term_months: 12 })
test('bundle per_week ex VAT = 2.150,00',  () => expect(t12.per_week.ex_vat,  2150.00,  'bundle week'))
test('bundle per_year ex VAT = 111.800,00',() => expect(t12.per_year.ex_vat, 111800.00, 'bundle year'))
test('bundle per_month ex VAT = 9.316,67', () => expect(t12.per_month.ex_vat, 9316.67,  'bundle month'))

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(42)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('All tests passed. The pricing engine is correct. ✓')
} else {
  console.log('Some tests FAILED. Check the output above.')
  process.exit(1)
}
console.log('')
