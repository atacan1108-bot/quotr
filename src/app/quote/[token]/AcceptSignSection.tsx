'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SignaturePad from './SignaturePad'
import { pdfLabels, thankYouNotifiedLabel, signedByLabel } from '@/lib/pdf/pdfLabels'
import type { Locale } from '@/i18n/config'

interface Props {
  token:            string
  businessName:     string
  alreadyAccepted:  boolean
  initialSignerName: string | null
  initialSignedPdfUrl: string | null
  primaryColor:     string
  language:         Locale
}

type Status = 'form' | 'submitting' | 'done' | 'error'
type Mode   = 'draw' | 'type'

export default function AcceptSignSection({
  token, businessName, alreadyAccepted, initialSignerName, initialSignedPdfUrl, primaryColor, language,
}: Props) {
  const router = useRouter()
  const l = pdfLabels(language)
  const [status, setStatus]   = useState<Status>(alreadyAccepted ? 'done' : 'form')
  const [error, setError]     = useState<string | null>(null)
  const [mode, setMode]       = useState<Mode>('draw')
  const [signerName, setSignerName] = useState('')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [agreed, setAgreed]   = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState(initialSignedPdfUrl)

  // ── Decline sub-flow — a secondary, mutually exclusive response to the
  // same quote. Collapsed by default; expanding it hides nothing else, it's
  // just an extra panel under the Accept & sign form. ─────────────────────
  const [declineOpen,    setDeclineOpen]    = useState(false)
  const [declineReason,  setDeclineReason]  = useState('')
  const [declining,      setDeclining]      = useState(false)
  const [declineError,   setDeclineError]   = useState<string | null>(null)

  const nameEntered = signerName.trim().length > 0
  const canSubmit   = nameEntered && agreed && (mode === 'type' || signatureDataUrl !== null)

  async function submitDecline() {
    if (declining) return
    setDeclining(true)
    setDeclineError(null)
    try {
      const res = await fetch(`/api/public/proposals/${token}/decline`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      })
      let data: { ok?: boolean; error?: string } | null = null
      try {
        data = await res.json()
      } catch {
        throw new Error(l.sessionExpiredRetry)
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error || l.somethingWentWrongRetry)

      // Re-fetch server-side so the page re-derives quote.status and shows
      // the "you declined this quote" state — same mechanism as any other
      // status change on this page, no separate local confirmation UI to
      // keep in sync with it.
      router.refresh()
    } catch (err) {
      setDeclineError(err instanceof Error ? err.message : l.somethingWentWrongRetry)
      setDeclining(false)
    }
  }

  async function submit() {
    if (!canSubmit) return
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch(`/api/public/proposals/${token}/accept`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          // In "type" mode there's no drawn image — the typed name itself
          // is the signature, rendered in script style on the signed PDF.
          signatureDataUrl: mode === 'draw' ? signatureDataUrl : null,
        }),
      })

      let data: { ok?: boolean; error?: string; signedPdfUrl?: string } | null = null
      try {
        data = await res.json()
      } catch {
        throw new Error(l.sessionExpiredRetry)
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error || l.somethingWentWrongRetry)

      setSignedPdfUrl(data.signedPdfUrl ?? null)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : l.somethingWentWrongRetry)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl bg-teal-100 border border-teal-500/30 px-5 py-5 text-center">
        <svg className="w-8 h-8 text-teal-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        <p className="font-semibold text-teal-700">{thankYouNotifiedLabel(language, businessName)}</p>
        {initialSignerName && (
          <p className="text-sm text-teal-700/80 mt-1">{signedByLabel(language, initialSignerName)}</p>
        )}
        {signedPdfUrl && (
          <a
            href={signedPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-11 px-5 mt-4 rounded-xl bg-white border border-teal-500/30 text-teal-700 font-semibold text-sm hover:bg-teal-50 transition"
          >
            {l.downloadSignedCopy}
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h3 className="text-sm font-bold mb-1" style={{ color: primaryColor }}>{l.acceptSignTitle}</h3>
      <p className="text-xs text-muted mb-4">{l.acceptSignSubtitle}</p>

      {/* Draw / type toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex-1 h-10 rounded-xl text-sm font-medium transition ${mode === 'draw' ? 'text-white' : 'border border-border text-muted hover:bg-surface'}`}
          style={mode === 'draw' ? { backgroundColor: primaryColor } : undefined}
        >
          {l.drawSignature}
        </button>
        <button
          type="button"
          onClick={() => setMode('type')}
          className={`flex-1 h-10 rounded-xl text-sm font-medium transition ${mode === 'type' ? 'text-white' : 'border border-border text-muted hover:bg-surface'}`}
          style={mode === 'type' ? { backgroundColor: primaryColor } : undefined}
        >
          {l.typeSignature}
        </button>
      </div>

      {/* Name field — also serves as the visible signature in "type" mode */}
      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
        {l.yourFullName}
      </label>
      <input
        type="text"
        value={signerName}
        onChange={e => setSignerName(e.target.value)}
        placeholder={l.namePlaceholder}
        className="w-full h-12 rounded-xl border border-border bg-white px-3.5 text-base text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition mb-4"
      />

      {mode === 'draw' ? (
        <div className="mb-4">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            {l.signatureLabel}
          </label>
          <SignaturePad onChange={setSignatureDataUrl} language={language} />
        </div>
      ) : (
        nameEntered && (
          <div className="mb-4 rounded-xl border-2 border-dashed border-border bg-surface px-4 py-5 text-center">
            <p className="text-2xl" style={{ fontFamily: 'cursive', color: primaryColor }}>{signerName}</p>
            <p className="text-xs text-muted mt-2">{l.typedSignaturePreview}</p>
          </div>
        )
      )}

      {/* Explicit confirmation, required before submitting */}
      <label className="flex items-start gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 w-5 h-5 rounded border-border text-teal-500 focus:ring-teal-500 shrink-0"
        />
        <span className="text-sm text-on-surface">
          {l.agreeToTerms}
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-xs text-red-700 leading-snug">{error}</p>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit || status === 'submitting'}
        className="w-full h-13 rounded-2xl text-white font-semibold text-base hover:opacity-90 active:scale-[0.98] transition disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ backgroundColor: primaryColor }}
      >
        {status === 'submitting' ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {l.submitting}
          </>
        ) : l.acceptAndSign}
      </button>

      {/* ── Decline — secondary/subtle, mutually exclusive with Accept ── */}
      {!declineOpen ? (
        <button
          type="button"
          onClick={() => setDeclineOpen(true)}
          disabled={status === 'submitting'}
          className="w-full h-11 mt-2 text-sm font-medium text-muted hover:text-red-600 transition disabled:opacity-40"
        >
          {l.declineThisQuote}
        </button>
      ) : (
        <div className="mt-4 pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-on-surface mb-2">{l.declineConfirmTitle}</h4>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            {l.declineReasonLabel}
          </label>
          <textarea
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            placeholder={l.declineReasonPlaceholder}
            rows={3}
            className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition resize-y mb-3"
          />

          {declineError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-xs text-red-700 leading-snug">{declineError}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setDeclineOpen(false); setDeclineError(null) }}
              disabled={declining}
              className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface transition disabled:opacity-60"
            >
              {l.cancelDecline}
            </button>
            <button
              type="button"
              onClick={submitDecline}
              disabled={declining}
              className="flex-1 h-11 rounded-xl border border-red-300 text-sm font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-60"
            >
              {declining ? l.decliningStatus : l.confirmDecline}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
