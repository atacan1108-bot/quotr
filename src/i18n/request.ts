import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import type { Locale } from '@/i18n/config'
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n/config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieValue = store.get(LOCALE_COOKIE)?.value
  const locale: Locale = LOCALES.includes(cookieValue as Locale) ? (cookieValue as Locale) : DEFAULT_LOCALE

  const messages = (await import(`../../messages/${locale}.json`)).default

  return { locale, messages }
})
