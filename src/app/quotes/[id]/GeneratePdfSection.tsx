'use client'

import { useState } from 'react'

interface Props {
  jobId: string
  initialPdfUrl: string | null
}

type Status = 'idle' | 'generating' | 'ready' | 'error'

export default function GeneratePdfSection({ jobId, initialPdfUrl }: Props) {
  const [status, setStatus] = useState<Status>(initialPdfUrl ? 'ready' : 'idle')
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl)
  const [error, setError]   = useState<string | null>(null)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)

  async function generate() {
    setStatus('generating')
    setError(null)
    setFallbackNotice(null)
    try {
      const res = await fetch(`/api/quote/${jobId}/generate-pdf`, { method: 'POST' })

      let data: { pdfUrl?: string; error?: string; fellBack?: boolean; fallbackReason?: string | null } | null = null
      try {
        data = await res.json()
      } catch {
        throw new Error('Your session may have expired — please refresh the page and try again.')
      }
      if (!res.ok || !data?.pdfUrl) throw new Error(data?.error || 'Something went wrong — please try again.')

      if (data.fellBack) {
        setFallbackNotice(`Your custom template couldn't be used this time, so the standard design was used instead. Reason: ${data.fallbackReason}`)
      }

      // Cache-bust so a re-generated PDF doesn't show a stale cached version
      setPdfUrl(`${data.pdfUrl}?v=${Date.now()}`)
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Proposal PDF</p>
        {status === 'ready' && (
          <button
            onClick={generate}
            className="text-xs font-medium text-teal-500 hover:text-teal-700 transition"
          >
            Regenerate
          </button>
        )}
      </div>

      {status === 'idle' && (
        <div className="text-center py-4">
          <p className="text-sm text-muted mb-4">
            Build a branded PDF of this quote with your logo, the AI wording, and the full price breakdown.
          </p>
          <button
            onClick={generate}
            className="h-11 px-5 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition"
          >
            Generate PDF
          </button>
        </div>
      )}

      {status === 'generating' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <svg className="w-5 h-5 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-muted">Building your PDF…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-4">
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4 text-left">
            <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </div>
          <button
            onClick={generate}
            className="h-11 px-5 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && pdfUrl && (
        <div className="flex flex-col gap-3">
          {fallbackNotice && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-xs text-amber-800 leading-snug">{fallbackNotice}</p>
            </div>
          )}
          <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
            <svg className="w-8 h-8 text-teal-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">Proposal PDF ready</p>
              <p className="text-xs text-muted">Branded, with your logo, wording and pricing.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface active:scale-[0.98] transition flex items-center justify-center"
            >
              Preview
            </a>
            <a
              href={pdfUrl}
              download
              className="flex-1 h-11 rounded-xl bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 active:scale-[0.98] transition flex items-center justify-center"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
