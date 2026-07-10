'use client'

import {
  useState, useEffect, useRef, useMemo,
  type ChangeEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { calculateProposal, calculateRecurringPeriods, itemTotal, formatEuro, effectiveHourlyRate } from '@/lib/pricing'
import type { LineItem, ProposalBreakdown, RecurringContractTerms, RecurringRateType } from '@/lib/pricing'
import { recurringRateItemText } from '@/lib/pdf/pdfLabels'
import type { Locale } from '@/i18n/config'
import type { QuoteType, RecurringConfig } from '@/lib/types'

// ─── Prop types ───────────────────────────────────────────────────────────────

interface ClientRow { id: string; name: string; phone: string | null }
type RateCardSlice = {
  labour_rate_per_hour: number
  material_markup_percent: number
  vat_percent: number
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
  // Recurring quotes only — when set, this item is a rate_type item
  // (Daily rate / Hourly rate / Fixed) rather than a one-off labour/
  // material/fixed item. Same DraftItem, same array, same storage either
  // way — see draftToLineItem.
  rateType?: RecurringRateType
  quantity:  number   // hours for labour, units for others
  unit_cost: number   // 0 for labour (rate from rateCard); cost/unit for others
}

// State for the bottom sheet when adding or editing an item
interface SheetState {
  open:      boolean
  editingId: string | null   // null = new item
  type:      LineItem['type']
  rateType:  RecurringRateType | null
  label:     string
  qty:       string           // kept as string so inputs stay editable
  unitCost:  string
}

function draftToLineItem(d: DraftItem): LineItem {
  return {
    label:      d.label,
    type:       d.rateType ? 'fixed' : d.type,
    quantity:   d.quantity,
    unit_cost:  d.unit_cost,
    hours:      !d.rateType && d.type === 'labour' ? d.quantity : undefined,
    rate_type:  d.rateType,
  }
}

/** day_rate is valid without a quantity (hours/day is reference-only);
 * every other type/rate_type needs a positive quantity. Shared by
 * commitSheet and AddItemSheet so the two can never disagree. */
function sheetIsValid(sheet: SheetState): boolean {
  if (!sheet.label.trim()) return false
  const qty  = parseFloat(sheet.qty)      || 0
  const cost = parseFloat(sheet.unitCost) || 0
  if (sheet.rateType === 'day_rate') return cost > 0
  return qty > 0
}

// ─── Translated label lookups (shared by ItemCard, AddItemSheet, and the
// main render below) — the type/rateType → copy mapping lives in ONE
// place per concern, called with whichever component's own `t`. ─────────

type NewQuoteT = ReturnType<typeof useTranslations<'newQuote'>>

function itemOrRateLabel(t: NewQuoteT, item: { type: LineItem['type']; rateType?: RecurringRateType | null }): string {
  if (item.rateType === 'day_rate') return t('itemDayRate')
  if (item.rateType === 'hourly')   return t('itemHourly')
  if (item.rateType === 'fixed')    return t('itemFixed')
  if (item.type === 'labour')       return t('itemLabour')
  if (item.type === 'material')     return t('itemMaterial')
  return t('itemFixed')
}

function qtyLabel(t: NewQuoteT, item: { type: LineItem['type']; rateType?: RecurringRateType | null }): string {
  if (item.rateType === 'day_rate') return t('qtyLabelHoursPerDayRef')
  if (item.rateType === 'hourly')   return t('qtyLabelHours')
  if (item.rateType === 'fixed')    return t('qtyLabelQty')
  if (item.type === 'labour')       return t('qtyLabelHours')
  return t('qtyLabelQty')
}

function costLabel(t: NewQuoteT, item: { type: LineItem['type']; rateType?: RecurringRateType | null }): string {
  if (item.rateType === 'day_rate') return t('costLabelDayRate')
  if (item.rateType === 'hourly')   return t('costLabelHourly')
  if (item.rateType === 'fixed')    return t('costLabelFixedRate')
  if (item.type === 'material')     return t('costLabelMaterial')
  return t('costLabelFixed')
}

function showCostFor(item: { type: LineItem['type']; rateType?: RecurringRateType | null }): boolean {
  // One-off labour's rate comes from the rate card, so it has no cost
  // field of its own. Every recurring rate type and every other one-off
  // type shows one.
  return item.rateType != null || item.type !== 'labour'
}

// ─── Per-type visual config (icon/color only — labels are translated) ────────

const ITEM_CFG = {
  labour: {
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    dot:   'bg-amber-400',
    qtyStep: '0.5',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  material: {
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    dot:   'bg-blue-400',
    qtyStep: '1',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    ),
  },
  fixed: {
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    dot:   'bg-purple-400',
    qtyStep: '1',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" />
      </svg>
    ),
  },
} as const

