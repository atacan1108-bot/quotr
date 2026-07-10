import type { Locale } from '@/i18n/config'

/**
 * Locale-aware date formatting shared by every screen and the PDFs —
 * Dutch renders "3 februari 2026", English "3 February 2026" (or the
 * short "3 Feb" form for compact list rows).
 */
export function formatDate(date: Date | string, locale: Locale, style: 'short' | 'long' = 'long'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const intlLocale = locale === 'nl' ? 'nl-NL' : 'en-GB'
  const options: Intl.DateTimeFormatOptions = style === 'short'
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' }
  return new Intl.DateTimeFormat(intlLocale, options).format(d)
}
