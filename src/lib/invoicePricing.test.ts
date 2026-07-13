/**
 * Quotr Invoice Pricing Engine — Automated Tests
 * ==========================================
 * Run with:  npx tsx src/lib/invoicePricing.test.ts
 *
 * Mirrors the style of pricing.test.ts. Covers what calculateInvoice adds
 * on top of calculateProposal: per-line VAT rates, a VAT breakdown grouped
 * by rate, discounts (amount + percent), reverse charge, and 'text' rows.
 */

import { calculateInvoice } from './pricing.js'
import type { InvoiceLineItem } from './pricing.js'

// ─── Minimal test harness (same as pricing.test.ts) ──────────────────────────

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

function expectLen(actual: unknown[], expected: number, label: string) {
  if (actual.length !== expected) {
    throw new Error(`${label}: expected length ${expected}, got ${actual.length}`)
  }
}

console.log('\nQuotr Invoice Pricing Engine — Test Results')
console.log('======================================\n')

// ── Test 1: single VAT rate, no discount ──────────────────────────────────
//
// 3 hrs labour @ €65/hr = €195.00, 1 fixed @ €100.00, both 21% VAT
// subtotal = 295.00, vat = 61.95, total = 356.95
console.log('Test 1 — single VAT rate, no discount')

const t1Items: InvoiceLineItem[] = [
  { label: 'Labour',  type: 'labour', quantity: 3, unit_cost: 65,  hours: 3, vat_rate: 21 },
  { label: 'Call-out', type: 'fixed', quantity: 1, unit_cost: 100, vat_rate: 21 },
]
const t1 = calculateInvoice(t1Items)
test('subtotal = 295.00',  () => expect(t1.subtotal, 295.00, 'subtotal'))
test('vat_amount = 61.95', () => expect(t1.vat_amount, 61.95, 'vat'))
test('total = 356.95',     () => expect(t1.total, 356.95, 'total'))
test('one vat_breakdown row', () => expectLen(t1.vat_breakdown, 1, 'rows'))
test('vat_breakdown rate = 21', () => expect(t1.vat_breakdown[0].vat_rate, 21, 'rate'))

// ── Test 2: mixed VAT rates (21 + 9), no discount ─────────────────────────
//
// Material @ 21%: 1 × €200.00 = €200.00 → vat 42.00
// Fixed @ 9%:     1 × €100.00 = €100.00 → vat  9.00
// subtotal = 300.00, vat = 51.00, total = 351.00
console.log('\nTest 2 — mixed VAT rates (21% + 9%)')

const t2Items: InvoiceLineItem[] = [
  { label: 'Material', type: 'material', quantity: 1, unit_cost: 200, vat_rate: 21 },
  { label: 'Book',     type: 'fixed',    quantity: 1, unit_cost: 100, vat_rate: 9 },
]
const t2 = calculateInvoice(t2Items)
test('subtotal = 300.00',  () => expect(t2.subtotal, 300.00, 'subtotal'))
test('vat_amount = 51.00', () => expect(t2.vat_amount, 51.00, 'vat'))
test('total = 351.00',     () => expect(t2.total, 351.00, 'total'))
test('two vat_breakdown rows', () => expectLen(t2.vat_breakdown, 2, 'rows'))
test('21% row taxable = 200.00', () => expect(t2.vat_breakdown.find(r => r.vat_rate === 21)!.taxable_amount, 200.00, 'taxable'))
test('21% row vat = 42.00',      () => expect(t2.vat_breakdown.find(r => r.vat_rate === 21)!.vat_amount, 42.00, 'vat'))
test('9% row taxable = 100.00',  () => expect(t2.vat_breakdown.find(r => r.vat_rate === 9)!.taxable_amount, 100.00, 'taxable'))
test('9% row vat = 9.00',        () => expect(t2.vat_breakdown.find(r => r.vat_rate === 9)!.vat_amount, 9.00, 'vat'))

// ── Test 3: percent discount, single rate ─────────────────────────────────
//
// subtotal = 300.00, discount 10% = 30.00, taxable = 270.00, vat 21% = 56.70, total = 326.70
console.log('\nTest 3 — 10% discount, single VAT rate')

const t3Items: InvoiceLineItem[] = [
  { label: 'Widget', type: 'fixed', quantity: 3, unit_cost: 100, vat_rate: 21 },
]
const t3 = calculateInvoice(t3Items, { discountType: 'percent', discountValue: 10 })
test('subtotal = 300.00',         () => expect(t3.subtotal, 300.00, 'subtotal'))
test('discount_amount = 30.00',   () => expect(t3.discount_amount, 30.00, 'discount'))
test('taxable_subtotal = 270.00', () => expect(t3.taxable_subtotal, 270.00, 'taxable'))
test('vat_amount = 56.70',        () => expect(t3.vat_amount, 56.70, 'vat'))
test('total = 326.70',            () => expect(t3.total, 326.70, 'total'))

