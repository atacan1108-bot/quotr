'use client'

import { useState, useRef, type ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { EMPTY_BRANDING, type Branding } from '@/lib/types'
import TemplateUploadSection from './TemplateUploadSection'

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
  branding:                 Branding | null
  template_html:            string | null
  prices_shown_excluding_vat:  boolean
  notify_on_accept:         boolean
  notify_on_decline:        boolean
  notification_email:       string | null
  invoice_next_sequence:      number
  invoice_next_sequence_year: number | null
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

function validate(t: ReturnType<typeof useTranslations<'settings'>>, labourRate: number, markupPercent: number, vatPercent: number): FieldErrors {
  const errors: FieldErrors = {}
  if (!Number.isFinite(labourRate) || labourRate < 0) {
    errors.labourRate = t('labourRateError')
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    errors.markupPercent = t('markupError')
  }
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100) {
    errors.vatPercent = t('vatError')
  }
  return errors
}

export default function SettingsForm({ ownerId, initialRateCard }: Props) {
  const supabase = createClient()
  const t = useTranslations('settings')

  const [rateCardId, setRateCardId] = useState(initialRateCard.id)

  const [businessName,    setBusinessName]    = useState(initialRateCard.business_name ?? '')
  const [businessAddress, setBusinessAddress] = useState(initialRateCard.business_address ?? '')
  const [businessEmail,   setBusinessEmail]   = useState(initialRateCard.business_email ?? '')
  const [logoUrl,         setLogoUrl]         = useState(initialRateCard.logo_url)

  const [labourRateStr, setLabourRateStr] = useState(String(initialRateCard.labour_rate_per_hour))
  const [markupStr,     setMarkupStr]     = useState(String(initialRateCard.material_markup_percent))
  const [vatStr,         setVatStr]       = useState(String(initialRateCard.vat_percent))
  const [termsText,      setTermsText]    = useState(initialRateCard.terms_text ?? '')

  // ── Recurring quote display preference ──────────────────────────
  const [pricesExVat, setPricesExVat] = useState(initialRateCard.prices_shown_excluding_vat)

  // ── Notification preferences ─────────────────────────────────────
  const [notifyOnAccept,  setNotifyOnAccept]  = useState(initialRateCard.notify_on_accept)
  const [notifyOnDecline, setNotifyOnDecline] = useState(initialRateCard.notify_on_decline)
  const [notificationEmail, setNotificationEmail] = useState(
    initialRateCard.notification_email ?? initialRateCard.business_email ?? '',
  )

  const initialBranding = initialRateCard.branding ?? EMPTY_BRANDING
  const [primaryColor, setPrimaryColor] = useState(initialBranding.primaryColor || '#0F766E')
  const [accentColor,  setAccentColor]  = useState(initialBranding.accentColor  || '#4BACC6')
  const [fontFamily,   setFontFamily]   = useState(initialBranding.fontFamily ?? '')
  const [phone,        setPhone]        = useState(initialBranding.phone ?? '')
  const [website,      setWebsite]      = useState(initialBranding.website ?? '')
  const [kvk,          setKvk]          = useState(initialBranding.kvk ?? '')
  const [btw,          setBtw]          = useState(initialBranding.btw ?? '')
  const [iban,         setIban]         = useState(initialBranding.iban ?? '')
  const [footerText,   setFooterText]   = useState(initialBranding.footerText ?? '')
  const [quoteNumberPrefix, setQuoteNumberPrefix] = useState(initialBranding.quoteNumberPrefix ?? '')

  // ── Invoicing settings ────────────────────────────────────────────
  const [paymentTermsDays,    setPaymentTermsDays]    = useState(String(initialBranding.paymentTermsDays ?? 30))
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState(initialBranding.invoiceNumberPrefix ?? '')
  const [accountHolderName,   setAccountHolderName]   = useState(initialBranding.accountHolderName ?? '')
  const [invoiceFooterNote,   setInvoiceFooterNote]   = useState(initialBranding.invoiceFooterNote ?? '')

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
      setSaveError(t('logoUploadFailed'))
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSave() {
    const labourRate     = parseFloat(labourRateStr)
    const markupPercent  = parseFloat(markupStr)
    const vatPercent     = parseFloat(vatStr)

    const validationErrors = validate(t, labourRate, markupPercent, vatPercent)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSaving(true)
    setSaveError(null)
    try {
      const branding: Branding = {
        // Preserve invoicing fields (added in a later settings section, not
        // editable from this form yet) rather than nulling them out on every save.
        ...initialBranding,
        primaryColor:      primaryColor || null,
        accentColor:       accentColor || null,
        fontFamily:        fontFamily.trim() || null,
        phone:             phone.trim() || null,
        website:           website.trim() || null,
        kvk:               kvk.trim() || null,
        btw:               btw.trim() || null,
        iban:              iban.trim() || null,
        footerText:        footerText.trim() || null,
        quoteNumberPrefix: quoteNumberPrefix.trim() || null,
        paymentTermsDays:    parseInt(paymentTermsDays, 10) || 30,
        invoiceNumberPrefix: invoiceNumberPrefix.trim() || null,
        accountHolderName:   accountHolderName.trim() || null,
        invoiceFooterNote:   invoiceFooterNote.trim() || null,
      }

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
        branding,
        prices_shown_excluding_vat: pricesExVat,
        notify_on_accept:         notifyOnAccept,
        notify_on_decline:        notifyOnDecline,
        notification_email:      notificationEmail.trim() || null,
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
      setSaveError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── HTML quote template ───────────────────────────────────── */}
      <TemplateUploadSection ownerId={ownerId} accent={ACCENT} hasExistingTemplate={!!initialRateCard.template_html} />

      {/* ── Business identity ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>{t('businessIdentity')}</h2>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl border border-border bg-surface flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={t('businessLogoAlt')} className="w-full h-full object-contain" />
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
              {logoUploading ? t('uploading') : logoUrl ? t('changeLogo') : t('uploadLogo')}
            </label>
            {logoUrl && !logoUploading && (
              <button
                onClick={() => setLogoUrl(null)}
                className="text-xs text-muted hover:text-red-500 transition text-left"
              >
                {t('removeLogo')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t('businessName')}>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder={t('businessNamePlaceholder')}
              className={inputClass}
            />
          </Field>
          <Field label={t('address')}>
            <input
              type="text"
              value={businessAddress}
              onChange={e => setBusinessAddress(e.target.value)}
              placeholder={t('addressPlaceholder')}
              className={inputClass}
            />
          </Field>
          <Field label={t('email')}>
            <input
              type="email"
              inputMode="email"
              value={businessEmail}
              onChange={e => setBusinessEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* ── Branding ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>{t('branding')}</h2>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label={t('primaryColor')}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className="w-12 h-12 rounded-xl border border-border cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          <Field label={t('accentColor')}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={e => setAccentColor(e.target.value)}
                className="w-12 h-12 rounded-xl border border-border cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={accentColor}
                onChange={e => setAccentColor(e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t('font')}>
            <select
              value={fontFamily}
              onChange={e => setFontFamily(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('fontDefault')}</option>
              <option value="Georgia, serif">Georgia (serif)</option>
              <option value="'Times New Roman', serif">Times New Roman (serif)</option>
              <option value="Verdana, sans-serif">Verdana (sans-serif)</option>
              <option value="'Trebuchet MS', sans-serif">Trebuchet MS (sans-serif)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('phone')}>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="030 123 4567" className={inputClass} />
            </Field>
            <Field label={t('website')}>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.yourcompany.nl" className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('kvkNumber')}>
              <input type="text" value={kvk} onChange={e => setKvk(e.target.value)} placeholder="87654321" className={inputClass} />
            </Field>
            <Field label={t('btwNumber')}>
              <input type="text" value={btw} onChange={e => setBtw(e.target.value)} placeholder="NL123456789B01" className={inputClass} />
            </Field>
          </div>
          <Field label={t('iban')}>
            <input type="text" value={iban} onChange={e => setIban(e.target.value)} placeholder="NL91ABNA0417164300" className={inputClass} />
          </Field>
          <Field label={t('footerTagline')}>
            <input
              type="text"
              value={footerText}
              onChange={e => setFooterText(e.target.value)}
              placeholder={t('footerTaglinePlaceholder')}
              className={inputClass}
            />
          </Field>
          <Field label={t('quoteNumberPrefix')}>
            <input
              type="text"
              value={quoteNumberPrefix}
              onChange={e => setQuoteNumberPrefix(e.target.value)}
              placeholder={t('quoteNumberPrefixPlaceholder')}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* ── Invoicing ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-1" style={{ color: ACCENT }}>{t('invoicing')}</h2>
        <p className="text-xs text-muted mb-4">{t('invoicingBody')}</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('paymentTermsDays')}>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={paymentTermsDays}
                onChange={e => setPaymentTermsDays(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={t('invoiceNumberPrefix')}>
              <input
                type="text"
                value={invoiceNumberPrefix}
                onChange={e => setInvoiceNumberPrefix(e.target.value)}
                placeholder={t('invoiceNumberPrefixPlaceholder')}
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            {t('nextInvoiceNumberPreview', { number: nextInvoiceNumberPreview(invoiceNumberPrefix, initialRateCard) })}
          </p>
          <Field label={t('accountHolderName')}>
            <input
              type="text"
              value={accountHolderName}
              onChange={e => setAccountHolderName(e.target.value)}
              placeholder={t('accountHolderNamePlaceholder')}
              className={inputClass}
            />
          </Field>
          <Field label={t('invoiceFooterNote')}>
            <textarea
              value={invoiceFooterNote}
              onChange={e => setInvoiceFooterNote(e.target.value)}
              rows={2}
              placeholder={t('invoiceFooterNotePlaceholder')}
              className={`${inputClass} resize-y`}
            />
          </Field>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>{t('pricing')}</h2>
        <div className="flex flex-col gap-3">
          <Field label={t('labourRatePerHour')} error={errors.labourRate}>
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
          <Field label={t('materialMarkup')} error={errors.markupPercent}>
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
          <Field label={t('vatPercent')} error={errors.vatPercent}>
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

      {/* ── Recurring quote display ───────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-1" style={{ color: ACCENT }}>{t('recurringDisplay')}</h2>
        <p className="text-xs text-muted mb-4">{t('recurringDisplayBody')}</p>
        <button
          type="button"
          onClick={() => setPricesExVat(v => !v)}
          className="flex items-center justify-between h-12 px-3.5 rounded-xl border border-border bg-surface"
        >
          <span className="text-sm font-medium text-on-surface text-left">{t('showExclVat')}<br /><span className="text-xs text-muted font-normal">{t('showExclVatSub')}</span></span>
          <span
            className="w-11 h-6 rounded-full relative transition shrink-0 ml-3"
            style={{ backgroundColor: pricesExVat ? ACCENT : 'var(--color-border)' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
              style={{ transform: pricesExVat ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </span>
        </button>
      </section>

      {/* ── Notifications ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-1" style={{ color: ACCENT }}>{t('notifications')}</h2>
        <p className="text-xs text-muted mb-4">{t('notificationsBody')}</p>

        <div className="flex flex-col gap-2 mb-4">
          <button
            type="button"
            onClick={() => setNotifyOnAccept(v => !v)}
            className="flex items-center justify-between h-12 px-3.5 rounded-xl border border-border bg-surface"
          >
            <span className="text-sm font-medium text-on-surface text-left">{t('notifyOnAccept')}</span>
            <span
              className="w-11 h-6 rounded-full relative transition shrink-0 ml-3"
              style={{ backgroundColor: notifyOnAccept ? ACCENT : 'var(--color-border)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: notifyOnAccept ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setNotifyOnDecline(v => !v)}
            className="flex items-center justify-between h-12 px-3.5 rounded-xl border border-border bg-surface"
          >
            <span className="text-sm font-medium text-on-surface text-left">{t('notifyOnDecline')}</span>
            <span
              className="w-11 h-6 rounded-full relative transition shrink-0 ml-3"
              style={{ backgroundColor: notifyOnDecline ? ACCENT : 'var(--color-border)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: notifyOnDecline ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </span>
          </button>
        </div>

        <Field label={t('notificationEmail')}>
          <input
            type="email"
            inputMode="email"
            value={notificationEmail}
            onChange={e => setNotificationEmail(e.target.value)}
            placeholder={t('notificationEmailPlaceholder')}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-muted mt-1.5">{t('notificationEmailHint')}</p>
      </section>

      {/* ── Terms & conditions ─────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-border p-5">
        <h2 className="text-sm font-bold mb-4" style={{ color: ACCENT }}>{t('termsConditions')}</h2>
        <p className="text-xs text-muted mb-3">{t('termsBody')}</p>
        <textarea
          value={termsText}
          onChange={e => setTermsText(e.target.value)}
          rows={6}
          placeholder={t('termsPlaceholder')}
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
            {t('saving')}
          </>
        ) : justSaved ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {t('saved')}
          </>
        ) : t('saveSettings')}
      </button>
    </div>
  )
}

const inputClass = 'w-full h-12 rounded-xl border border-border bg-white px-3.5 text-base text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition'

/** Mirrors assign_invoice_number()'s own logic (see supabase-invoicing-setup.sql):
 * the counter resets to 1 whenever the stored year doesn't match the
 * invoice's year — for this live preview, "now". */
function nextInvoiceNumberPreview(prefix: string, rc: Pick<InitialRateCard, 'invoice_next_sequence' | 'invoice_next_sequence_year'>): string {
  const year = new Date().getFullYear()
  const sequence = rc.invoice_next_sequence_year === year ? rc.invoice_next_sequence : 1
  return `${prefix}${year}-${String(sequence).padStart(4, '0')}`
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
