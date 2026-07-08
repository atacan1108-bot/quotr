/**
 * Data access for the PUBLIC /quote/[token] share page.
 *
 * SERVER-ONLY, and deliberately narrow: every function here takes a
 * share_token and returns (at most) the data for that ONE proposal — never
 * a list, never anything keyed by owner/user. This is the entire trust
 * boundary for anonymous access to contractor data, so don't loosen it:
 * no `select('*')`, no query that could ever match more than one proposal.
 */
import { createAdminClient } from './supabase/admin'
import { calculateProposal } from './pricing'
import type { ProposalBreakdown } from './pricing'
import { EMPTY_BRANDING, type Branding } from './types'

/** How many days after creation a quote can still be accepted. Not stored —
 * computed from created_at so there's no schema field to keep in sync. */
const VALIDITY_DAYS = 30

export type PublicQuoteStatus = 'open' | 'accepted' | 'declined' | 'expired'

export interface PublicQuoteView {
  proposalId:  string
  createdAt:   string
  expiresAt:   string
  status:      PublicQuoteStatus
  jobTitle:    string
  clientName:  string | null
  coverNote:   string | null
  scopeText:   string | null
  pdfUrl:      string | null
  acceptedAt:  string | null
  signerName:      string | null
  signedPdfUrl:    string | null
  business: {
    name:    string | null
    address: string | null
    email:   string | null
    logoUrl: string | null
  }
  branding: Branding
  termsText: string | null
  breakdown: ProposalBreakdown
}

const DEFAULT_RC = {
  labour_rate_per_hour:    65,
  material_markup_percent: 15,
  vat_percent:             21,
  business_name:           null as string | null,
  business_address:        null as string | null,
  business_email:          null as string | null,
  terms_text:              null as string | null,
  logo_url:                null as string | null,
  branding:                EMPTY_BRANDING,
}

/**
 * Fetches everything the public share page needs for one proposal, and — on
 * the very first call for a proposal — stamps opened_at. Returns null if the
 * token doesn't match any proposal (page renders a generic "not found",
 * never a Supabase error).
 */
export async function getPublicProposalByToken(token: string): Promise<PublicQuoteView | null> {
  if (!token) return null
  const admin = createAdminClient()

  const { data: proposal } = await admin
    .from('proposals')
    .select('id, created_at, job_id, owner_id, computed_totals, scope_text, cover_note, pdf_url, opened_at, accepted_at, signer_name, signed_pdf_url')
    .eq('share_token', token)
    .maybeSingle()
  if (!proposal) return null

  const { data: job } = await admin
    .from('jobs')
    .select('id, title, line_items, client_id, status')
    .eq('id', proposal.job_id)
    .maybeSingle()
  if (!job) return null

  const clientName = job.client_id
    ? (await admin.from('clients').select('name').eq('id', job.client_id).maybeSingle()).data?.name ?? null
    : null

  const { data: rateCardRow } = await admin
    .from('rate_cards')
    .select('business_name, business_address, business_email, labour_rate_per_hour, material_markup_percent, vat_percent, terms_text, logo_url, branding')
    .eq('owner_id', proposal.owner_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const rateCard = rateCardRow ?? DEFAULT_RC

  const breakdown = calculateProposal(
    (job.line_items ?? []) as Parameters<typeof calculateProposal>[0],
    rateCard,
  )

  // First view only — never overwrite an existing opened_at.
  if (!proposal.opened_at) {
    try {
      await admin
        .from('proposals')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', proposal.id)
        .is('opened_at', null)
    } catch (err) {
      console.error('getPublicProposalByToken: failed to stamp opened_at', err)
    }
  }

  const expiresAt = new Date(proposal.created_at)
  expiresAt.setDate(expiresAt.getDate() + VALIDITY_DAYS)

  const status: PublicQuoteStatus =
    proposal.accepted_at    ? 'accepted' :
    job.status === 'declined' ? 'declined' :
    Date.now() > expiresAt.getTime() ? 'expired' :
    'open'

  return {
    proposalId: proposal.id,
    createdAt:  proposal.created_at,
    expiresAt:  expiresAt.toISOString(),
    status,
    jobTitle:   job.title,
    clientName,
    coverNote:  proposal.cover_note,
    scopeText:  proposal.scope_text,
    pdfUrl:     proposal.pdf_url,
    acceptedAt: proposal.accepted_at,
    signerName:   proposal.signer_name,
    signedPdfUrl: proposal.signed_pdf_url,
    business: {
      name:    rateCard.business_name,
      address: rateCard.business_address,
      email:   rateCard.business_email,
      logoUrl: rateCard.logo_url,
    },
    branding:  rateCard.branding ?? EMPTY_BRANDING,
    termsText: rateCard.terms_text,
    breakdown,
  }
}
