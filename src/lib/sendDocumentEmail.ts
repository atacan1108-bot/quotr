/**
 * Sends a quote/invoice PDF to a client by email, via the same Resend
 * account already used for accept/decline notifications
 * (src/lib/notifyContractor.ts) — this is the ONE place that actually
 * calls resend.emails.send() with an attachment; both the quote and
 * invoice "Send email" API routes call this rather than each calling
 * Resend directly.
 *
 * SENDER IDENTITY: reads RESEND_FROM_EMAIL (falls back to Resend's own
 * onboarding@resend.dev sandbox address if unset, matching this
 * project's existing "warn and use a safe default" convention for
 * optional env vars). Confirmed against Resend's current docs before
 * building this: onboarding@resend.dev can only deliver to the Resend
 * ACCOUNT's own registered email address — sending to any other address
 * fails with an explicit 403, not silently. Real client sends need
 * RESEND_FROM_EMAIL set to an address on a domain verified in the Resend
 * dashboard (resend.com/domains). See the project's plan file / README
 * for the exact DNS steps.
 */
import { Resend } from 'resend'
import { escapeHtmlParagraphs } from '@/lib/htmlTemplate'

const DEFAULT_FROM_ADDRESS = 'onboarding@resend.dev'

export interface SendDocumentEmailOptions {
  to: string
  cc?: string | null
  fromName: string           // business name — shown as the email's display name
  replyTo: string | null      // business email — so client replies land with the contractor
  subject: string
  bodyText: string            // plain text, blank-line-separated paragraphs
  attachmentFilename: string
  attachmentBuffer: Buffer
}

export class SendDocumentEmailError extends Error {}

export async function sendDocumentEmail(opts: SendDocumentEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  // Presence-only diagnostic — never logs the key itself, just whether one
  // was loaded and how long it is, so a misconfigured/stale env can be
  // confirmed from server logs alone (env vars only load at server start,
  // so a key added to .env.local after the dev server was already running
  // won't show up here until the server restarts).
  console.log('sendDocumentEmail: RESEND_API_KEY present =', !!apiKey, apiKey ? `(length ${apiKey.length})` : '(not set)')
  if (!apiKey || apiKey === 'PASTE_YOUR_RESEND_API_KEY_HERE') {
    throw new SendDocumentEmailError('Email sending isn\'t set up yet — add RESEND_API_KEY in .env.local.')
  }
  // Every real Resend key starts with "re_" (confirmed against Resend's
  // current docs) — catching a malformed value here, before ever calling
  // Resend, gives a specific "the key itself looks wrong" message instead
  // of a generic API rejection that's easy to confuse with "not set up".
  if (!apiKey.startsWith('re_')) {
    throw new SendDocumentEmailError('The RESEND_API_KEY in .env.local doesn\'t look like a real Resend key (a real one always starts with "re_") — re-copy it from resend.com/api-keys and paste it in fresh, then restart the server.')
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_ADDRESS
  const resend = new Resend(apiKey)

  const html = escapeHtmlParagraphs(opts.bodyText)

  // The Resend SDK does NOT throw on an API-level rejection (bad key,
  // unverified domain, rate limit, ...) — it resolves with { error } and a
  // null error only on success. Same discipline as notifyContractor.ts:
  // check it explicitly, or a real failure here would silently vanish
  // instead of reaching the caller's error handling.
  const { error } = await resend.emails.send({
    from: `${opts.fromName} <${fromAddress}>`,
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    subject: opts.subject,
    html,
    attachments: [
      { filename: opts.attachmentFilename, content: opts.attachmentBuffer },
    ],
  })

  if (error) {
    throw new SendDocumentEmailError(describeResendError(error, fromAddress))
  }
}

/** Translates the specific, known "sandbox domain, non-owner recipient"
 * rejection into a clear, actionable message — the failure mode every
 * contractor WILL hit until a domain is verified — and falls back to a
 * generic-but-still-specific message for anything else Resend rejects. */
function describeResendError(error: { name?: string; message?: string }, fromAddress: string): string {
  const message = error.message ?? ''
  // Resend's own documented error for a well-formed but wrong/revoked key
  // (name: "invalid_api_key", HTTP 403, message "API key is invalid.") —
  // distinguished from "not set up" (no key at all) and from the
  // domain-verification case below, so the fix a person needs to make is
  // never ambiguous.
  if (error.name === 'invalid_api_key' || /api key is invalid/i.test(message)) {
    return 'The RESEND_API_KEY in .env.local was loaded, but Resend says it\'s not a valid key — it may have been revoked or mistyped. Get a fresh key at resend.com/api-keys, paste it into .env.local, then restart the server.'
  }
  if (/only send testing emails to your own email address/i.test(message) || /verify a domain/i.test(message)) {
    return `This email address (${fromAddress}) isn't verified for sending to real clients yet — Resend only allows sending to your own account email until a sending domain is verified at resend.com/domains. See the setup notes for exactly what to add.`
  }
  return `Could not send the email: ${error.name ?? 'Resend error'} — ${message || 'unknown error'}`
}
