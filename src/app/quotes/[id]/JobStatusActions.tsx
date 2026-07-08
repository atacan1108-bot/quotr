'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/lib/types'

const ADVANCE: Partial<Record<JobStatus, JobStatus>> = {
  draft:  'sent',
  quoted: 'sent',
  sent:   'accepted',
}

const ADVANCE_LABELS: Partial<Record<JobStatus, string>> = {
  draft:  'Mark as sent',
  quoted: 'Mark as sent',
  sent:   'Mark as accepted',
}

export default function JobStatusActions({
  jobId,
  currentStatus,
}: {
  jobId: string
  currentStatus: JobStatus
}) {
  const router   = useRouter()
  const supabase = createClient()
  const [loading,     setLoading]     = useState(false)
  const [downloading, setDownloading] = useState(false)

  const next = ADVANCE[currentStatus]

  async function updateStatus(status: JobStatus) {
    setLoading(true)
    await supabase.from('jobs').update({ status }).eq('id', jobId)
    router.refresh()
    setLoading(false)
  }

  async function downloadPdf() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/quote/${jobId}/pdf`)
      if (!res.ok) throw new Error(await res.text())
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] ?? 'offerte.pdf'
      const a        = Object.assign(document.createElement('a'), { href: url, download: filename })
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      alert(`Download failed: ${(err as Error).message}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border px-4 py-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-2">

        {/* Status advance */}
        {next && ADVANCE_LABELS[currentStatus] && (
          <button
            onClick={() => updateStatus(next)}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading ? 'Updating…' : ADVANCE_LABELS[currentStatus]}
          </button>
        )}

        {/* Download PDF — always solid teal, never invisible */}
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="w-full h-12 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {downloading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating PDF…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              Download PDF
            </>
          )}
        </button>

        {/* Print + Decline row */}
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            disabled={downloading}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface active:bg-surface active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Print
          </button>

          {currentStatus !== 'declined' && currentStatus !== 'accepted' && (
            <button
              onClick={() => updateStatus('declined')}
              disabled={loading}
              className="flex-1 h-11 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-50 active:scale-[0.98] transition disabled:opacity-60"
            >
              Decline
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
