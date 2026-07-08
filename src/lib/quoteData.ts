/**
 * Fetches all data needed to export a quote as PDF or DOCX.
 * Used exclusively by the API route handlers — never runs in the browser.
 */

import { createClient } from './supabase/server'
import { calculateProposal } from './pricing'
import type { ProposalBreakdown } from './pricing'
import type { Job, Client, Proposal, RateCard } from './types'

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
  >
  /** Full priced breakdown from the pricing engine (per-item + totals). */
  breakdown: ProposalBreakdown
  shareUrl: string
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
      .select('labour_rate_per_hour, material_markup_percent, vat_percent, currency, business_name, business_address, business_email, logo_url, terms_text')
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

  const shareUrl = proposal?.share_token
    ? `${baseUrl}/quote/${proposal.share_token}`
    : ''

  return {
    job:      job       as Job & { clients: Client | null },
    proposal: proposal  as Proposal | null,
    rateCard: rc,
    breakdown,
    shareUrl,
  }
}
