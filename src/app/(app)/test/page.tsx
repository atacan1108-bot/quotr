'use client'

import { useState, useCallback } from 'react'
import { calculateProposal, formatEuro } from '@/lib/pricing'
import type { LineItem, ProposalBreakdown } from '@/lib/pricing'

// ─── Local state types ────────────────────────────────────────────────────────

interface RateCardInputs {
  labour_rate_per_hour:    string   // string so the input stays editable
  material_markup_percent: string
  vat_percent:             string
}

interface DraftItem {
  id:        string
  label:     string
  type:      LineItem['type']
  quantity:  string
  unit_cost: string
}

function newDraftItem(): DraftItem {
  return { id: crypto.randomUUID(), label: '', type: 'labour', quantity: '1', unit_cost: '0' }
}

function parseRC(rc: RateCardInputs) {
  return {
    labour_rate_per_hour:    parseFloat(rc.labour_rate_per_hour)    || 0,
    material_markup_percent: parseFloat(rc.material_markup_percent) || 0,
    vat_percent:             parseFloat(rc.vat_percent)             || 0,
  }
}

function toLineItem(d: DraftItem): LineItem {
  const qty = parseFloat(d.quantity) || 0
  return {
    label:     d.label,
    type:      d.type,
    quantity:  qty,
    unit_cost: parseFloat(d.unit_cost) || 0,
    hours:     d.type === 'labour' ? qty : undefined,
  }
}

