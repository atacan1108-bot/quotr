// ================================================================
// Quotr — TypeScript types mirroring the Supabase schema
// ================================================================

// ── JSON shapes (stored inside JSONB columns) ─────────────────

/**
 * One line in a job.
 * - labour:   hours × rate_card.labour_rate_per_hour
 * - material: quantity × unit_cost × (1 + markup%)
 * - fixed:    unit_cost only (quantity ignored in pricing)
 *
 * Recurring quotes use the exact same shape — rate_type ('day_rate' |
 * 'hourly' | 'fixed') replaces labour/material/fixed for a service
 * contract's line items. type is still stored as 'fixed' on those lines for
 * schema consistency, but pricing and display are driven by rate_type
 * whenever it's set. See src/lib/pricing.ts for the full explanation and
 * the money math.
 */
export interface LineItem {
  label:     string
  type:      'labour' | 'material' | 'fixed'
  quantity:  number   // hours for labour, units for material, 1 for fixed
  unit_cost: number   // cost per unit before markup (materials) or 0 for labour
  hours?:    number   // display alias for quantity when type === 'labour'
  rate_type?: 'day_rate' | 'hourly' | 'fixed'   // recurring quotes only
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

  // Whether recurring quotes DISPLAY their period totals excluding VAT
  // (common for B2B contracts). One-off pricing is unaffected by this.
  prices_shown_excluding_vat: boolean

  // The contractor's own app language (the "NL | EN" corner switch).
  // Independent of any single quote's language — see Job.language below.
  language: 'nl' | 'en'

  // Contractor notification preferences — whether to email them when a
  // customer accepts/declines a quote on the public share page, and where.
  // notification_email null means "use business_email" (resolved at send
  // time in src/lib/notifyContractor.ts, not persisted as a copy here).
  notify_on_accept:   boolean
  notify_on_decline:  boolean
  notification_email: string | null
}

export type JobStatus = 'draft' | 'quoted' | 'sent' | 'accepted' | 'declined'

export type QuoteType = 'one_off' | 'recurring'

/**
 * Per-quote contract facts for a 'recurring' job — the ONLY thing that
 * differs between a one-off and a recurring quote. line_items (below) are
 * priced by the exact same engine either way; days_per_week/weeks_per_year/
 * contract_term_months then scale that one-off price up into week/month/
 * year/contract-term figures. notice_period_months/auto_renewal are
 * descriptive (shown on the PDF and given to the AI wording feature).
 */
export interface RecurringConfig {
  days_per_week:         number
  weeks_per_year:        number
  contract_term_months:  number
  notice_period_months:  number | null
  auto_renewal:          boolean
}

export interface Job {
  id:          string
  created_at:  string
  updated_at:  string
  owner_id:    string
  client_id:   string | null
  title:       string
  description: string | null
  status:      JobStatus
  // The ONE line-item list, used identically by both quote types.
  line_items:  LineItem[]
  quote_type:        QuoteType
  recurring_config:  RecurringConfig | null
  // This QUOTE's own language — defaults to the contractor's app language
  // at creation time, changeable per quote afterward. Drives the PDF, the
  // public share page, and the AI wording for THIS quote, independent of
  // the contractor's own current app language (RateCard.language).
  language: 'nl' | 'en'
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
  // Customer-declined-on-the-public-page tracking — mirrors the accept
  // columns above. declined_at is null unless the CUSTOMER declined via
  // /quote/[token]; a contractor manually marking a job "declined" from
  // their own dashboard (JobStatusActions) does not set this.
  declined_at:         string | null
  decline_reason:      string | null
  decline_ip:          string | null
  decline_user_agent:  string | null
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
  prices_shown_excluding_vat: false,
  language: 'nl',
  notify_on_accept:   true,
  notify_on_decline:  true,
  notification_email: null,
}

export const DEFAULT_RECURRING_CONFIG: RecurringConfig = {
  days_per_week:        5,
  weeks_per_year:        52,
  contract_term_months:  12,
  notice_period_months:  null,
  auto_renewal:           false,
}
