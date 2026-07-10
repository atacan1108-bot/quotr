/**
 * Fetches all data needed to export a quote as PDF or DOCX.
 * Used exclusively by the API route handlers — never runs in the browser.
 */

import { createClient } from './supabase/server'
import { calculateProposal, calculateRecurringPeriods } from './pricing'
import type { ProposalBreakdown, RecurringPeriods } from './pricing'
import type { Job, Client, Proposal, RateCard } from './types'
import { EMPTY_BRANDING } from './types'

export interface QuoteExportData {
  job: Job & { clients: Client | null }
  proposal: Proposal | null
  rateCard: Pick<
    RateCard,
    | 'labour_rate_per_hour'
    | 'material_markup_percent'
    | 'vat_percent'
    | 'business_name'
    | 'business_address'
    | 'business_email'
    | 'currency'
    | 'logo_url'
    | 'terms_text'
    | 'branding'
    | 'template_html'
    | 'prices_shown_excluding_vat'
  >
  /**
   * The ONE pricing calculation, from job.line_items — used by BOTH quote
   * types identically. For a recurring quote this represents the cost of
   * one occurrence (e.g. one day on site); recurringPeriods below scales it
   * up by the contract terms.
   */
  breakdown: ProposalBreakdown
  /** Derived from `breakdown` + job.recurring_config — null for one-off jobs. */
  recurringPeriods: RecurringPeriods | null
  shareUrl: string
  /**
   * Stable per-contractor sequence number for this proposal (1, 2, 3, ...),
   * counted from proposals.created_at rather than a stored counter column —
   * there's no quote-numbering system elsewhere in the schema yet, and this
   * needs no migration and can't drift out of sync. null when there's no
   * saved proposal yet to number.
   */
  quoteSequence: number | null
}

const DEFAULT_RC = {
  labour_rate_per_hour:    65,
  material_markup_percent: 15,
  vat_percent:             21,
  currency:                'EUR',
  business_name:           null,
  business_address:        null,
  business_email:          null,
  logo_url:                null,
  terms_text:              null,
  branding:                EMPTY_BRANDING,
  template_html:           null,
  prices_shown_excluding_vat: false,
}

export async function getQuoteExportData(
  jobId:   string,
  baseUrl: string,
): Promise<QuoteExportData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: job }, { data: proposal }, { data: rateCard }] = await Promise.all([
    supabase
      .from('jobs')
      .select('*, clients(*)')
      .eq('id', jobId)
      .eq('owner_id', user.id)
      .single(),
    supabase
      .from('proposals')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rate_cards')
      .select('labour_rate_per_hour, material_markup_percent, vat_percent, currency, business_name, business_address, business_email, logo_url, terms_text, branding, template_html, prices_shown_excluding_vat')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!job) return null

  const rc = rateCard ?? DEFAULT_RC

  // Run the pricing engine on the stored line items.
  // This is the single source of truth for all numbers in the export.
  const breakdown = calculateProposal(
    (job.line_items ?? []) as Parameters<typeof calculateProposal>[0],
    rc,
  )

  // Recurring jobs scale that SAME breakdown up by the contract terms —
  // null for one-off jobs so callers can tell the two apart unambiguously.
  const recurringPeriods = job.quote_type === 'recurring'
    ? calculateRecurringPeriods(breakdown, {
        days_per_week:        job.recurring_config?.days_per_week ?? 0,
        weeks_per_year:       job.recurring_config?.weeks_per_year ?? 0,
        contract_term_months: job.recurring_config?.contract_term_months ?? 0,
      })
    : null

  const shareUrl = proposal?.share_token
    ? `${baseUrl}/quote/${proposal.share_token}`
    : ''

  let quoteSequence: number | null = null
  if (proposal) {
    const { count } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .lte('created_at', proposal.created_at)
    quoteSequence = count ?? 1
  }

  return {
    job:      job       as Job & { clients: Client | null },
    proposal: proposal  as Proposal | null,
    rateCard: rc,
    breakdown,
    recurringPeriods,
    shareUrl,
    quoteSequence,
  }
}
