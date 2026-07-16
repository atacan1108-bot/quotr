/**
 * Server-only Mollie client factory. SECRET — MOLLIE_API_KEY must never be
 * read client-side or logged. Same "presence + format" validation quality
 * as src/lib/sendDocumentEmail.ts's RESEND_API_KEY checks (a genuinely
 * missing key and a malformed one get different, specific messages, so a
 * misconfiguration is never confused with "Mollie itself rejected this").
 *
 * TEST vs LIVE: a Mollie API key's own prefix (test_/live_) tells you which
 * mode it's in — there is no separate "test mode" flag to set. Whichever
 * key is pasted into MOLLIE_API_KEY IS the active mode. See isMollieLiveKey().
 */
import createMollieClient from '@mollie/api-client'

export class MollieConfigError extends Error {}

export function getMollieClient(): ReturnType<typeof createMollieClient> {
  const apiKey = process.env.MOLLIE_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_MOLLIE_API_KEY_HERE') {
    throw new MollieConfigError('Online payment isn\'t set up yet — add MOLLIE_API_KEY in .env.local.')
  }
  if (!apiKey.startsWith('test_') && !apiKey.startsWith('live_')) {
    throw new MollieConfigError('The MOLLIE_API_KEY doesn\'t look like a real Mollie key (a real one starts with "test_" or "live_") — re-copy it from the Mollie dashboard.')
  }
  return createMollieClient({ apiKey })
}

/** True only when a LIVE key (real money) is configured — false for a
 * missing key, a malformed one, or a test_ key. Used to gate anything that
 * must stay off until the contractor explicitly goes live (CHECKPOINT B). */
export function isMollieLiveKey(): boolean {
  return (process.env.MOLLIE_API_KEY ?? '').startsWith('live_')
}

export function isMollieConfigured(): boolean {
  const apiKey = process.env.MOLLIE_API_KEY
  return !!apiKey && apiKey !== 'PASTE_YOUR_MOLLIE_API_KEY_HERE' && (apiKey.startsWith('test_') || apiKey.startsWith('live_'))
}
