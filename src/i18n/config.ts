/**
 * Single source of truth for supported app locales. The app language is
 * NOT part of the URL (no /nl/... /en/... routes) — it's read from a
 * cookie, itself kept in sync with the logged-in contractor's
 * rate_cards.language so the choice survives reloads and new sessions.
 * See src/lib/locale.ts for reading/writing it.
 */
export const LOCALES = ['nl', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** New sessions and new contractors always start in Dutch. */
export const DEFAULT_LOCALE: Locale = 'nl'

export const LOCALE_COOKIE = 'locale'
