'use server'

/**
 * Reading/writing the app's UI language. This is the CONTRACTOR's own app
 * language (the "NL | EN" corner switch) — separate from a quote's own
 * language (jobs.language), which drives what a customer sees regardless
 * of who's viewing it. See src/i18n/config.ts for the two-locale model.
 *
 * Source of truth is rate_cards.language (persists across reloads/new
 * sessions, per requirement); the `locale` cookie is just a fast cache of
 * it so every request doesn't need a DB round trip.
 */
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

export async function getUserLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE
}

/**
 * Called from the language switcher. Updates the cookie immediately (so
 * the UI flips on this request) and, if logged in, persists the choice to
 * rate_cards.language so it survives a new session on another device.
 */
export async function setUserLocale(locale: Locale): Promise<void> {
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Every contractor's most recent rate card is their one settings row —
  // same "latest by created_at" pattern used throughout the app.
  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rateCard) {
    await supabase.from('rate_cards').update({ language: locale }).eq('id', rateCard.id)
  } else {
    // No rate card yet (never visited Settings) — without this, the choice
    // would only live in the cookie and be silently forgotten on the next
    // login, since syncLocaleFromRateCard() resets to the default when it
    // finds no row. Every other column has a DB-level default.
    await supabase.from('rate_cards').insert({ owner_id: user.id, language: locale })
  }
}

/**
 * Called once at login so a contractor's saved preference (set on another
 * device, or before this cookie existed) takes over from whatever the
 * cookie currently says.
 */
export async function syncLocaleFromRateCard(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('language')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const locale = LOCALES.includes(rateCard?.language as Locale) ? (rateCard!.language as Locale) : DEFAULT_LOCALE
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
