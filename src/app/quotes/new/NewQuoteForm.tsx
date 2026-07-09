'use client'

import {
  useState, useEffect, useRef, useMemo, useCallback,
  type ChangeEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateProposal, calculateRecurringProposal, itemTotal, formatEuro } from '@/lib/pricing'
import type { LineItem, ProposalBreakdown, RecurringContractTerms } from '@/lib/pricing'
import type { QuoteType, RecurringConfig } from '@/lib/types'

// ─── Prop types ───────────────────────────────────────────────────────────────

interface ClientRow { id: string; name: string; phone: string | null }
type RateCardSlice = {
  labour_rate_per_hour: number
  material_markup_percent: number
  vat_percent: number
  day_rate: number | null
  hours_per_day: number | null
  weekend_surcharge_percent: number | null
  holiday_surcharge_percent: number | null
  extra_work_hourly_rate: number | null
  prices_shown_excluding_vat: boolean
}

const ACCENT = '#0F766E'

interface Props {
  ownerId:         string
  existingClients: ClientRow[]
  rateCard:        RateCardSlice
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface DraftItem {
  id:        string
  label:     string
  type:      LineItem['type']
  quantity:  number   // hours for labour, units for others
  unit_cost: number   // 0 for labour (rate from rateCard); cost/unit for others
}

// State for the bottom sheet when adding or editing an item
interface SheetState {
  open:      boolean
  editingId: string | null   // null = new item
  type:      LineItem['type']
  label:     string
  qty:       string           // kept as string so inputs stay editable
  unitCost:  string
}

function blankSheet(type: LineItem['type']): SheetState {
  return { open: true, editingId: null, type, label: '', qty: '', unitCost: '' }
}

function draftToLineItem(d: DraftItem): LineItem {
  return {
    label:     d.label,
    type:      d.type,
    quantity:  d.quantity,
    unit_cost: d.unit_cost,
    hours:     d.type === 'labour' ? d.quantity : undefined,
  }
}

// ─── Per-type display config ──────────────────────────────────────────────────

const ITEM_CFG = {
  labour: {
    label:     'Labour',
    color:     'bg-amber-50 border-amber-200 text-amber-700',
    dot:       'bg-amber-400',
    qtyLabel:  'Hours',
    qtyStep:   '0.5',
    showCost:  false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  material: {
    label:    'Material',
    color:    'bg-blue-50 border-blue-200 text-blue-700',
    dot:      'bg-blue-400',
    qtyLabel: 'Qty',
    qtyStep:  '1',
    showCost: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    ),
  },
  fixed: {
    label:    'Fixed',
    color:    'bg-purple-50 border-purple-200 text-purple-700',
    dot:      'bg-purple-400',
    qtyLabel: 'Qty',
    qtyStep:  '1',
    showCost: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
      </svg>
    ),
  },
} as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewQuoteForm({ ownerId, existingClients, rateCard }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // ── Main form state ──────────────────────────────────────────
  const [jobTitle,  setJobTitle]  = useState('')
  const [items,     setItems]     = useState<DraftItem[]>([])
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Quote type + recurring contract state ─────────────────────
  const [quoteType, setQuoteType] = useState<QuoteType>('one_off')
  const [daysPerWeekStr,       setDaysPerWeekStr]       = useState('5')
  const [weeksPerYearStr,      setWeeksPerYearStr]      = useState('52')
  const [contractTermStr,      setContractTermStr]      = useState('12')
  const [noticePeriodStr,      setNoticePeriodStr]      = useState('')
  const [autoRenewal,          setAutoRenewal]          = useState(false)

  // ── Client state ─────────────────────────────────────────────
  const [clientSearch,    setClientSearch]    = useState('')
  const [selectedClient,  setSelectedClient]  = useState<ClientRow | null>(null)
  const [newClientPhone,  setNewClientPhone]  = useState('')
  const [clientListOpen,  setClientListOpen]  = useState(false)

  // ── Bottom sheet state ───────────────────────────────────────
  const [sheet, setSheet] = useState<SheetState>({
    open: false, editingId: null, type: 'labour',
    label: '', qty: '', unitCost: '',
  })
  const sheetLabelRef = useRef<HTMLInputElement>(null)

  // ── Derived: live totals ─────────────────────────────────────
  const lineItems = useMemo<LineItem[]>(
    () => items.map(draftToLineItem),
    [items],
  )
  const totals: ProposalBreakdown = useMemo(
    () => calculateProposal(lineItems, rateCard),
    [lineItems, rateCard],
  )

  // ── Derived: recurring contract terms + live totals ───────────
  const recurringTerms: RecurringContractTerms = useMemo(() => ({
    days_per_week:        parseFloat(daysPerWeekStr)  || 0,
    weeks_per_year:       parseFloat(weeksPerYearStr)  || 0,
    contract_term_months: parseFloat(contractTermStr)  || 0,
  }), [daysPerWeekStr, weeksPerYearStr, contractTermStr])

  const recurringBreakdown = useMemo(
    () => calculateRecurringProposal(recurringTerms, rateCard),
    [recurringTerms, rateCard],
  )

  const recurringConfig: RecurringConfig = useMemo(() => ({
    days_per_week:        recurringTerms.days_per_week,
    weeks_per_year:       recurringTerms.weeks_per_year,
    contract_term_months: recurringTerms.contract_term_months,
    notice_period_months: noticePeriodStr.trim() ? parseFloat(noticePeriodStr) || 0 : null,
    auto_renewal:         autoRenewal,
  }), [recurringTerms, noticePeriodStr, autoRenewal])

  // ── Sheet preview (total for just the item being entered) ────
  const sheetPreview = useMemo(() => {
    if (!sheet.open) return null
    return itemTotal(
      {
        label:     sheet.label,
        type:      sheet.type,
        quantity:  parseFloat(sheet.qty)      || 0,
        unit_cost: parseFloat(sheet.unitCost) || 0,
        hours:     sheet.type === 'labour' ? parseFloat(sheet.qty) || 0 : undefined,
      },
      rateCard,
    )
  }, [sheet, rateCard])

  // ── Lock body scroll when sheet is open ─────────────────────
  useEffect(() => {
    if (sheet.open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sheet.open])

  // ── Auto-focus sheet label input after animation starts ──────
  useEffect(() => {
    if (!sheet.open) return
    const t = setTimeout(() => sheetLabelRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [sheet.open, sheet.type])

  // ── Client helpers ───────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return existingClients.slice(0, 8)
    return existingClients.filter(c => c.name.toLowerCase().includes(q))
  }, [clientSearch, existingClients])

  const exactMatch = existingClients.some(
    c => c.name.toLowerCase() === clientSearch.trim().toLowerCase(),
  )

  function selectClient(c: ClientRow) {
    setSelectedClient(c)
    setClientSearch('')
    setClientListOpen(false)
  }

  function clearClient() {
    setSelectedClient(null)
    setClientSearch('')
    setNewClientPhone('')
  }

  // ── Sheet helpers ─────────────────────────────────────────────
  function openAddSheet(type: LineItem['type']) {
    setSheet(blankSheet(type))
  }

  function openEditSheet(item: DraftItem) {
    setSheet({
      open:      true,
      editingId: item.id,
      type:      item.type,
      label:     item.label,
      qty:       item.quantity > 0  ? String(item.quantity)  : '',
      unitCost:  item.unit_cost > 0 ? String(item.unit_cost) : '',
    })
  }

  function closeSheet() {
    setSheet(s => ({ ...s, open: false }))
  }

  // ── Commit sheet → add or update item ─────────────────────────
  function commitSheet() {
    const qty  = parseFloat(sheet.qty)      || 0
    const cost = parseFloat(sheet.unitCost) || 0
    if (!sheet.label.trim() || qty <= 0) return

    const draft: DraftItem = {
      id:        sheet.editingId ?? crypto.randomUUID(),
      label:     sheet.label.trim(),
      type:      sheet.type,
      quantity:  qty,
      unit_cost: cost,
    }

    if (sheet.editingId) {
      setItems(prev => prev.map(i => i.id === sheet.editingId ? draft : i))
    } else {
      setItems(prev => [...prev, draft])
    }
    closeSheet()
  }

  function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function deleteFromSheet() {
    if (sheet.editingId) deleteItem(sheet.editingId)
    closeSheet()
  }

  // ── Save to Supabase ──────────────────────────────────────────
  async function handleSave() {
    if (quoteType === 'one_off' && items.length === 0) return
    if (quoteType === 'recurring' && !canSaveRecurring) return
    setSaving(true)
    setSaveError(null)
    try {
      // Resolve client — identical for both quote types
      let clientId: string | null = selectedClient?.id ?? null

      if (!selectedClient && clientSearch.trim()) {
        const { data: c, error: ce } = await supabase
          .from('clients')
          .insert({
            owner_id: ownerId,
            name:     clientSearch.trim(),
            phone:    newClientPhone.trim() || null,
          })
          .select('id')
          .single()
        if (ce) throw ce
        clientId = c.id
      }

      if (quoteType === 'one_off') {
        // Insert job
        const validItems = items.filter(i => i.label.trim())
        const { data: job, error: je } = await supabase
          .from('jobs')
          .insert({
            owner_id:   ownerId,
            client_id:  clientId,
            title:      jobTitle.trim() || 'Untitled job',
            status:     'draft',
            quote_type: 'one_off',
            line_items: validItems.map(draftToLineItem),
          })
          .select('id')
          .single()
        if (je) throw je

        // Insert proposal — store totals without the items array (those live in jobs.line_items)
        const { items: _items, ...moneyBreakdown } = calculateProposal(validItems.map(draftToLineItem), rateCard)
        const { error: pe } = await supabase
          .from('proposals')
          .insert({ owner_id: ownerId, job_id: job.id, computed_totals: moneyBreakdown })
        if (pe) throw pe

        router.push(`/quotes/${job.id}`)
        router.refresh()
      } else {
        // Recurring: no line items — the contract terms + rate card drive the price.
        const { data: job, error: je } = await supabase
          .from('jobs')
          .insert({
            owner_id:         ownerId,
            client_id:        clientId,
            title:            jobTitle.trim() || 'Untitled contract',
            status:            'draft',
            quote_type:        'recurring',
            line_items:        [],
            recurring_config:  recurringConfig,
          })
          .select('id')
          .single()
        if (je) throw je

        const { error: pe } = await supabase
          .from('proposals')
          .insert({ owner_id: ownerId, job_id: job.id, computed_totals: recurringBreakdown })
        if (pe) throw pe

        router.push(`/quotes/${job.id}`)
        router.refresh()
      }
    } catch (err) {
      // Supabase returns plain objects {code, message, hint}, not Error instances.
      // Fall through the chain to get the most useful message available.
      const msg =
        (err instanceof Error && err.message)
          ? err.message
          : (err as { message?: string })?.message
          ?? 'Save failed — please try again.'
      setSaveError(msg)
      setSaving(false)
    }
  }

  const canSaveRecurring =
    recurringTerms.days_per_week > 0 &&
    recurringTerms.weeks_per_year > 0 &&
    recurringTerms.contract_term_months > 0

  const canSave = !saving && (quoteType === 'one_off' ? items.length > 0 : canSaveRecurring)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Sticky header ──────────────────────────────────────── */}
      <header className="bg-white border-b border-border sticky top-0 z-20"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-muted hover:text-on-surface transition -ml-1 p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back
          </button>
          <span className="text-sm font-semibold text-on-surface">New Quote</span>
          {/* Rate card pill */}
          <div className="text-xs text-muted bg-surface border border-border rounded-full px-2.5 py-1 hidden sm:block">
            €{rateCard.labour_rate_per_hour}/hr · +{rateCard.material_markup_percent}% · VAT {rateCard.vat_percent}%
          </div>
          <div className="w-16 sm:hidden" />
        </div>
      </header>

      {/* ── Scrollable content — pb leaves room for fixed bottom bar ── */}
      <div className="max-w-lg mx-auto px-4 pt-5 pb-56">

        {/* Job title */}
        <input
          type="text"
          value={jobTitle}
          onChange={e => setJobTitle(e.target.value)}
          placeholder="Job description (e.g. Kitchen reno, solar install…)"
          className="w-full h-13 rounded-2xl border border-border bg-white px-4 py-3 text-base font-medium text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition mb-4"
        />

        {/* ── QUOTE TYPE ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['one_off', 'recurring'] as const).map(type => (
            <button
              key={type}
              onClick={() => setQuoteType(type)}
              className="h-12 rounded-2xl text-sm font-semibold border-2 transition active:scale-[0.98]"
              style={
                quoteType === type
                  ? { backgroundColor: ACCENT, borderColor: ACCENT, color: '#fff' }
                  : { backgroundColor: '#fff', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
              }
            >
              {type === 'one_off' ? 'One-off job' : 'Recurring contract'}
            </button>
          ))}
        </div>

        {/* ── CLIENT ──────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Client</span>
          </div>

          {selectedClient ? (
            /* Selected client chip */
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{selectedClient.name}</p>
                {selectedClient.phone && (
                  <p className="text-xs text-muted mt-0.5">{selectedClient.phone}</p>
                )}
              </div>
              <button
                onClick={clearClient}
                className="text-muted hover:text-red-500 transition p-1.5 -mr-1"
                aria-label="Remove client"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            /* Client search / new-client entry */
            <div className="px-4 py-3">
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientListOpen(true) }}
                onFocus={() => setClientListOpen(true)}
                placeholder="Search or type new client name…"
                className="w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />

              {/* Client list */}
              {clientListOpen && (
                <div className="mt-2 rounded-xl border border-border bg-white overflow-hidden">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => selectClient(c)}  // mouseDown fires before blur
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface text-left border-b border-border last:border-0 transition"
                    >
                      <span className="text-sm font-medium text-on-surface">{c.name}</span>
                      {c.phone && <span className="text-xs text-muted">{c.phone}</span>}
                    </button>
                  ))}

                  {/* Create new client option */}
                  {clientSearch.trim() && !exactMatch && (
                    <button
                      onMouseDown={() => {
                        setClientListOpen(false)
                        // Keep the name in clientSearch; show phone field below
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-teal-100 text-teal-700 text-sm font-semibold transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      Add "{clientSearch.trim()}" as new client
                    </button>
                  )}

                  {filteredClients.length === 0 && !clientSearch.trim() && (
                    <p className="px-3 py-3 text-sm text-muted text-center">No clients yet</p>
                  )}
                </div>
              )}

              {/* Phone field for new client (shown when typing a name not in the list) */}
              {clientSearch.trim() && !exactMatch && !clientListOpen && (
                <input
                  type="tel"
                  inputMode="tel"
                  value={newClientPhone}
                  onChange={e => setNewClientPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="mt-2 w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              )}
            </div>
          )}
        </section>

        {/* ── LINE ITEMS (one-off only — unchanged) ─────────────── */}
        {quoteType === 'one_off' && (
        <section>
          {items.length > 0 && (
            <div className="flex flex-col gap-2.5 mb-3">
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  rateCard={rateCard}
                  onEdit={() => openEditSheet(item)}
                  onDelete={() => deleteItem(item.id)}
                />
              ))}
            </div>
          )}

          {items.length === 0 && (
            <p className="text-center text-sm text-muted py-6">
              Add at least one item below to build your quote.
            </p>
          )}

          {/* ── Three add buttons ───────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            {(['labour', 'material', 'fixed'] as const).map(type => {
              const cfg = ITEM_CFG[type]
              return (
                <button
                  key={type}
                  onClick={() => openAddSheet(type)}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border hover:border-teal-500 hover:bg-teal-100 hover:text-teal-700 text-muted transition active:scale-95"
                >
                  {cfg.icon}
                  <span className="text-xs font-semibold leading-tight text-center">
                    + {cfg.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        )}

        {/* Rate card note — visible on mobile only */}
        {quoteType === 'one_off' && (
        <p className="mt-4 text-center text-xs text-muted sm:hidden">
          Labour €{rateCard.labour_rate_per_hour}/hr · Materials +{rateCard.material_markup_percent}% · VAT {rateCard.vat_percent}%
        </p>
        )}

        {/* ── RECURRING CONTRACT TERMS ───────────────────────── */}
        {quoteType === 'recurring' && (
        <section className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Contract terms</span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {(!rateCard.day_rate || !rateCard.hours_per_day) && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-xs text-amber-800 leading-snug">
                  No day rate set yet — go to Settings to set your day rate and hours/day, or the totals below will show €0.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <RField label="Days / week">
                <input
                  type="number" inputMode="decimal" min="0" max="7" step="1"
                  value={daysPerWeekStr}
                  onChange={e => setDaysPerWeekStr(e.target.value)}
                  className={rInput}
                />
              </RField>
              <RField label="Weeks / year">
                <input
                  type="number" inputMode="decimal" min="0" max="52" step="1"
                  value={weeksPerYearStr}
                  onChange={e => setWeeksPerYearStr(e.target.value)}
                  className={rInput}
                />
              </RField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <RField label="Contract length (months)">
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={contractTermStr}
                  onChange={e => setContractTermStr(e.target.value)}
                  className={rInput}
                />
              </RField>
              <RField label="Notice period (months)">
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={noticePeriodStr}
                  onChange={e => setNoticePeriodStr(e.target.value)}
                  placeholder="Optional"
                  className={rInput}
                />
              </RField>
            </div>

            <button
              onClick={() => setAutoRenewal(v => !v)}
              className="flex items-center justify-between h-12 px-4 rounded-xl border border-border bg-surface"
            >
              <span className="text-sm font-medium text-on-surface">Auto-renews after term</span>
              <span
                className="w-11 h-6 rounded-full relative transition"
                style={{ backgroundColor: autoRenewal ? ACCENT : 'var(--color-border)' }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: autoRenewal ? 'translateX(22px)' : 'translateX(2px)' }}
                />
              </span>
            </button>
          </div>
        </section>
        )}

        {/* ── RECURRING LIVE SUMMARY ─────────────────────────── */}
        {quoteType === 'recurring' && (
        <section className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">Pricing summary</span>
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            <RecurringSummaryRow label="Hourly rate" value={formatEuro(recurringBreakdown.hourly_rate)} />
            {recurringBreakdown.weekend_surcharge_percent > 0 && (
              <RecurringSummaryRow
                label={`Weekend rate (+${recurringBreakdown.weekend_surcharge_percent}%)`}
                value={formatEuro(recurringBreakdown.weekend_hourly_rate)}
              />
            )}
            {recurringBreakdown.holiday_surcharge_percent > 0 && (
              <RecurringSummaryRow
                label={`Holiday rate (+${recurringBreakdown.holiday_surcharge_percent}%)`}
                value={formatEuro(recurringBreakdown.holiday_hourly_rate)}
              />
            )}
            <div className="h-px bg-border my-1" />
            <RecurringSummaryRow
              label="Per week"
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_week.ex_vat : recurringBreakdown.per_week.incl_vat)}
            />
            <RecurringSummaryRow
              label="Per month"
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_month.ex_vat : recurringBreakdown.per_month.incl_vat)}
            />
            <RecurringSummaryRow
              label="Per year"
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_year.ex_vat : recurringBreakdown.per_year.incl_vat)}
            />
            <p className="text-[11px] text-muted text-right -mt-1">
              {rateCard.prices_shown_excluding_vat ? 'excl. VAT' : 'incl. VAT'}
            </p>
          </div>
        </section>
        )}

      </div>

      {/* ── LIVE TOTAL BAR (fixed at bottom) ──────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-lg mx-auto px-4 pt-3 pb-1">

          {/* Error banner — shown here so it's always visible, not buried in scroll */}
          {saveError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-xs text-red-700 leading-snug">{saveError}</p>
            </div>
          )}

          {/* Breakdown rows */}
          {quoteType === 'one_off' ? (
          <div className="flex flex-col gap-0.5 mb-3">
            {totals.labour_total   > 0 && <TotalRow label="Labour"    value={totals.labour_total}   />}
            {totals.material_total > 0 && <TotalRow label="Materials" value={totals.material_total} />}
            {totals.fixed_total    > 0 && <TotalRow label="Fixed"     value={totals.fixed_total}    />}
            {items.length > 0 && (
              <>
                <div className="flex justify-between text-xs text-muted pt-0.5">
                  <span>Subtotal</span>
                  <span>{formatEuro(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>VAT {totals.vat_percent}%</span>
                  <span>{formatEuro(totals.vat_amount)}</span>
                </div>
              </>
            )}
          </div>
          ) : (
          <div className="flex flex-col gap-0.5 mb-3">
            {canSaveRecurring && (
              <>
                <div className="flex justify-between text-xs text-muted">
                  <span>Per month</span>
                  <span>{formatEuro(recurringBreakdown.per_month.incl_vat)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>Over {recurringBreakdown.contract_term_months}-month term</span>
                  <span>{formatEuro(recurringBreakdown.contract_total.incl_vat)}</span>
                </div>
              </>
            )}
          </div>
          )}

          <div className="flex items-center gap-3">
            {/* Grand total */}
            <div className="flex-1 min-w-0">
              {quoteType === 'one_off' ? (
                <>
                  <span className="text-xs font-medium text-muted block">Total incl. VAT</span>
                  <span className={`text-2xl font-bold leading-tight ${items.length > 0 ? 'text-teal-500' : 'text-muted'}`}>
                    {formatEuro(totals.total)}
                  </span>
                  {items.length === 0 && (
                    <span className="text-xs text-muted block">Add items above first</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted block">Contract total incl. VAT</span>
                  <span className={`text-2xl font-bold leading-tight ${canSaveRecurring ? 'text-teal-500' : 'text-muted'}`}>
                    {formatEuro(recurringBreakdown.contract_total.incl_vat)}
                  </span>
                  {!canSaveRecurring && (
                    <span className="text-xs text-muted block">Fill in the contract terms above</span>
                  )}
                </>
              )}
            </div>

            {/* Save quote button — always visible, state communicates its readiness */}
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="h-12 px-6 rounded-xl font-semibold text-sm active:scale-95 transition shrink-0 bg-[#0F766E] text-white hover:bg-teal-700 disabled:bg-border disabled:text-muted disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : 'Save quote'}
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SHEET ─────────────────────────────────────── */}
      <AddItemSheet
        sheet={sheet}
        rateCard={rateCard}
        preview={sheetPreview ?? 0}
        labelRef={sheetLabelRef}
        onClose={closeSheet}
        onCommit={commitSheet}
        onDelete={deleteFromSheet}
        onChange={patch => setSheet(s => ({ ...s, ...patch }))}
      />
    </div>
  )
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({
  item, rateCard, onEdit, onDelete,
}: {
  item:     DraftItem
  rateCard: RateCardSlice
  onEdit:   () => void
  onDelete: () => void
}) {
  const cfg   = ITEM_CFG[item.type]
  const total = itemTotal(draftToLineItem(item), rateCard)

  return (
    <button
      onClick={onEdit}
      className="w-full bg-white rounded-2xl border border-border p-4 text-left hover:border-teal-500 transition active:scale-[0.99] group"
    >
      <div className="flex items-start gap-3">
        {/* Type indicator dot */}
        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Label + meta */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-on-surface text-sm leading-snug truncate">{item.label}</p>
          <p className="text-xs text-muted mt-0.5 capitalize">
            {cfg.label}
            {item.type === 'labour'
              ? ` · ${item.quantity} hr`
              : ` · ${item.quantity} × ${formatEuro(item.unit_cost)}`}
          </p>
        </div>

        {/* Line total + delete */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-teal-500">{formatEuro(total)}</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-muted hover:text-red-500 transition p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Delete item"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </button>
  )
}

// ─── TotalRow (for the live total bar) ───────────────────────────────────────

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs text-muted">
      <span>{label}</span>
      <span>{formatEuro(value)}</span>
    </div>
  )
}

// ─── Recurring contract UI helpers ───────────────────────────────────────────

const rInput = 'w-full h-12 rounded-xl border border-border bg-white px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition'

function RField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function RecurringSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-on-surface">{value}</span>
    </div>
  )
}

