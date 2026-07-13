'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { calculateInvoice, formatEuro } from '@/lib/pricing'
import type { InvoiceItemType, InvoiceLineItem } from '@/lib/pricing'

interface ClientRow { id: string; name: string; email: string | null; address: string | null }

interface Props {
  ownerId: string
  existingClients: ClientRow[]
  vatPercent: number
  language: 'nl' | 'en'
  paymentTermsDays: number
}

interface DraftItem {
  label:     string
  type:      InvoiceItemType
  quantity:  string
  hours:     string
  unitCost:  string
  vatRate:   number
}

function newItem(vatPercent: number): DraftItem {
  return { label: '', type: 'fixed', quantity: '1', hours: '', unitCost: '', vatRate: vatPercent }
}

function draftToLineItem(d: DraftItem): InvoiceLineItem {
  return {
    label:     d.label,
    type:      d.type,
    quantity:  d.type === 'labour' ? (parseFloat(d.hours) || 0) : (parseFloat(d.quantity) || 0),
    unit_cost: parseFloat(d.unitCost) || 0,
    hours:     d.type === 'labour' ? (parseFloat(d.hours) || 0) : undefined,
    vat_rate:  d.vatRate,
  }
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const VAT_RATES = [21, 9, 0]

export default function NewInvoiceForm({ ownerId, existingClients, vatPercent, language, paymentTermsDays }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('newInvoice')

  const today = new Date().toISOString().slice(0, 10)

  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null)
  const [clientListOpen, setClientListOpen] = useState(false)
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')

  const [items, setItems] = useState<DraftItem[]>([newItem(vatPercent)])
  const [discountType, setDiscountType] = useState<'none' | 'amount' | 'percent'>('none')
  const [discountValue, setDiscountValue] = useState('')
  const [reverseCharge, setReverseCharge] = useState(false)

  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(addDays(today, paymentTermsDays))
  const [invoiceLanguage, setInvoiceLanguage] = useState<'nl' | 'en'>(language)
  const [clientBtw, setClientBtw] = useState('')
  const [clientKvk, setClientKvk] = useState('')
  const [noteText, setNoteText] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return existingClients.slice(0, 8)
    return existingClients.filter(c => c.name.toLowerCase().includes(q))
  }, [clientSearch, existingClients])

  const exactMatch = existingClients.some(c => c.name.toLowerCase() === clientSearch.trim().toLowerCase())

  function selectClient(c: ClientRow) {
    setSelectedClient(c)
    setClientSearch('')
    setClientListOpen(false)
  }

  function clearClient() {
    setSelectedClient(null)
    setClientSearch('')
    setNewClientEmail('')
    setNewClientAddress('')
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const validItems = items.filter(it => it.label.trim())
  const lineItems = validItems.map(draftToLineItem)
  const breakdown = calculateInvoice(lineItems, {
    discountType: discountType === 'none' ? undefined : discountType,
    discountValue: parseFloat(discountValue) || 0,
    reverseCharge,
  })

  async function handleCreate() {
    setError(null)
    if (!selectedClient && !clientSearch.trim()) {
      setError(t('validationNoClient'))
      return
    }
    if (validItems.length === 0) {
      setError(t('validationNoItems'))
      return
    }

    setSaving(true)
    try {
      let clientId: string | null = selectedClient?.id ?? null
      let clientName = selectedClient?.name ?? clientSearch.trim()
      let clientEmail = selectedClient?.email ?? (newClientEmail.trim() || null)
      let clientAddress = selectedClient?.address ?? (newClientAddress.trim() || null)

      if (!selectedClient && clientSearch.trim()) {
        const { data: c, error: clientErr } = await supabase
          .from('clients')
          .insert({ owner_id: ownerId, name: clientSearch.trim(), email: newClientEmail.trim() || null, address: newClientAddress.trim() || null })
          .select('id, name, email, address')
          .single()
        if (clientErr) throw clientErr
        clientId = c.id
        clientName = c.name
        clientEmail = c.email
        clientAddress = c.address
      }

      const { data: invoice, error: insertErr } = await supabase
        .from('invoices')
        .insert({
          owner_id: ownerId,
          client_id: clientId,
          language: invoiceLanguage,
          client_name: clientName,
          client_address: clientAddress,
          client_email: clientEmail,
          client_btw: clientBtw.trim() || null,
          client_kvk: clientKvk.trim() || null,
          line_items: lineItems,
          discount_type: discountType === 'none' ? null : discountType,
          discount_value: discountType === 'none' ? null : (parseFloat(discountValue) || 0),
          reverse_charge: reverseCharge,
          computed_totals: breakdown,
          invoice_date: invoiceDate,
          due_date: dueDate,
          payment_terms_days: paymentTermsDays,
          note_text: noteText.trim() || null,
          status: 'draft',
        })
        .select('id')
        .single()
      if (insertErr) throw insertErr

      router.push(`/invoices/${invoice.id}`)
    } catch (err) {
      setError(t('createFailed', { message: (err as Error).message }))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/invoices" className="flex items-center gap-1.5 text-sm text-muted hover:text-on-surface transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t('back')}
          </Link>
          <h1 className="font-semibold text-on-surface">{t('title')}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-40 flex flex-col gap-4">

        {/* Client */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('clientLabel')}</span>
          {selectedClient ? (
            <div className="flex items-center justify-between mt-2 bg-surface rounded-xl px-3 py-2.5">
              <p className="text-sm font-semibold text-on-surface">{selectedClient.name}</p>
              <button onClick={clearClient} aria-label={t('removeClientAria')} className="text-muted hover:text-on-surface">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="relative mt-2">
              <input
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientListOpen(true) }}
                onFocus={() => setClientListOpen(true)}
                placeholder={t('clientSearchPlaceholder')}
                className="w-full h-11 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {clientListOpen && (
                <div className="mt-1 bg-white border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => selectClient(c)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface transition"
                    >
                      {c.name}
                    </button>
                  ))}
                  {clientSearch.trim() && !exactMatch && (
                    <button
                      onMouseDown={() => setClientListOpen(false)}
                      className="w-full text-left px-3 py-2.5 text-sm text-teal-600 font-medium hover:bg-surface transition border-t border-border"
                    >
                      {t('addAsNewClient', { name: clientSearch.trim() })}
                    </button>
                  )}
                  {filteredClients.length === 0 && !clientSearch.trim() && (
                    <p className="px-3 py-3 text-sm text-muted text-center">{t('noClientsYet')}</p>
                  )}
                </div>
              )}
              {clientSearch.trim() && !exactMatch && !clientListOpen && (
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    value={newClientEmail}
                    onChange={e => setNewClientEmail(e.target.value)}
                    placeholder={t('newClientEmailPlaceholder')}
                    className="w-full h-10 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    value={newClientAddress}
                    onChange={e => setNewClientAddress(e.target.value)}
                    placeholder={t('newClientAddressPlaceholder')}
                    className="w-full h-10 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('clientBtwLabel')}</label>
              <input value={clientBtw} onChange={e => setClientBtw(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('clientKvkLabel')}</label>
              <input value={clientKvk} onChange={e => setClientKvk(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
        </div>

        {/* Dates + language */}
        <div className="bg-white rounded-2xl border border-border p-5 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('invoiceDateLabel')}</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('dueDateLabel')}</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full h-10 mt-1 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('invoiceLanguageLabel')}</label>
            <div className="flex gap-2 mt-1">
              {(['nl', 'en'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setInvoiceLanguage(l)}
                  className={`flex-1 h-10 rounded-xl text-sm font-medium border transition ${invoiceLanguage === l ? 'bg-teal-500 text-white border-teal-500' : 'border-border text-on-surface'}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('lineItemsTitle')}</p>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <div key={i} className="border border-border rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <input
                    value={item.label}
                    onChange={e => updateItem(i, { label: e.target.value })}
                    placeholder={t('itemLabelPlaceholder')}
                    className="flex-1 h-10 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button onClick={() => removeItem(i)} aria-label={t('removeItemAria')} className="h-10 w-10 shrink-0 flex items-center justify-center text-muted hover:text-red-600 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-2">
                  <select
                    value={item.type}
                    onChange={e => updateItem(i, { type: e.target.value as InvoiceItemType })}
                    className="col-span-1 h-10 px-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="labour">{t('itemTypeLabour')}</option>
                    <option value="material">{t('itemTypeMaterial')}</option>
                    <option value="fixed">{t('itemTypeFixed')}</option>
                    <option value="text">{t('itemTypeText')}</option>
                  </select>

                  {item.type !== 'text' && (
                    <>
                      {item.type === 'labour' ? (
                        <input
                          type="number" min="0" step="0.25"
                          value={item.hours}
                          onChange={e => updateItem(i, { hours: e.target.value })}
                          placeholder={t('hoursLabel')}
                          className="h-10 px-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <input
                          type="number" min="0" step="1"
                          value={item.quantity}
                          onChange={e => updateItem(i, { quantity: e.target.value })}
                          placeholder={t('quantityLabel')}
                          className="h-10 px-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      )}
                      <input
                        type="number" min="0" step="0.01"
                        value={item.unitCost}
                        onChange={e => updateItem(i, { unitCost: e.target.value })}
                        placeholder={t('unitCostLabel')}
                        className="h-10 px-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <select
                        value={item.vatRate}
                        onChange={e => updateItem(i, { vatRate: parseFloat(e.target.value) })}
                        className="h-10 px-2 rounded-xl border border-border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {VAT_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setItems(prev => [...prev, newItem(vatPercent)])}
            className="w-full h-11 mt-3 rounded-xl border border-dashed border-border text-sm font-medium text-teal-600 hover:bg-surface transition"
          >
            + {t('addLineItem')}
          </button>
        </div>

        {/* Discount + reverse charge */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('discountLabel')}</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={discountType}
              onChange={e => setDiscountType(e.target.value as 'none' | 'amount' | 'percent')}
              className="h-10 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="none">{t('discountTypeNone')}</option>
              <option value="amount">{t('discountTypeAmount')}</option>
              <option value="percent">{t('discountTypePercent')}</option>
            </select>
            {discountType !== 'none' && (
              <input
                type="number" min="0" step="0.01"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                placeholder={t('discountValueLabel')}
                className="h-10 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            )}
          </div>

          <label className="flex items-start gap-2 mt-4 cursor-pointer">
            <input type="checkbox" checked={reverseCharge} onChange={e => setReverseCharge(e.target.checked)} className="mt-1 w-4 h-4 accent-teal-500" />
            <span>
              <span className="text-sm font-medium text-on-surface block">{t('reverseChargeLabel')}</span>
              <span className="text-xs text-muted">{t('reverseChargeHint')}</span>
            </span>
          </label>
        </div>

        {/* Note */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('noteLabel')}</label>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder={t('notePlaceholder')}
            rows={2}
            className="w-full mt-2 px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Live totals preview */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
          <div className="flex justify-between text-sm text-muted">
            <span>{t('subtotal')}</span>
            <span>{formatEuro(breakdown.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>{t('vat')}</span>
            <span>{formatEuro(breakdown.vat_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-on-surface text-lg pt-2 border-t border-border">
            <span>{t('total')}</span>
            <span className="text-teal-500">{formatEuro(breakdown.total)}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-left">
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </div>
        )}

      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border px-4 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full h-12 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {saving ? t('creating') : t('createButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
