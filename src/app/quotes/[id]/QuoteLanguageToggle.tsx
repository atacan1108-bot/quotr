'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { Locale } from '@/i18n/config'

const ACCENT = '#0F766E'

export default function QuoteLanguageToggle({
  jobId,
  language,
}: {
  jobId:    string
  language: Locale
}) {
  const router   = useRouter()
  const supabase = createClient()
  const t     = useTranslations('quoteDetail')
  const tLang = useTranslations('language')
  const [current, setCurrent] = useState(language)
  const [saving,  setSaving]  = useState(false)

  async function setLanguage(loc: Locale) {
    if (loc === current || saving) return
    setSaving(true)
    setCurrent(loc)
    await supabase.from('jobs').update({ language: loc }).eq('id', jobId)
    router.refresh()
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted uppercase tracking-wide">{t('quoteLanguageLabel')}</span>
      <div className="flex rounded-full border border-border bg-white p-0.5">
        {(['nl', 'en'] as const).map(loc => (
          <button
            key={loc}
            type="button"
            onClick={() => setLanguage(loc)}
            aria-pressed={current === loc}
            disabled={saving}
            className="min-w-11 h-8 px-3 rounded-full text-xs font-semibold uppercase transition disabled:opacity-60"
            style={
              current === loc
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
  )
}
