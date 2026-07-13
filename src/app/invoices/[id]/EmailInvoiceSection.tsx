'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'

interface Props {
  invoiceId: string
  pdfUrl: string | null
  locale: Locale
  initialEmailSentTo: string | null
  initialSentAt: string | null
}

type Status = 'idle' | 'drafting' | 'draftError' | 'review' | 'sent'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EmailInvoiceSection({ invoiceId, pdfUrl, locale, initialEmailSentTo, initialSentAt }: Props) {
  const t = useTranslations('emailInvoiceSection')
  const tErrors = useTranslations('errors')

  const [status, setStatus] = useState<Status>(initialEmailSentTo ? 'sent' : 'idle')
  const [draftError, setDraftError] = useState<string | null>(null)

  const [to, setTo] = useState('')
  const [ccSelfAddress, setCcSelfAddress] = useState('')
  const [wantsCc, setWantsCc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachmentFilename, setAttachmentFilename] = useState('')

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState(initialSentAt)
  const [sentTo, setSentTo] = useState(initialEmailSentTo)

  if (!pdfUrl) return null

  async function draftEmail() {
    setStatus('drafting')
    setDraftError(null)
    try {
      const res = await fetch(`/api/invoice/${invoiceId}/draft-email`, { method: 'POST' })
      let data: { to?: string; ccSelf?: string; subject?: string; body?: string; attachmentFilename?: string; error?: string } | null = null
      try {
        data = await res.json()
      } catch {
        throw new Error(t('sessionExpired'))
      }
      if (!res.ok || !data) throw new Error(data?.error || tErrors('somethingWentWrong'))

      setTo(data.to ?? '')
      setCcSelfAddress(data.ccSelf ?? '')
      setSubject(data.subject ?? '')
      setBody(data.body ?? '')
      setAttachmentFilename(data.attachmentFilename ?? '')
      setStatus('review')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : tErrors('somethingWentWrong'))
      setStatus('draftError')
    }
  }

  async function sendEmail() {
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/invoice/${invoiceId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc: wantsCc, subject, body }),
      })
      let data: { sentAt?: string; sentTo?: string; error?: string } | null = null
      try {
        data = await res.json()
      } catch {
        throw new Error(t('sessionExpired'))
      }
      if (!res.ok || !data) throw new Error(data?.error || tErrors('somethingWentWrong'))

      setSentAt(data.sentAt ?? new Date().toISOString())
      setSentTo(data.sentTo ?? to)
      setStatus('sent')
    } catch (err) {
      // Deliberately does NOT reset to/subject/body/attachmentFilename —
      // the contractor's edits must survive a failed send exactly as they
      // left them, so they can just fix the problem and press Send again.
      setSendError(err instanceof Error ? err.message : tErrors('somethingWentWrong'))
    } finally {
      setSending(false)
    }
  }

  const toIsValid = EMAIL_PATTERN.test(to.trim())

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('title')}</p>

      {status === 'idle' && (
        <div className="text-center py-4">
          <p className="text-sm text-muted mb-4">{t('idlePrompt')}</p>
          <button
            onClick={draftEmail}
            className="h-11 px-5 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition"
          >
            {t('draftButton')}
          </button>
        </div>
      )}

      {status === 'drafting' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <svg className="w-5 h-5 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-muted">{t('draftingStatus')}</p>
        </div>
      )}

      {status === 'draftError' && (
        <div className="text-center py-4">
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-left">
            <ErrorIcon />
            <p className="text-xs text-red-700 leading-snug">{draftError}</p>
          </div>
          <button
            onClick={draftEmail}
            className="h-11 px-5 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition"
          >
            {t('tryAgain')}
          </button>
        </div>
      )}

      {status === 'review' && (
        <EmailReviewForm
          t={t}
          to={to} setTo={setTo}
          toIsValid={toIsValid}
          wantsCc={wantsCc} setWantsCc={setWantsCc}
          ccSelfAddress={ccSelfAddress}
          subject={subject} setSubject={setSubject}
          body={body} setBody={setBody}
          attachmentFilename={attachmentFilename}
          sending={sending}
          sendError={sendError}
          onSend={sendEmail}
          onRedraft={draftEmail}
        />
      )}

      {status === 'sent' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
            <svg className="w-6 h-6 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">
                {t('sentTo', { email: sentTo ?? '' })}
              </p>
              {sentAt && <p className="text-xs text-muted">{formatDate(sentAt, locale, 'datetime')}</p>}
            </div>
          </div>
          <button
            onClick={draftEmail}
            className="text-xs font-medium text-teal-500 hover:text-teal-700 transition self-start"
          >
            {t('sendAgain')}
          </button>
        </div>
      )}
    </div>
  )
}

function EmailReviewForm({
  t, to, setTo, toIsValid, wantsCc, setWantsCc, ccSelfAddress,
  subject, setSubject, body, setBody, attachmentFilename,
  sending, sendError, onSend, onRedraft,
}: {
  t: ReturnType<typeof useTranslations<'emailInvoiceSection'>>
  to: string; setTo: (v: string) => void; toIsValid: boolean
  wantsCc: boolean; setWantsCc: (v: boolean) => void; ccSelfAddress: string
  subject: string; setSubject: (v: string) => void
  body: string; setBody: (v: string) => void
  attachmentFilename: string
  sending: boolean; sendError: string | null
  onSend: () => void; onRedraft: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">{t('to')}</label>
        <button onClick={onRedraft} className="text-xs font-medium text-teal-500 hover:text-teal-700 transition">
          {t('redraft')}
        </button>
      </div>
      <input
        type="email"
        value={to}
        onChange={e => setTo(e.target.value)}
        disabled={sending}
        className="w-full h-11 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
      />
      {!toIsValid && to.length > 0 && <p className="text-xs text-red-600">{t('invalidEmail')}</p>}

      {ccSelfAddress && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={wantsCc}
            onChange={e => setWantsCc(e.target.checked)}
            disabled={sending}
            className="w-4 h-4 accent-teal-500"
          />
          <span className="text-sm text-on-surface">{t('ccSelf', { email: ccSelfAddress })}</span>
        </label>
      )}

      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t('subject')}</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          disabled={sending}
          className="w-full h-11 px-3 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t('body')}</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={7}
          disabled={sending}
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60 resize-y"
        />
      </div>

      {attachmentFilename && (
        <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          <span className="text-xs text-muted truncate">{attachmentFilename}</span>
        </div>
      )}

      {sendError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <ErrorIcon />
          <p className="text-xs text-red-700 leading-snug">{sendError}</p>
        </div>
      )}

      <button
        onClick={onSend}
        disabled={sending || !toIsValid || !subject.trim() || !body.trim()}
        className="h-11 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {sending ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('sending')}
          </>
        ) : t('sendButton')}
      </button>
    </div>
  )
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  )
}