// ── Test 4: amount discount, mixed rates (proportional split) ────────────
//
// 21% group = 200.00 (2/3 share), 9% group = 100.00 (1/3 share), discount = €30.00
// 21% group discount = round(30 × 200/300) = 20.00 → taxable 180.00 → vat 37.80
// 9% group discount (last group, absorbs remainder) = 30.00 - 20.00 = 10.00 → taxable 90.00 → vat 8.10
// taxable_subtotal = 270.00, vat_amount = 45.90, total = 315.90
console.log('\nTest 4 — €30 amount discount, mixed VAT rates (proportional split)')

const t4Items: InvoiceLineItem[] = [
  { label: 'Material', type: 'material', quantity: 1, unit_cost: 200, vat_rate: 21 },
  { label: 'Book',     type: 'fixed',    quantity: 1, unit_cost: 100, vat_rate: 9 },
]
const t4 = calculateInvoice(t4Items, { discountType: 'amount', discountValue: 30 })
test('discount_amount = 30.00',   () => expect(t4.discount_amount, 30.00, 'discount'))
test('taxable_subtotal = 270.00', () => expect(t4.taxable_subtotal, 270.00, 'taxable'))
test('21% row taxable = 180.00',  () => expect(t4.vat_breakdown.find(r => r.vat_rate === 21)!.taxable_amount, 180.00, 'taxable'))
test('21% row vat = 37.80',       () => expect(t4.vat_breakdown.find(r => r.vat_rate === 21)!.vat_amount, 37.80, 'vat'))
test('9% row taxable = 90.00',    () => expect(t4.vat_breakdown.find(r => r.vat_rate === 9)!.taxable_amount, 90.00, 'taxable'))
test('9% row vat = 8.10',         () => expect(t4.vat_breakdown.find(r => r.vat_rate === 9)!.vat_amount, 8.10, 'vat'))
test('vat_amount = 45.90',        () => expect(t4.vat_amount, 45.90, 'vat total'))
test('total = 315.90',            () => expect(t4.total, 315.90, 'total'))

// ── Test 5: amount discount clamped to subtotal ───────────────────────────
//
// subtotal = 100.00, requested discount = 500.00 → clamped to 100.00, total = 0.00
console.log('\nTest 5 — amount discount larger than subtotal gets clamped')

const t5Items: InvoiceLineItem[] = [
  { label: 'Widget', type: 'fixed', quantity: 1, unit_cost: 100, vat_rate: 21 },
]
const t5 = calculateInvoice(t5Items, { discountType: 'amount', discountValue: 500 })
test('discount_amount clamped to 100.00', () => expect(t5.discount_amount, 100.00, 'discount'))
test('taxable_subtotal = 0.00',           () => expect(t5.taxable_subtotal, 0.00, 'taxable'))
test('total = 0.00',                      () => expect(t5.total, 0.00, 'total'))

// ── Test 6: reverse charge — VAT forced to zero regardless of line rates ──
console.log('\nTest 6 — reverse charge (BTW verlegd)')

const t6Items: InvoiceLineItem[] = [
  { label: 'Consulting', type: 'fixed', quantity: 1, unit_cost: 1000, vat_rate: 21 },
]
const t6 = calculateInvoice(t6Items, { reverseCharge: true })
test('vat_amount = 0.00',       () => expect(t6.vat_amount, 0.00, 'vat'))
test('no vat_breakdown rows',   () => expectLen(t6.vat_breakdown, 0, 'rows'))
test('total = subtotal = 1000.00', () => expect(t6.total, 1000.00, 'total'))
test('reverse_charge flag is true', () => expect(t6.reverse_charge ? 1 : 0, 1, 'flag'))

// ── Test 7: a 'text' line contributes nothing ─────────────────────────────
console.log('\nTest 7 — text-only line contributes zero')

const t7Items: InvoiceLineItem[] = [
  { label: 'Section: materials used', type: 'text', quantity: 0, unit_cost: 0, vat_rate: 21 },
  { label: 'Widget', type: 'fixed', quantity: 1, unit_cost: 50, vat_rate: 21 },
]
const t7 = calculateInvoice(t7Items)
test('text line line_total = 0.00', () => expect(t7.items[0].line_total, 0.00, 'text line'))
test('subtotal = 50.00 (text line ignored)', () => expect(t7.subtotal, 50.00, 'subtotal'))

// ── Test 8: day_rate line — flat, quantity not multiplied in ─────────────
console.log('\nTest 8 — day_rate line ignores quantity (mirrors calculateProposal)')

const t8Items: InvoiceLineItem[] = [
  { label: 'Site day', type: 'fixed', rate_type: 'day_rate', quantity: 8, unit_cost: 255, vat_rate: 21 },
]
const t8 = calculateInvoice(t8Items)
test('day_rate line_total = 255.00 (not × 8)', () => expect(t8.items[0].line_total, 255.00, 'line total'))

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(42)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('All tests passed. The invoice pricing engine is correct. ✓')
} else {
  console.log('Some tests FAILED. Check the output above.')
  process.exit(1)
}
console.log('')
