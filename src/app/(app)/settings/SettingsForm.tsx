'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface InitialRateCard {
  id:                       string | null
  labour_rate_per_hour:     number
  material_markup_percent:  number
  vat_percent:              number
  terms_text:               string | null
  business_name:            string | null
  business_address:         string | null
  business_email:           string | null
  logo_url:                 string | null
}

interface Props {
  ownerId:         string
  initialRateCard: InitialRateCard
}

interface FieldErrors {
  labourRate?:    string
  markupPercent?: string
  vatPercent?:    string
}

// Teal accent used specifically for this screen's headers/save button.
// (Slightly different from the app's default teal-500 token — this matches
// the exact brand hex used in the PDF and public share page.)
const ACCENT = '#0F766E'

function validate(labourRate: number, markupPercent: number, vatPercent: number): FieldErrors {
  const errors: FieldErrors = {}
  if (!Number.isFinite(labourRate) || labourRate < 0) {
    errors.labourRate = 'Enter a rate of 0 or more.'
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    errors.markupPercent = 'Enter a markup of 0 or more.'
  }
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) {
    errors.vatPercent = 'VAT must be between 0 and 100.'
  }
  return errors
}

export default function SettingsForm({ ownerId, initialRateCard }: Props) {
  const supabase = createClient()

  const [rateCardId, setRateCardId] = useState(initialRateCard.id)

  const [businessName,    setBusinessName]    = useState(initialRateCard.business_name ?? '')
  const [businessAddress, setBusinessAddress] = useState(initialRateCard.business_address ?? '')
  const [businessEmail,   setBusinessEmail]   = useState(initialRateCard.business_email ?? '')
  const [logoUrl,         setLogoUrl]         = useState(initialRateCard.logo_url)

  const [labourRateStr, setLabourRateStr] = useState(String(initialRateCard.labour_rate_per_hour))
  const [markupStr,     setMarkupStr]     = useState(String(initialRateCard.material_markup_percent))
  const [vatStr,         setVatStr]       = useState(String(initialRateCard.vat_percent))
  const [termsText,      setTermsText]    = useState(initialRateCard.terms_text ?? '')

  const [errors, setErrors]           = useState<FieldErrors>({})
  const [logoUploading, setLogoUploading] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [justSaved, setJustSaved]     = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    setSaveError(null)
    try {
      const ext  = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${ownerId}/logo-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase
        .storage.from('logos')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/png' })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      setLogoUrl(data.publicUrl)
    } catch {
      setSaveError('Could not upload that logo — please try a different image.')
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSave() {
    const labourRate     = parseFloat(labourRateStr)
    const markupPercent  = parseFloat(markupStr)
    const vatPercent     = parseFloat(vatStr)

    const validationErrors = validate(labourRate, markupPercent, vatPercent)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        owner_id:                 ownerId,
        business_name:            businessName.trim() || null,
        business_address:         businessAddress.trim() || null,
        business_email:           businessEmail.trim() || null,
        logo_url:                 logoUrl,
        labour_rate_per_hour:     labourRate,
        material_markup_percent: markupPercent,
        vat_percent:              vatPercent,
        terms_text:               termsText.trim() || null,
      }

      if (rateCardId) {
        const { error } = await supabase.from('rate_cards').update(payload).eq('id', rateCardId)
        if (error) throw error
      } else {
        // First time this contractor has saved settings — create their one rate_cards row.
        const { data, error } = await supabase.from('rate_cards').insert(payload).select('id').single()
        if (error) throw error
        setRateCardId(data.id)
      }

      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    } catch {
      setSaveError('Could not save your settings — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Business identity ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>Business identity</h2>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl border border-border bg-surface flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Business logo" className="w-full h-full object-contain" />
            ) : (
              <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18" />
              </svg>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
              id="logo-upload"
            />
            <label
              htmlFor="logo-upload"
              className="h-10 px-4 inline-flex items-center justify-center rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface active:scale-[0.98] transition cursor-pointer"
            >
              {logoUploading ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
            </label>
            {logoUrl && !logoUploading && (
              <button
                onClick={() => setLogoUrl(null)}
                className="text-xs text-muted hover:text-red-500 transition text-left"
              >
                Remove logo
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Business name">
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Your Company BV"
              className={inputClass}
            />
          </Field>
          <Field label="Address">
            <input
              type="text"
              value={businessAddress}
              onChange={e => setBusinessAddress(e.target.value)}
              placeholder="Streetname 1, Amsterdam"
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              inputMode="email"
              value={businessEmail}
              onChange={e => setBusinessEmail(e.target.value)}
              placeholder="you@yourcompany.nl"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>Pricing</h2>
        <div className="flex flex-col gap-3">
          <Field label="Labour rate per hour (€)" error={errors.labourRate}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={labourRateStr}
              onChange={e => setLabourRateStr(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Material markup (%)" error={errors.markupPercent}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={markupStr}
              onChange={e => setMarkupStr(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="VAT (%)" error={errors.vatPercent}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="1"
              value={vatStr}
              onChange={e => setVatStr(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* ── Terms & conditions ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>Terms &amp; conditions</h2>
        <p className="text-xs text-muted mb-3">Appears in small print at the bottom of every quote PDF.</p>
        <textarea
          value={termsText}
          onChange={e => setTermsText(e.target.value)}
          rows={6}
          placeholder="e.g. This quote is valid for 30 days. Payment due within 14 days of invoice. All work guaranteed for 2 years."
          className={`${inputClass} resize-y`}
        />
      </section>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      {saveError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-xs text-red-700 leading-snug">{saveError}</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || logoUploading}
        className="w-full h-13 rounded-2xl text-white font-semibold text-base active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ backgroundColor: ACCENT }}
      >
        {saving ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving…
          </>
        ) : justSaved ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Settings saved
          </>
        ) : 'Save settings'}
      </button>
    </div>
  )
}

const inputClass = 'w-full h-12 rounded-xl border border-border bg-white px-3.5 text-base text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
