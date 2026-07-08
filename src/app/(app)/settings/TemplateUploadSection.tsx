'use client'

/**
 * Upload a fully-designed HTML quote template — replaces the old
 * color/font-extraction "import from existing template" flow entirely.
 * The contractor authors (or has an AI tool author) a real HTML document
 * with {{tokens}} for the data and a LINE_ITEMS_START/END region for the
 * repeating line items; nothing is saved until they explicitly click save
 * on the review screen, same "review before save" shape as before.
 */
import { useRef, useState, type ChangeEvent } from 'react'
import type { TemplateValidation } from '@/lib/htmlTemplate'

interface Props {
  ownerId:             string
  accent:              string
  hasExistingTemplate: boolean
}

type Phase = 'idle' | 'checking' | 'review' | 'previewing' | 'saving' | 'done' | 'error'

const MAX_FILE_MB = 2

async function readJsonError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    return data.error || fallback
  } catch {
    return fallback
  }
}

export default function TemplateUploadSection({ accent, hasExistingTemplate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null)
  const [validation, setValidation] = useState<TemplateValidation | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  function reset() {
    setPhase('idle')
    setError(null)
    setFileName(null)
    setSanitizedHtml(null)
    setValidation(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['html', 'htm'].includes(ext)) {
      setError('Please upload an .html file.')
      setPhase('error')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please upload something under ${MAX_FILE_MB} MB.`)
      setPhase('error')
      return
    }

    setFileName(file.name)
    setPhase('checking')
    try {
      const html = await file.text()
      const res = await fetch('/api/settings/template/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Could not read that file — please try again.'))
      const data: { sanitizedHtml: string; validation: TemplateValidation } = await res.json()
      setSanitizedHtml(data.sanitizedHtml)
      setValidation(data.validation)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file — please try again.')
      setPhase('error')
    }
  }

  async function handlePreview() {
    if (!sanitizedHtml) return
    setPhase('previewing')
    setError(null)
    try {
      const res = await fetch('/api/settings/template/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: sanitizedHtml }),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Could not render a preview — please try again.'))
      const blob = await res.blob()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(blob))
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not render a preview — please try again.')
      setPhase('review')
    }
  }

  async function handleSave() {
    if (!sanitizedHtml) return
    setPhase('saving')
    setError(null)
    try {
      const res = await fetch('/api/settings/template/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: sanitizedHtml }),
      })
      if (!res.ok) throw new Error(await readJsonError(res, 'Could not save your template — please try again.'))
      setPhase('done')
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your template — please try again.')
      setPhase('review')
    }
  }

  // ── done ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <section className="bg-teal-100 rounded-2xl border border-teal-500/30 p-5 text-center">
        <p className="font-semibold text-teal-700">Template saved — your quotes will now use this design.</p>
      </section>
    )
  }

  // ── review ───────────────────────────────────────────────────────────
  if (phase === 'review' || phase === 'previewing' || phase === 'saving') {
    const v = validation
    return (
      <section className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold" style={{ color: accent }}>Review your template</h2>
          <button onClick={reset} className="text-xs text-muted hover:text-red-500 transition">Start over</button>
        </div>
        <p className="text-xs text-muted mb-4">{fileName} — nothing is saved yet.</p>

        {v && !v.hasLineItemsRegion && (
          <Notice tone="amber">
            No LINE_ITEMS_START / LINE_ITEMS_END region found — your line items won&apos;t appear on the quote.
          </Notice>
        )}
        {v && v.missingRequiredTokens.length > 0 && (
          <Notice tone="amber">
            Missing token{v.missingRequiredTokens.length > 1 ? 's' : ''}: {v.missingRequiredTokens.map(t => `{{${t}}}`).join(', ')} — these usually matter on every quote.
          </Notice>
        )}
        {v && v.unknownTokens.length > 0 && (
          <Notice tone="amber">
            Unrecognized token{v.unknownTokens.length > 1 ? 's' : ''} (won&apos;t be filled in): {v.unknownTokens.map(t => `{{${t}}}`).join(', ')} — check the token reference below for the exact names.
          </Notice>
        )}
        {v && v.hasLineItemsRegion && v.missingRequiredTokens.length === 0 && v.unknownTokens.length === 0 && (
          <Notice tone="teal">Looks good — every required token and the line-items region were found.</Notice>
        )}

        <div className="flex flex-col gap-2 mb-4">
          <button
            onClick={handlePreview}
            disabled={phase === 'previewing'}
            className="h-11 rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface transition disabled:opacity-60"
          >
            {phase === 'previewing' ? 'Rendering preview…' : previewUrl ? 'Re-render preview PDF' : 'Preview with sample data'}
          </button>

          {previewUrl && (
            <iframe src={previewUrl} className="w-full h-[420px] rounded-xl border border-border" title="Template preview" />
          )}
        </div>

        {error && <Notice tone="red">{error}</Notice>}

        <button
          onClick={handleSave}
          disabled={phase === 'saving'}
          className="w-full h-12 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {phase === 'saving' ? 'Saving…' : 'Use this template for my quotes'}
        </button>
      </section>
    )
  }

  // ── idle / checking / error ─────────────────────────────────────────
  return (
    <section className="bg-white rounded-2xl border border-border p-5">
      <h2 className="text-sm font-bold mb-1" style={{ color: accent }}>
        {hasExistingTemplate ? 'Replace your quote template' : 'Quote template'}
      </h2>
      <p className="text-xs text-muted mb-3">
        Upload a fully-designed HTML file (e.g. from an AI design tool) and every quote will be rendered from it —
        pixel for pixel, as a real PDF. {hasExistingTemplate && 'Uploading a new file replaces the one you have now, but only once you save it.'}
      </p>

      <button onClick={() => setShowGuide(s => !s)} className="text-xs font-medium underline mb-4" style={{ color: accent }}>
        {showGuide ? 'Hide token reference' : 'How do I build a template?'}
      </button>

      {showGuide && (
        <div className="bg-surface rounded-xl px-3.5 py-3 mb-4 text-xs text-on-surface leading-relaxed">
          <p className="mb-2">
            Write plain HTML + CSS (inline &lt;style&gt; is fine). Anywhere you want real data, drop in one of these —
            we replace them before rendering:
          </p>
          <p className="font-mono text-[11px] mb-2 break-words">
            {'{{business_logo}} {{business_name}} {{business_address}} {{business_email}} {{business_phone}} {{business_website}} {{business_kvk}} {{business_btw}} {{business_iban}} {{customer_name}} {{customer_address}} {{customer_email}} {{customer_phone}} {{quote_number}} {{quote_date}} {{cover_note}} {{scope_text}} {{subtotal}} {{vat_percent}} {{vat_amount}} {{total}} {{terms_text}} {{footer_text}}'}
          </p>
          <p className="mb-2">
            For the line items table, wrap ONE row in HTML comments — it repeats once per item:
          </p>
          <p className="font-mono text-[11px] mb-2 break-words">
            {'<!-- LINE_ITEMS_START --> <tr><td>{{item_label}}</td><td>{{item_quantity}}</td><td>{{item_unit_price}}</td><td>{{item_total}}</td></tr> <!-- LINE_ITEMS_END -->'}
          </p>
          <a href="/example-quote-template.html" download className="underline font-medium" style={{ color: accent }}>
            Download a complete working example
          </a>
        </div>
      )}

      {phase === 'error' && error && <Notice tone="red">{error}</Notice>}

      <input ref={fileInputRef} type="file" accept=".html,.htm" onChange={handleFileChange} className="hidden" id="template-html-upload" />
      <label
        htmlFor="template-html-upload"
        className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-white font-semibold text-sm cursor-pointer transition"
        style={{ backgroundColor: accent, opacity: phase === 'checking' ? 0.6 : 1, pointerEvents: phase === 'checking' ? 'none' : 'auto' }}
      >
        {phase === 'checking' ? 'Reading your template…' : 'Choose an .html file'}
      </label>
    </section>
  )
}

function Notice({ tone, children }: { tone: 'amber' | 'teal' | 'red'; children: React.ReactNode }) {
  const cls = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    teal:  'bg-teal-50 border-teal-200 text-teal-800',
    red:   'bg-red-50 border-red-200 text-red-700',
  }[tone]
  return <div className={`border rounded-xl px-3 py-2.5 mb-3 text-xs leading-snug ${cls}`}>{children}</div>
}