// ─── Per-rate-type visual config (recurring quotes only) ──────────────────────
// Same DraftItem/AddItemSheet machinery as ITEM_CFG above — this is a
// second config table, not a second line-item system.

const RATE_TYPE_CFG = {
  day_rate: {
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    dot:   'bg-amber-400',
    qtyStep: '0.5',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  hourly: {
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    dot:   'bg-blue-400',
    qtyStep: '0.5',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  fixed: {
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    dot:   'bg-purple-400',
    qtyStep: '1',
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
  const t = useTranslations('newQuote')
  const tLang = useTranslations('language')
  const appLocale = useLocale() as Locale

  // ── Main form state ──────────────────────────────────────────
  const [jobTitle,  setJobTitle]  = useState('')
  const [items,     setItems]     = useState<DraftItem[]>([])
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // This QUOTE's own language — independent of the contractor's own app
  // language, defaults to it, changeable per quote. Drives the PDF/public
  // page/AI wording for THIS quote regardless of who views it later.
  const [quoteLanguage, setQuoteLanguage] = useState<Locale>(appLocale)

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

  // ── Bottom sheet state (shared by one-off and recurring items) ─
  const [sheet, setSheet] = useState<SheetState>({
    open: false, editingId: null, type: 'labour', rateType: null,
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
  // Scales the SAME `totals` breakdown above (one occurrence, e.g. one day
  // on site) up through the contract cadence — no separate recurring
  // pricing model or line-item set.
  const recurringTerms: RecurringContractTerms = useMemo(() => ({
    days_per_week:        parseFloat(daysPerWeekStr)  || 0,
    weeks_per_year:       parseFloat(weeksPerYearStr) || 0,
    contract_term_months: parseFloat(contractTermStr) || 0,
  }), [daysPerWeekStr, weeksPerYearStr, contractTermStr])

  const recurringBreakdown = useMemo(
    () => calculateRecurringPeriods(totals, recurringTerms),
    [totals, recurringTerms],
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
        label:      sheet.label,
        type:       sheet.rateType ? 'fixed' : sheet.type,
        quantity:   parseFloat(sheet.qty)      || 0,
        unit_cost:  parseFloat(sheet.unitCost) || 0,
        hours:      !sheet.rateType && sheet.type === 'labour' ? parseFloat(sheet.qty) || 0 : undefined,
        rate_type:  sheet.rateType ?? undefined,
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
    const timer = setTimeout(() => sheetLabelRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [sheet.open, sheet.type, sheet.rateType])

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
    setSheet({ open: true, editingId: null, type, rateType: null, label: '', qty: '', unitCost: '' })
  }

  function openAddRecurringSheet(rateType: RecurringRateType) {
    setSheet({ open: true, editingId: null, type: 'fixed', rateType, label: '', qty: '', unitCost: '' })
  }

  function openEditSheet(item: DraftItem) {
    setSheet({
      open:      true,
      editingId: item.id,
      type:      item.type,
      rateType:  item.rateType ?? null,
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
    if (!sheetIsValid(sheet)) return
    const qty  = parseFloat(sheet.qty)      || 0
    const cost = parseFloat(sheet.unitCost) || 0

    const draft: DraftItem = {
      id:        sheet.editingId ?? crypto.randomUUID(),
      label:     sheet.label.trim(),
      type:      sheet.type,
      rateType:  sheet.rateType ?? undefined,
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
    if (items.length === 0) return
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

      // Same line items, same job insert shape for both quote types — only
      // the extra recurring_config differs.
      const validItems = items.filter(i => i.label.trim())
      const { data: job, error: je } = await supabase
        .from('jobs')
        .insert({
          owner_id:   ownerId,
          client_id:  clientId,
          title:      jobTitle.trim() || t(quoteType === 'one_off' ? 'title' : 'quoteTypeRecurring'),
          status:     'draft',
          quote_type: quoteType,
          language:   quoteLanguage,
          line_items: validItems.map(draftToLineItem),
          ...(quoteType === 'recurring' ? { recurring_config: recurringConfig } : {}),
        })
        .select('id')
        .single()
      if (je) throw je

      // Insert proposal — store totals without the items array (those live in jobs.line_items).
      // For a recurring quote this is still the cost of ONE occurrence — the
      // contract-terms multiplication is derived live from recurring_config, never stored.
      const { items: _items, ...moneyBreakdown } = calculateProposal(validItems.map(draftToLineItem), rateCard)
      const { error: pe } = await supabase
        .from('proposals')
        .insert({ owner_id: ownerId, job_id: job.id, computed_totals: moneyBreakdown })
      if (pe) throw pe

      router.push(`/quotes/${job.id}`)
      router.refresh()
    } catch (err) {
      // Supabase returns plain objects {code, message, hint}, not Error instances.
      // Fall through the chain to get the most useful message available.
      const msg =
        (err instanceof Error && err.message)
          ? err.message
          : (err as { message?: string })?.message
          ?? t('saveFailed')
      setSaveError(msg)
      setSaving(false)
    }
  }

  const canSaveRecurring =
    recurringTerms.days_per_week > 0 &&
    recurringTerms.weeks_per_year > 0 &&
    recurringTerms.contract_term_months > 0

  const canSave = !saving && items.length > 0 && (quoteType === 'one_off' || canSaveRecurring)

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
            {t('back')}
          </button>
          <span className="text-sm font-semibold text-on-surface">{t('title')}</span>
          {/* Rate card pill */}
          <div className="text-xs text-muted bg-surface border border-border rounded-full px-2.5 py-1 hidden sm:block">
            {t('ratePill', { rate: rateCard.labour_rate_per_hour, markup: rateCard.material_markup_percent, vat: rateCard.vat_percent })}
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
          placeholder={t('jobTitlePlaceholder')}
          className="w-full h-13 rounded-2xl border border-border bg-white px-4 py-3 text-base font-medium text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition mb-4"
        />

        {/* ── QUOTE LANGUAGE — separate from the app's own language;
               defaults to it, changeable per quote, drives the PDF/public
               page/AI wording for THIS quote only. ─────────────────── */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('quoteLanguageLabel')}</span>
          <div className="flex rounded-full border border-border bg-white p-0.5">
            {(['nl', 'en'] as const).map(loc => (
              <button
                key={loc}
                type="button"
                onClick={() => setQuoteLanguage(loc)}
                aria-pressed={quoteLanguage === loc}
                className="min-w-11 h-8 px-3 rounded-full text-xs font-semibold uppercase transition"
                style={
                  quoteLanguage === loc
                    ? { backgroundColor: ACCENT, color: '#fff' }
                    : { color: 'var(--color-muted)' }
                }
                title={loc === 'nl' ? tLang('dutch') : tLang('english')}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {/* ── QUOTE TYPE ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['one_off', 'recurring'] as const).map(type => (
            <button
              key={type}
              onClick={() => {
                if (type === quoteType) return
                // One-off items (labour/material/fixed, rate-card-driven)
                // and recurring items (rate_type-driven) are different
                // shapes — switching type without clearing left old items
                // behind with stale labels (e.g. a leftover "Labour" item
                // on a recurring quote). Confirm before discarding any.
                if (items.length > 0 && !window.confirm(t('quoteTypeSwitchConfirm'))) return
                setQuoteType(type)
                setItems([])
              }}
              className="h-12 rounded-2xl text-sm font-semibold border-2 transition active:scale-[0.98]"
              style={
                quoteType === type
                  ? { backgroundColor: ACCENT, borderColor: ACCENT, color: '#fff' }
                  : { backgroundColor: '#fff', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }
              }
            >
              {type === 'one_off' ? t('quoteTypeOneOff') : t('quoteTypeRecurring')}
            </button>
          ))}
        </div>

        {/* ── CLIENT ──────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('client')}</span>
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
                aria-label={t('removeClientAria')}
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
                placeholder={t('clientSearchPlaceholder')}
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
                      {t('addAsNewClient', { name: clientSearch.trim() })}
                    </button>
                  )}

                  {filteredClients.length === 0 && !clientSearch.trim() && (
                    <p className="px-3 py-3 text-sm text-muted text-center">{t('noClientsYet')}</p>
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
                  placeholder={t('phonePlaceholder')}
                  className="mt-2 w-full h-11 rounded-xl border border-border bg-surface px-3 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                />
              )}
            </div>
          )}
        </section>

        {/* ── LINE ITEMS (shared by both quote types) ───────────── */}
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
              {quoteType === 'one_off' ? t('emptyOneOff') : t('emptyRecurring')}
            </p>
          )}

          {/* ── Three add buttons — labour/material/fixed for a one-off
                 job, daily/hourly/fixed rate for a recurring contract.
                 Same DraftItem, same array, same sheet either way. ── */}
          <div className="grid grid-cols-3 gap-2">
            {quoteType === 'one_off'
              ? (['labour', 'material', 'fixed'] as const).map(type => {
                  const cfg = ITEM_CFG[type]
                  return (
                    <button
                      key={type}
                      onClick={() => openAddSheet(type)}
                      className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border hover:border-teal-500 hover:bg-teal-100 hover:text-teal-700 text-muted transition active:scale-95"
                    >
                      {cfg.icon}
                      <span className="text-xs font-semibold leading-tight text-center">
                        + {itemOrRateLabel(t, { type })}
                      </span>
                    </button>
                  )
                })
              : (['day_rate', 'hourly', 'fixed'] as const).map(rateType => {
                  const cfg = RATE_TYPE_CFG[rateType]
                  return (
                    <button
                      key={rateType}
                      onClick={() => openAddRecurringSheet(rateType)}
                      className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border hover:border-teal-500 hover:bg-teal-100 hover:text-teal-700 text-muted transition active:scale-95"
                    >
                      {cfg.icon}
                      <span className="text-xs font-semibold leading-tight text-center">
                        + {itemOrRateLabel(t, { type: 'fixed', rateType })}
                      </span>
                    </button>
                  )
                })}
          </div>
        </section>

        {/* Rate card note — one-off only (recurring rates are set per line, not from the rate card) */}
        {quoteType === 'one_off' && (
          <p className="mt-4 text-center text-xs text-muted sm:hidden">
            {t('rateCardNote', { rate: rateCard.labour_rate_per_hour, markup: rateCard.material_markup_percent, vat: rateCard.vat_percent })}
          </p>
        )}

        {/* ── RECURRING CONTRACT TERMS ───────────────────────── */}
        {quoteType === 'recurring' && (
        <section className="bg-white rounded-2xl border border-border mb-4 mt-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('contractTerms')}</span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <RField label={t('daysPerWeek')}>
                <input
                  type="number" inputMode="decimal" min="0" max="7" step="1"
                  value={daysPerWeekStr}
                  onChange={e => setDaysPerWeekStr(e.target.value)}
                  className={rInput}
                />
              </RField>
              <RField label={t('weeksPerYear')}>
                <input
                  type="number" inputMode="decimal" min="0" max="52" step="1"
                  value={weeksPerYearStr}
                  onChange={e => setWeeksPerYearStr(e.target.value)}
                  className={rInput}
                />
              </RField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <RField label={t('contractLength')}>
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={contractTermStr}
                  onChange={e => setContractTermStr(e.target.value)}
                  className={rInput}
                />
              </RField>
              <RField label={t('noticePeriod')}>
                <input
                  type="number" inputMode="decimal" min="0" step="1"
                  value={noticePeriodStr}
                  onChange={e => setNoticePeriodStr(e.target.value)}
                  placeholder={t('noticePeriodOptional')}
                  className={rInput}
                />
              </RField>
            </div>

            <button
              onClick={() => setAutoRenewal(v => !v)}
              className="flex items-center justify-between h-12 px-4 rounded-xl border border-border bg-surface"
            >
              <span className="text-sm font-medium text-on-surface">{t('autoRenew')}</span>
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
        {quoteType === 'recurring' && items.length > 0 && (
        <section className="bg-white rounded-2xl border border-border mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('pricingSummary')}</span>
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            <RecurringSummaryRow
              label={t('perWeek')}
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_week.ex_vat : recurringBreakdown.per_week.incl_vat)}
            />
            <RecurringSummaryRow
              label={t('perMonth')}
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_month.ex_vat : recurringBreakdown.per_month.incl_vat)}
            />
            <RecurringSummaryRow
              label={t('perYear')}
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.per_year.ex_vat : recurringBreakdown.per_year.incl_vat)}
            />
            <div className="h-px bg-border my-1" />
            <RecurringSummaryRow
              label={t('overTerm', { months: recurringBreakdown.contract_term_months || 0 })}
              value={formatEuro(rateCard.prices_shown_excluding_vat ? recurringBreakdown.contract_total.ex_vat : recurringBreakdown.contract_total.incl_vat)}
            />
            <p className="text-[11px] text-muted text-right -mt-1">
              {rateCard.prices_shown_excluding_vat ? t('exclVat') : t('inclVat')}
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
            {totals.labour_total   > 0 && <TotalRow label={t('itemLabour')}    value={totals.labour_total}   />}
            {totals.material_total > 0 && <TotalRow label={t('itemMaterials')} value={totals.material_total} />}
            {totals.fixed_total    > 0 && <TotalRow label={t('itemFixed')}     value={totals.fixed_total}    />}
            {items.length > 0 && (
              <>
                <div className="flex justify-between text-xs text-muted pt-0.5">
                  <span>{t('subtotal')}</span>
                  <span>{formatEuro(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>{t('vat', { percent: totals.vat_percent })}</span>
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
                  <span>{t('perMonth')}</span>
                  <span>{formatEuro(recurringBreakdown.per_month.incl_vat)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>{t('overTerm', { months: recurringBreakdown.contract_term_months })}</span>
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
                  <span className="text-xs font-medium text-muted block">{t('totalInclVat')}</span>
                  <span className={`text-2xl font-bold leading-tight ${items.length > 0 ? 'text-teal-500' : 'text-muted'}`}>
                    {formatEuro(totals.total)}
                  </span>
                  {items.length === 0 && (
                    <span className="text-xs text-muted block">{t('addItemsFirst')}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted block">{t('contractTotalInclVat')}</span>
                  <span className={`text-2xl font-bold leading-tight ${canSaveRecurring ? 'text-teal-500' : 'text-muted'}`}>
                    {formatEuro(recurringBreakdown.contract_total.incl_vat)}
                  </span>
                  {!canSaveRecurring && (
                    <span className="text-xs text-muted block">{t('fillContractTerms')}</span>
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
                  {t('saving')}
                </span>
              ) : t('saveQuote')}
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SHEET (one-off) ───────────────────────────── */}
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
  const t = useTranslations('newQuote')
  const locale = useLocale() as Locale
  const cfg   = item.rateType ? RATE_TYPE_CFG[item.rateType] : ITEM_CFG[item.type]
  const total = itemTotal(draftToLineItem(item), rateCard)
  const label = itemOrRateLabel(t, item)
  const meta  = item.rateType
    ? `${label} · ${recurringRateItemText(locale, item.rateType, item.quantity, item.unit_cost).rateText}`
    : `${label}${item.type === 'labour' ? ` · ${item.quantity} ${t('hourUnit')}` : ` · ${item.quantity} × ${formatEuro(item.unit_cost)}`}`

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
          <p className="text-xs text-muted mt-0.5">{meta}</p>
        </div>

        {/* Line total + delete */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-teal-500">{formatEuro(total)}</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-muted hover:text-red-500 transition p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label={t('deleteItemAria')}
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
  const t = useTranslations('newQuote')
  const cfg       = sheet.rateType ? RATE_TYPE_CFG[sheet.rateType] : ITEM_CFG[sheet.type]
  const label     = itemOrRateLabel(t, sheet)
  const isEditing = sheet.editingId !== null
  const qty       = parseFloat(sheet.qty)      || 0
  const cost      = parseFloat(sheet.unitCost) || 0
  const valid     = sheetIsValid(sheet)
  const showCost  = showCostFor(sheet)
  const dayRateEffectiveHourly = sheet.rateType === 'day_rate' ? effectiveHourlyRate(cost, qty) : null

  // Handle Enter key in inputs
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); if (valid) onCommit() }
    if (e.key === 'Escape') onClose()
  }

  const subtitle =
    sheet.rateType === 'day_rate' ? t('subtitleDayRate')
    : sheet.rateType === 'hourly' ? t('subtitleHourly')
    : sheet.rateType === 'fixed'  ? t('subtitleFixedRate')
    : sheet.type === 'labour'     ? t('subtitleLabour', { rate: rateCard.labour_rate_per_hour })
    : sheet.type === 'material'   ? t('subtitleMaterial', { markup: rateCard.material_markup_percent })
    : t('subtitleFixed')

  const placeholder =
    sheet.rateType === 'day_rate' ? t('placeholderDayRate')
    : sheet.rateType === 'hourly' ? t('placeholderHourly')
    : sheet.rateType === 'fixed'  ? t('placeholderFixedRate')
    : sheet.type === 'labour'     ? t('placeholderLabour')
    : sheet.type === 'material'   ? t('placeholderMaterial')
    : t('placeholderFixed')

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
                  {isEditing ? t('editItemTitle', { label }) : t('addItemTitle', { label })}
                </p>
                <p className="text-xs text-muted">
                  {subtitle}
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
              {t('descriptionLabel')}
            </label>
            <input
              ref={labelRef}
              type="text"
              value={sheet.label}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ label: e.target.value })}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="w-full h-13 rounded-xl border border-border bg-white px-4 py-3 text-base text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            />
          </div>

          {/* Quantity + cost row */}
          <div className={`grid gap-3 mb-4 ${showCost ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                {qtyLabel(t, sheet)}
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

            {showCost && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  {costLabel(t, sheet)}
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
          {sheet.type === 'material' && !sheet.rateType && qty > 0 && cost > 0 && (
            <div className="bg-blue-50 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700 space-y-1">
              <div className="flex justify-between">
                <span>{qty} × {formatEuro(cost)}</span>
                <span>{formatEuro(qty * cost)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('materialMarkup', { percent: rateCard.material_markup_percent })}</span>
                <span>+{formatEuro(qty * cost * rateCard.material_markup_percent / 100)}</span>
              </div>
            </div>
          )}

          {/* Day-rate effective hourly rate — display only, never affects the price */}
          {sheet.rateType === 'day_rate' && dayRateEffectiveHourly != null && (
            <div className="bg-amber-50 rounded-xl px-4 py-2.5 mb-4 text-xs text-amber-700">
              <div className="flex justify-between">
                <span>{t('effectiveRate', { qty })}</span>
                <span>{formatEuro(dayRateEffectiveHourly)}/{t('hourUnit')}</span>
              </div>
            </div>
          )}

          {/* Live preview total for this item */}
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 mb-5 ${
            valid ? 'bg-teal-100' : 'bg-surface border border-border'
          }`}>
            <span className={`text-sm font-medium ${valid ? 'text-teal-700' : 'text-muted'}`}>
              {t('lineTotalExVat')}
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
            {isEditing ? t('updateItem') : t('addItemToQuote', { label: label.toLowerCase() })}
          </button>

          {isEditing && (
            <button
              onClick={onDelete}
              className="w-full mt-2 h-11 rounded-xl text-red-500 text-sm font-semibold hover:bg-red-50 transition"
            >
              {t('deleteThisItem')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
