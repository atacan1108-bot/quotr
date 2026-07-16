import type { Locale } from '@/i18n/config'

/**
 * Locale-aware date formatting shared by every screen and the PDFs —
 * Dutch renders "3 februari 2026", English "3 February 2026" (or the
 * short "3 Feb" form for compact list rows, or "3 februari 2026, 14:32"
 * with the time included for notification emails).
 */
export function formatDate(date: Date | string, locale: Locale, style: 'short' | 'long' | 'datetime' = 'long'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const intlLocale = locale === 'nl' ? 'nl-NL' : 'en-GB'
  const options: Intl.DateTimeFormatOptions =
    style === 'short'    ? { day: 'numeric', month: 'short' } :
    style === 'datetime' ? { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } :
    { day: 'numeric', month: 'long', year: 'numeric' }
  return new Intl.DateTimeFormat(intlLocale, options).format(d)
}

/**
 * "juli 2026" / "July 2026" — month name always comes from Intl, never a
 * hardcoded list, so it's correct in both app languages automatically.
 * @param monthKey "YYYY-MM" (e.g. from the cash-flow month switcher)
 */
export function formatMonthYear(monthKey: string, locale: Locale): string {
  const [year, month] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, 1))
  const intlLocale = locale === 'nl' ? 'nl-NL' : 'en-GB'
  return new Intl.DateTimeFormat(intlLocale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}
