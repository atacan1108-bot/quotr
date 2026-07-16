import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import type { Metadata } from 'next'
import MarketingHome from '@/components/marketing/MarketingHome'

/**
 * The English marketing homepage. This app's locale is normally cookie-
 * based, not URL-based (see src/i18n/config.ts) — this one route is a
 * deliberate, narrow exception so `/en` works as a real shareable link,
 * without introducing a second, parallel locale-routing system for the
 * rest of the app. src/proxy.ts sets the locale cookie to "en" before
 * this renders, so MarketingHome (identical component to the one at `/`)
 * naturally renders in English via the same next-intl mechanism every
 * other page already uses.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.meta')
  return { title: t('title'), description: t('description') }
}

export default async function EnglishHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/quotes')
  return <MarketingHome />
}