const TYPE_CONFIG = {
  labour:   { label: 'Labour',   qtyLabel: 'Hours',    costLabel: null,            hint: 'Rate from card' },
  material: { label: 'Material', qtyLabel: 'Qty',      costLabel: 'Cost/unit (€)', hint: 'Markup applied' },
  fixed:    { label: 'Fixed',    qtyLabel: 'Qty',      costLabel: 'Price (€)',     hint: 'No markup'      },
} as const

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingTestPage() {
  const [rc, setRc] = useState<RateCardInputs>({
    labour_rate_per_hour:    '65',
    material_markup_percent: '15',
    vat_percent:             '21',
  })

  const [drafts, setDrafts] = useState<DraftItem[]>([newDraftItem()])

  // Re-run the engine on every render — it's pure so this is free
  const rateCard   = parseRC(rc)
  const lineItems  = drafts.map(toLineItem)
  const breakdown: ProposalBreakdown = calculateProposal(lineItems, rateCard)

  const updateDraft = useCallback((id: string, patch: Partial<DraftItem>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))
  }, [])

  const removeDraft = useCallback((id: string) => {
    setDrafts(prev => prev.length > 1 ? prev.filter(d => d.id !== id) : prev)
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">DEV</span>
        <h1 className="text-lg font-semibold text-on-surface">Pricing Engine Test</h1>
      </div>
      <p className="text-sm text-muted mb-6">
        Edit the rate card and line items below. The breakdown updates instantly.
        Numbers must match <strong>src/lib/pricing.test.ts</strong> exactly.
      </p>

      {/* ── Rate card ──────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5 mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Rate card</p>
        <div className="grid grid-cols-3 gap-3">
          <RateInput
            label="Labour rate"
            suffix="/hr"
            value={rc.labour_rate_per_hour}
            onChange={v => setRc(r => ({ ...r, labour_rate_per_hour: v }))}
          />
          <RateInput
            label="Markup"
            suffix="%"
            value={rc.material_markup_percent}
            onChange={v => setRc(r => ({ ...r, material_markup_percent: v }))}
          />
          <RateInput
            label="VAT"
            suffix="%"
            value={rc.vat_percent}
            onChange={v => setRc(r => ({ ...r, vat_percent: v }))}
          />
        </div>
      </section>

      {/* ── Line items ─────────────────────────────────────────────────────── */}
      <section className="mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Line items</p>

        <div className="flex flex-col gap-3">
          {drafts.map((draft, idx) => {
            const cfg     = TYPE_CONFIG[draft.type]
            const priced  = breakdown.items[idx]
            return (
              <div key={draft.id} className="bg-white rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wide">Item {idx + 1}</span>
                  <button
                    onClick={() => removeDraft(draft.id)}
                    disabled={drafts.length === 1}
                    className="text-muted hover:text-red-500 transition disabled:opacity-30 p-1"
                    aria-label="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Label */}
                <input
                  type="text"
                  value={draft.label}
                  onChange={e => updateDraft(draft.id, { label: e.target.value })}
                  placeholder="Description…"
                  className={inputCls + ' mb-3'}
                />

                {/* Type toggle */}
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {(['labour', 'material', 'fixed'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateDraft(draft.id, { type: t })}
                      className={`h-9 rounded-lg text-xs font-semibold transition ${
                        draft.type === t
                          ? 'bg-teal-500 text-white'
                          : 'bg-surface border border-border text-muted hover:border-teal-500 hover:text-teal-500'
                      }`}
                    >
                      {TYPE_CONFIG[t].label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* Quantity / Hours */}
                  <div>
                    <label className="text-xs text-muted block mb-1">{cfg.qtyLabel}</label>
                    <input
                      type="number"
                      min="0"
                      step={draft.type === 'labour' ? '0.5' : '1'}
                      value={draft.quantity}
                      onChange={e => updateDraft(draft.id, { quantity: e.target.value })}
                      className={inputSm}
                    />
                  </div>

                  {/* Unit cost (hidden for labour) */}
                  {cfg.costLabel ? (
                    <div>
                      <label className="text-xs text-muted block mb-1">{cfg.costLabel}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.unit_cost}
                        onChange={e => updateDraft(draft.id, { unit_cost: e.target.value })}
                        className={inputSm}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs text-muted block mb-1">Rate</label>
                      <div className={inputSm + ' bg-surface text-muted flex items-center'}>
                        €{rc.labour_rate_per_hour}/hr
                      </div>
                    </div>
                  )}
                </div>

                {/* Per-item result */}
                {priced && (
                  <div className="bg-surface rounded-xl p-3 text-xs space-y-1">
                    {draft.type === 'material' && priced.base_cost > 0 && (
                      <>
                        <div className="flex justify-between text-muted">
                          <span>Base cost</span>
                          <span>{formatEuro(priced.base_cost)}</span>
                        </div>
                        <div className="flex justify-between text-muted">
                          <span>Markup ({rc.material_markup_percent}%)</span>
                          <span>+ {formatEuro(priced.markup_amount)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between font-semibold text-teal-500 pt-1 border-t border-border">
                      <span>Line total</span>
                      <span>{formatEuro(priced.line_total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={() => setDrafts(prev => [...prev, newDraftItem()])}
          className="mt-3 w-full h-12 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted hover:border-teal-500 hover:text-teal-500 transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add item
        </button>
      </section>

      {/* ── Full breakdown ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Computed breakdown</p>

        {/* Category subtotals */}
        <div className="space-y-2 mb-4">
          {breakdown.labour_total   > 0 && <BreakRow label="Labour total"   value={breakdown.labour_total}   />}
          {breakdown.material_total > 0 && <BreakRow label="Materials total" value={breakdown.material_total} sub="(incl. markup)" />}
          {breakdown.fixed_total    > 0 && <BreakRow label="Fixed total"    value={breakdown.fixed_total}    />}
        </div>

        {/* Subtotal + VAT + total */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface font-medium">Subtotal (ex. VAT)</span>
            <span className="font-semibold text-on-surface">{formatEuro(breakdown.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>VAT {breakdown.vat_percent}%</span>
            <span>{formatEuro(breakdown.vat_amount)}</span>
          </div>
        </div>

        <div className="border-t-2 border-on-surface mt-3 pt-3 flex justify-between items-baseline">
          <span className="font-bold text-on-surface text-base">Total incl. VAT</span>
          <span className="text-2xl font-bold text-teal-500">{formatEuro(breakdown.total)}</span>
        </div>

        {/* Verification tip */}
        <div className="mt-5 bg-teal-100 rounded-xl p-3 text-xs text-teal-700">
          <strong>Verify the spec example:</strong> Set Labour €65/hr · Markup 15% · VAT 21%.
          Add one Labour item (3 hours) and one Material item (qty 1, cost €200).
          You should see: subtotal <strong>€ 425,00</strong> · VAT <strong>€ 89,25</strong> · total <strong>€ 514,25</strong>.
        </div>
      </section>
    </div>
  )
}

// ─── Small reusable sub-components ───────────────────────────────────────────

function RateInput({ label, suffix, value, onChange }: {
  label: string; suffix: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full h-10 rounded-xl border border-border bg-surface pl-3 pr-8 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>
      </div>
    </div>
  )
}

function BreakRow({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex justify-between text-sm text-muted">
      <span>{label}{sub && <span className="ml-1 text-xs">{sub}</span>}</span>
      <span>{formatEuro(value)}</span>
    </div>
  )
}

const inputCls = 'w-full h-11 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition'
const inputSm  = 'w-full h-10 rounded-xl border border-border bg-white px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition'