// ─── AddItemSheet ─────────────────────────────────────────────────────────────

interface SheetProps {
  sheet:    SheetState
  rateCard: RateCardSlice
  preview:  number
  labelRef: React.RefObject<HTMLInputElement | null>
  onClose:  () => void
  onCommit: () => void
  onDelete: () => void
  onChange: (patch: Partial<SheetState>) => void
}

function AddItemSheet({ sheet, rateCard, preview, labelRef, onClose, onCommit, onDelete, onChange }: SheetProps) {
  const cfg       = ITEM_CFG[sheet.type]
  const isEditing = sheet.editingId !== null
  const qty       = parseFloat(sheet.qty)      || 0
  const cost      = parseFloat(sheet.unitCost) || 0
  const valid     = sheet.label.trim().length > 0 && qty > 0

  // Handle Enter key in inputs
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); if (valid) onCommit() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <>
      {/*
        Backdrop — pointer-events-none applied directly to THIS element when closed.
        CSS does not inherit pointer-events, so putting it only on a parent wrapper
        does not stop child elements from intercepting taps. Each element needs its own.
      */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          sheet.open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet — always in DOM for the slide animation; pointer-events-none when off-screen */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out max-h-[92dvh] overflow-y-auto ${
          sheet.open ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none'
        }`}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3" />

        <div className="px-5 pt-5 pb-2 max-w-lg mx-auto">

          {/* Sheet header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${cfg.color}`}>
                {cfg.icon}
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">
                  {isEditing ? `Edit ${cfg.label}` : `Add ${cfg.label}`}
                </p>
                <p className="text-xs text-muted">
                  {sheet.type === 'labour'
                    ? `€${rateCard.labour_rate_per_hour}/hr from rate card`
                    : sheet.type === 'material'
                    ? `+${rateCard.material_markup_percent}% markup applied`
                    : 'Fixed price, no markup'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted hover:text-on-surface transition p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Label input */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Description
            </label>
            <input
              ref={labelRef}
              type="text"
              value={sheet.label}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ label: e.target.value })}
              onKeyDown={onKeyDown}
              placeholder={
                sheet.type === 'labour'   ? 'e.g. Install solar panels…' :
                sheet.type === 'material' ? 'e.g. 400W panel, cable…'   :
                                            'e.g. Permit fee, delivery…'
              }
              className="w-full h-13 rounded-xl border border-border bg-white px-4 py-3 text-base text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            />
          </div>

          {/* Quantity + cost row */}
          <div className={`grid gap-3 mb-4 ${sheet.type === 'labour' ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                {cfg.qtyLabel}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={cfg.qtyStep}
                value={sheet.qty}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ qty: e.target.value })}
                onKeyDown={onKeyDown}
                placeholder="0"
                className="w-full h-13 rounded-xl border border-border bg-white px-4 py-3 text-lg font-semibold text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              />
            </div>

            {cfg.showCost && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  {sheet.type === 'material' ? 'Cost / unit (€)' : 'Price each (€)'}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={sheet.unitCost}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ unitCost: e.target.value })}
                  onKeyDown={onKeyDown}
                  placeholder="0.00"
                  className="w-full h-13 rounded-xl border border-border bg-white px-4 py-3 text-lg font-semibold text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              </div>
            )}
          </div>

          {/* Material breakdown preview */}
          {sheet.type === 'material' && qty > 0 && cost > 0 && (
            <div className="bg-blue-50 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700 space-y-1">
              <div className="flex justify-between">
                <span>{qty} × {formatEuro(cost)}</span>
                <span>{formatEuro(qty * cost)}</span>
              </div>
              <div className="flex justify-between">
                <span>+{rateCard.material_markup_percent}% markup</span>
                <span>+{formatEuro(qty * cost * rateCard.material_markup_percent / 100)}</span>
              </div>
            </div>
          )}

          {/* Live preview total for this item */}
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-5 ${
            valid ? 'bg-teal-100' : 'bg-surface border border-border'
          }`}>
            <span className={`text-sm font-medium ${valid ? 'text-teal-700' : 'text-muted'}`}>
              Line total (ex. VAT)
            </span>
            <span className={`text-xl font-bold ${valid ? 'text-teal-500' : 'text-muted'}`}>
              {formatEuro(preview)}
            </span>
          </div>

          {/* Action buttons */}
          <button
            onClick={onCommit}
            disabled={!valid}
            className="w-full h-13 rounded-xl bg-teal-500 text-white font-semibold text-base hover:bg-teal-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Update item' : `Add ${cfg.label.toLowerCase()} to quote`}
          </button>

          {isEditing && (
            <button
              onClick={onDelete}
              className="w-full mt-2 h-11 rounded-xl text-red-500 text-sm font-semibold hover:bg-red-50 transition"
            >
              Delete this item
            </button>
          )}
        </div>
      </div>
    </>
  )
}
