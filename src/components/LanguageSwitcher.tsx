'use client'

import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { setUserLocale } from '@/lib/locale'
import type { Locale } from '@/i18n/config'

const ACCENT = '#0F766E'

/**
 * Fixed top-right corner on every screen (rendered once from the root
 * layout) — logged-out auth pages and the logged-in app alike, mobile and
 * desktop. Calling setUserLocale (a Server Action) updates the cookie and,
 * if logged in, rate_cards.language; Next.js automatically re-renders the
 * current route's Server Components afterward, which is what actually
 * flips every translated string on the page.
 *
 * Hidden on the public /quote/[token] share page: that page has its own,
 * separate per-QUOTE language (job.language, not this app-locale cookie),
 * and showing this switcher there would let a customer toggle a control
 * that does nothing meaningful for them.
 */
export default function LanguageSwitcher() {
  const locale = useLocale() as Locale
  const t = useTranslations('language')
  const pathname = usePathname()
  if (pathname?.startsWith('/quote/')) return null

  return (
    <div
      className="fixed z-50 flex bg-white rounded-full border border-border shadow-sm overflow-hidden"
      style={{ top: 'calc(env(safe-area-inset-top) + 10px)', right: 'calc(env(safe-area-inset-right) + 10px)' }}
    >
      {(['nl', 'en'] as const).map(l => (
        <button
          key={l}
          onClick={() => setUserLocale(l)}
          aria-label={l === 'nl' ? t('dutch') : t('english')}
          aria-pressed={locale === l}
          className="min-w-11 h-11 px-3 text-xs font-bold uppercase tracking-wide transition"
          style={
            locale === l
              ? { backgroundColor: ACCENT, color: '#fff' }
              : { backgroundColor: 'transparent', color: 'var(--color-muted)' }
          }
        >
          {l}
        </button>
      ))}
    </div>
  )
}
