/**
 * The ONE notification code path for both public-page outcomes — a
 * customer accepting or declining a quote. Called by both
 * /api/public/proposals/[token]/accept and .../decline; do not duplicate
 * this logic in a second place for either action.
 *
 * Always best-effort: callers must call this AFTER the accept/decline
 * status change has already been durably saved, and must never let a
 * failure here surface as an error to the customer — see the try/catch at
 * each call site.
 */
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatEuro } from '@/lib/pricing'
import { formatDate } from '@/lib/formatDate'
import { DEFAULT_LOCALE } from '@/i18n/config'
import type { Locale } from '@/i18n/config'
import {
  pdfLabels,
  emailAcceptedSubjectLabel, emailAcceptedIntroLabel,
  emailDeclinedSubjectLabel, emailDeclinedIntroLabel,
} from '@/lib/pdf/pdfLabels'

export type NotificationKind = 'accepted' | 'declined'

export interface NotifyContractorOptions {
  kind:           NotificationKind
  ownerId:        string | null
  jobId:          string
  businessName:   string
  businessEmail:  string | null
  clientName:     string
  jobTitle:       string
  total:          number
  eventAt:        string            // ISO timestamp of the accept/decline
  baseUrl:        string            // for the "view in app" link
  signedPdfUrl?:  string | null     // accepted only
  declineReason?: string | null     // declined only
}

/** Stable per-contractor sequence number for a proposal (1, 2, 3, ...),
 * counted the same way quoteData.ts does for the authenticated PDF/DOCX
 * export — kept as its own small query here since this runs from the
 * public, admin-client side and has no session to share that helper with. */
async function computeQuoteNumber(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  proposalCreatedAt: string,
  quoteNumberPrefix: string | null | undefined,
): Promise<string> {
  const { count } = await admin
    .from('proposals')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .lte('created_at', proposalCreatedAt)
  const sequence = count ?? 1
  return `${quoteNumberPrefix ?? ''}${String(sequence).padStart(3, '0')}`
}

export async function notifyContractor(opts: NotifyContractorOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === 'PASTE_YOUR_RESEND_API_KEY_HERE') {
    console.warn(`notifyContractor: RESEND_API_KEY not set — skipping ${opts.kind} notification email`)
    return
  }
  if (!opts.ownerId) {
    console.warn(`notifyContractor: no ownerId — skipping ${opts.kind} notification email`)
    return
  }

  const admin = createAdminClient()

  // This email goes to the CONTRACTOR, so it follows THEIR app language and
  // THEIR notification preferences — independent of the quote's own
  // language. rate_cards is the single source of truth for both.
  let contractorLocale: Locale = DEFAULT_LOCALE
  let toEmail: string | null = opts.businessEmail
  let quoteNumberPrefix: string | null = null
  let proposalCreatedAt: string | null = null

  try {
    const { data: rc } = await admin
      .from('rate_cards')
      .select('language, notify_on_accept, notify_on_decline, notification_email, branding')
      .eq('owner_id', opts.ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (rc?.language) contractorLocale = rc.language
    if (rc) {
      const wantsNotification = opts.kind === 'accepted' ? rc.notify_on_accept : rc.notify_on_decline
      if (!wantsNotification) {
        console.log(`notifyContractor: ${opts.kind} notification disabled in settings — skipping`)
        return
      }
      toEmail = rc.notification_email || opts.businessEmail
      quoteNumberPrefix = (rc.branding as { quoteNumberPrefix?: string | null } | null)?.quoteNumberPrefix ?? null
    }
  } catch (err) {
    console.error('notifyContractor: could not look up rate_cards preferences', err)
  }

  // Fall back to the contractor's own login email if there's still nothing
  // to send to (matches the original accept-only behavior).
  if (!toEmail) {
    try {
      const { data } = await admin.auth.admin.getUserById(opts.ownerId)
      toEmail = data.user?.email ?? null
    } catch (err) {
      console.error('notifyContractor: could not look up contractor login email', err)
    }
  }
  if (!toEmail) {
    console.warn('notifyContractor: no contractor email available — skipping notification email')
    return
  }

  try {
    const { data: proposalRow } = await admin
      .from('proposals')
      .select('created_at')
      .eq('job_id', opts.jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    proposalCreatedAt = proposalRow?.created_at ?? null
  } catch (err) {
    console.error('notifyContractor: could not look up proposal for quote numbering', err)
  }

  const quoteNumber = proposalCreatedAt
    ? await computeQuoteNumber(admin, opts.ownerId, proposalCreatedAt, quoteNumberPrefix)
    : ''

  const le = pdfLabels(contractorLocale)
  const viewUrl = `${opts.baseUrl}/quotes/${opts.jobId}`
  const eventTime = formatDate(opts.eventAt, contractorLocale, 'datetime')

  const subject = opts.kind === 'accepted'
    ? emailAcceptedSubjectLabel(contractorLocale, opts.clientName, quoteNumber)
    : emailDeclinedSubjectLabel(contractorLocale, opts.clientName, quoteNumber)

  const introHtml = opts.kind === 'accepted'
    ? emailAcceptedIntroLabel(contractorLocale, escapeHtml(opts.clientName), escapeHtml(opts.jobTitle))
    : emailDeclinedIntroLabel(contractorLocale, escapeHtml(opts.clientName), escapeHtml(opts.jobTitle))

  const html = `
    <p>${introHtml}</p>
    <p>${le.quoteNumber}: <strong>${escapeHtml(quoteNumber)}</strong> · ${escapeHtml(opts.jobTitle)}</p>
    <p>${le.emailTotalLabel} <strong>${formatEuro(opts.total)}</strong></p>
    <p>${le.emailTimeLabel} ${escapeHtml(eventTime)}</p>
    ${opts.kind === 'declined' && opts.declineReason
      ? `<p>${le.emailDeclineReasonLabel} ${escapeHtml(opts.declineReason)}</p>`
      : ''}
    ${opts.kind === 'accepted' && opts.signedPdfUrl
      ? `<p><a href="${opts.signedPdfUrl}">${le.emailDownloadSignedPdf}</a></p>`
      : ''}
    <p><a href="${viewUrl}">${le.emailViewInApp}</a></p>
    <p>— ${escapeHtml(opts.businessName)}</p>
  `

  const resend = new Resend(apiKey)
  // The Resend SDK does NOT throw on an API-level rejection (bad key,
  // unverified domain, rate limit, ...) — it resolves with { error } and a
  // null error only on success. Check it explicitly, or a real failure
  // here would silently vanish instead of hitting the caller's catch block.
  const { error } = await resend.emails.send({
    from:    'Quotr <onboarding@resend.dev>',
    to:      toEmail,
    subject,
    html,
  })
  if (error) {
    throw new Error(`Resend API rejected the ${opts.kind} notification: ${error.name} — ${error.message}`)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
