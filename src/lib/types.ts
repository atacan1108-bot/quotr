// ================================================================
// Quotr — TypeScript types mirroring the Supabase schema
// ================================================================

// ── JSON shapes (stored inside JSONB columns) ─────────────────

/**
 * One line in a job.
 * - labour:   hours × rate_card.labour_rate_per_hour
 * - material: quantity × unit_cost × (1 + markup%)
 * - fixed:    unit_cost only (quantity ignored in pricing)
 */
export interface LineItem {
  label:     string
  type:      'labour' | 'material' | 'fixed'
  quantity:  number   // hours for labour, units for material, 1 for fixed
  unit_cost: number   // cost per unit before markup (materials) or 0 for labour
  hours?:    number   // display alias for quantity when type === 'labour'
}

/** Money breakdown stored on every proposal so PDFs stay reproducible. */
export interface ComputedTotals {
  subtotal:        number
  vat_amount:      number
  total:           number
  labour_total:    number
  material_total:  number
  fixed_total:     number
}

// ── Table rows ────────────────────────────────────────────────

export interface Client {
  id:         string
  created_at: string
  owner_id:   string
  name:       string
  email:      string | null
  phone:      string | null
  address:    string | null
  notes:      string | null
}

/**
 * Newer brand fields, stored as one JSON column rather than individual
 * ALTER TABLEs — everything here is optional, since most of it only gets
 * filled in once a contractor imports or edits their branding.
 */
export interface Branding {
  primaryColor:     string | null  // hex, used for headings/accent bar/total block
  accentColor:      string | null  // hex, secondary highlight
  fontFamily:       string | null  // web-page display only — PDFs stay on Helvetica for now
  phone:            string | null
  website:          string | null
  kvk:              string | null
  btw:              string | null
  iban:             string | null
  footerText:       string | null  // short tagline, e.g. "Business Name · City" — distinct from terms_text
  quoteNumberPrefix: string | null // e.g. "2026-" — stored for future use, not yet applied to numbering
}

export const EMPTY_BRANDING: Branding = {
  primaryColor: null, accentColor: null, fontFamily: null,
  phone: null, website: null, kvk: null, btw: null, iban: null,
  footerText: null, quoteNumberPrefix: null,
}

export interface RateCard {
  id:         string
  created_at: string
  owner_id:   string

  labour_rate_per_hour:    number
  material_markup_percent: number
  vat_percent:             number
  currency:                string

  terms_text:       string | null
  business_name:    string | null
  business_address: string | null
  business_email:   string | null
  logo_url:         string | null
  branding:         Branding | null
  template_html:    string | null
}

export type JobStatus = 'draft' | 'quoted' | 'sent' | 'accepted' | 'declined'

export interface Job {
  id:          string
  created_at:  string
  updated_at:  string
  owner_id:    string
  client_id:   string | null
  title:       string
  description: string | null
  status:      JobStatus
  line_items:  LineItem[]
}

export interface Proposal {
  id:              string
  created_at:      string
  owner_id:        string
  job_id:          string
  computed_totals: ComputedTotals
  scope_text:      string | null
  cover_note:      string | null
  pdf_url:         string | null
  share_token:     string | null
  opened_at:       string | null
  accepted_at:     string | null
  signer_name:         string | null
  signature_data_url:  string | null
  accept_ip:           string | null
  accept_user_agent:   string | null
  signed_pdf_url:      string | null
}

// ── Joined/enriched types (with related rows attached) ───────

export type JobWithClient = Job & {
  clients: Pick<Client, 'id' | 'name' | 'email' | 'phone'> | null
}

export type ProposalWithJob = Proposal & {
  jobs: JobWithClient
}

// ── UI constants ──────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft:    'Draft',
  quoted:   'Quoted',
  sent:     'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
}

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  draft:    'bg-border text-muted',
  quoted:   'bg-blue-100 text-blue-700',
  sent:     'bg-amber-100 text-amber-700',
  accepted: 'bg-teal-100 text-teal-700',
  declined: 'bg-red-100 text-red-700',
}

// ── Derived quote status ────────────────────────────────────────
// job.status only tracks what the contractor manually set (draft/sent/
// accepted/declined). Once a share link exists, "Opened" and "Accepted"
// should reflect what the customer actually did — read from the proposal's
// opened_at/accepted_at tracking columns — rather than requiring the
// contractor to update it by hand.

export type DerivedQuoteStatus = 'draft' | 'sent' | 'opened' | 'accepted' | 'declined'

export function deriveQuoteStatus(
  jobStatus: JobStatus,
  proposal:  Pick<Proposal, 'opened_at' | 'accepted_at'> | null,
): DerivedQuoteStatus {
  if (jobStatus === 'accepted' || proposal?.accepted_at) return 'accepted'
  if (jobStatus === 'declined') return 'declined'
  if (proposal?.opened_at) return 'opened'
  if (jobStatus === 'sent') return 'sent'
  return 'draft'
}

export const QUOTE_STATUS_LABELS: Record<DerivedQuoteStatus, string> = {
  draft:    'Draft',
  sent:     'Sent',
  opened:   'Opened',
  accepted: 'Accepted',
  declined: 'Declined',
}

export const QUOTE_STATUS_COLORS: Record<DerivedQuoteStatus, string> = {
  draft:    'bg-border text-muted',
  sent:     'bg-amber-100 text-amber-700',
  opened:   'bg-blue-100 text-blue-700',
  accepted: 'bg-teal-100 text-teal-700',
  declined: 'bg-red-100 text-red-700',
}

export const LINE_ITEM_TYPES = ['labour', 'material', 'fixed'] as const

export const DEFAULT_RATE_CARD: Omit<RateCard, 'id' | 'created_at' | 'owner_id'> = {
  labour_rate_per_hour:    65,
  material_markup_percent: 15,
  vat_percent:             21,
  currency:                'EUR',
  terms_text:              null,
  business_name:           null,
  business_address:        null,
  business_email:          null,
  logo_url:                null,
  branding:                EMPTY_BRANDING,
  template_html:           null,
}
