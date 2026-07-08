'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Job } from '@/lib/types'

interface Props {
  proposalId: string
  jobTitle: string
  clientName: string | null
  lineItems: Job['line_items']
  initialScopeText: string | null
  initialCoverNote: string | null
}

type Status = 'idle' | 'generating' | 'ready' | 'error'

export default function GenerateWordingSection({
  proposalId, jobTitle, clientName, lineItems, initialScopeText, initialCoverNote,
}: Props) {
  const supabase = createClient()

  const hasExisting = Boolean(initialScopeText || initialCoverNote)
  const [status, setStatus]         = useState<Status>(hasExisting ? 'ready' : 'idle')
  const [scopeText, setScopeText]   = useState(initialScopeText ?? '')
  const [coverNote, setCoverNote]   = useState(initialCoverNote ?? '')
  const [error, setError]           = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [justSaved, setJustSaved]   = useState(false)

  async function generate() {
    setStatus('generating')
    setError(null)
    try {
      const res = await fetch('/api/generate-wording', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle,
          clientName,
          lineItems: lineItems.map(i => ({ label: i.label, type: i.type, quantity: i.quantity })),
        }),
      })
      let data: { scope_text?: string; cover_note?: string; error?: string } | null = null
      try {
        data = await res.json()
      } catch {
        // Non-JSON response (e.g. redirected to the login page mid-session)
        throw new Error('Your session may have expired — please refresh the page and try again.')
      }
      if (!res.ok || !data) throw new Error(data?.error || 'Something went wrong — please try again.')

      setScopeText(data.scope_text ?? '')
      setCoverNote(data.cover_note ?? '')
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setStatus('error')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const { error: se } = await supabase
        .from('proposals')
        .update({ scope_text: scopeText, cover_note: coverNote })
        .eq('id', proposalId)
      if (se) throw se
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch {
      setError('Could not save your edits — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">AI wording</p>
        {(status === 'ready') && (
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
            Let AI draft a scope description and a cover note for this quote — you can edit before sending.
          </p>
          <button
            onClick={generate}
            className="h-11 px-5 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition"
          >
            Generate wording
          </button>
        </div>
      )}

      {status === 'generating' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <svg className="w-5 h-5 animate-spin text-teal-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-muted">Writing your wording…</p>
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

      {status === 'ready' && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Scope of work
            </label>
            <textarea
              value={scopeText}
              onChange={e => setScopeText(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Cover note to client
            </label>
            <textarea
              value={coverNote}
              onChange={e => setCoverNote(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition resize-y"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-xs text-red-700 leading-snug">{error}</p>
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="h-11 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:scale-95 transition disabled:opacity-60 flex items-center justify-center gap-2"
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
                Saved
              </>
            ) : 'Save wording'}
          </button>
        </div>
      )}
    </div>
  )
}
