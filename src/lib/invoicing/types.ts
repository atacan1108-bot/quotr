/**
 * Invoice types — the invoice-side counterpart to src/lib/types.ts's Job/
 * Proposal. See src/lib/pricing.ts for InvoiceLineItem/InvoiceBreakdown
 * (the money-shape types); this file has the DB-row shape and status logic.
 */
import type { InvoiceBreakdown, InvoiceLineItem } from '@/lib/pricing'
import type { Job } from '@/lib/types'

export type { InvoiceLineItem, InvoiceItemType, InvoiceBreakdown, InvoiceVatBreakdownRow } from '@/lib/pricing'

export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export interface Invoice {
  id:         string
  created_at: string
  updated_at: string
  owner_id:   string
  client_id:  string | null
  /** Source quote, if this invoice was created via "Convert to invoice". Null for from-scratch invoices. */
  job_id:     string | null

  title:    string | null
  language: 'nl' | 'en'

  // Numbering — null until the invoice is sent (drafts don't burn a number).
  // See assign_invoice_number() in supabase-invoicing-setup.sql.
  invoice_number:  string | null
  invoice_year:    number | null
  sequence_number: number | null

  // Client identity, snapshotted at creation time — unlike proposals (which
  // read the client record live), an invoice must not silently change if the
  // client record is later edited or deleted.
  client_name:    string
  client_address: string | null
  client_email:   string | null
  client_btw:     string | null
  client_kvk:     string | null

  line_items:      InvoiceLineItem[]
  discount_type:   'amount' | 'percent' | null
  discount_value:  number | null
  reverse_charge:  boolean
  computed_totals: InvoiceBreakdown

  invoice_date:       string
  due_date:            string
  payment_terms_days:  number
  payment_reference:   string | null
  note_text:           string | null

  status:  InvoiceStatus
  sent_at: string | null
  paid_at: string | null

  pdf_url: string | null
  // Recipient of the most recent "Send email" — see src/lib/sendDocumentEmail.ts.
  // sent_at/status already exist and get set the moment the invoice number
  // is assigned (see assign_invoice_number()), so only the address is new here.
  email_sent_to: string | null

  // Mollie iDEAL payment — see src/lib/mollie/. A fresh payment (and thus a
  // fresh checkout URL) is created on every send/resend, since iDEAL
  // checkout sessions expire; these columns always reflect the MOST
  // RECENT payment attempt, not a history of all attempts. Status here is
  // Mollie's own vocabulary (open/paid/failed/expired/canceled) — kept
  // deliberately separate from `status` above, which only the payment
  // webhook is allowed to flip to 'paid'.
  mollie_payment_id:         string | null
  mollie_checkout_url:       string | null
  mollie_payment_status:     string | null
  mollie_payment_created_at: string | null
}

export type InvoiceWithJob = Invoice & {
  jobs: Pick<Job, 'id' | 'title'> | null
}

// ── Derived status ──────────────────────────────────────────────
// Mirrors deriveQuoteStatus in src/lib/types.ts: 'overdue' is never stored,
// it's computed from due_date + status so it can't drift out of sync.

export type DerivedInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export function deriveInvoiceStatus(
  invoice: Pick<Invoice, 'status' | 'due_date'>,
): DerivedInvoiceStatus {
  if (invoice.status === 'paid') return 'paid'
  if (invoice.status === 'sent' && invoice.due_date < todayIso()) return 'overdue'
  return invoice.status
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export const INVOICE_STATUS_LABELS: Record<DerivedInvoiceStatus, string> = {
  draft:   'Draft',
  sent:    'Sent',
  paid:    'Paid',
  overdue: 'Overdue',
}

export const INVOICE_STATUS_COLORS: Record<DerivedInvoiceStatus, string> = {
  draft:   'bg-border text-muted',
  sent:    'bg-amber-100 text-amber-700',
  paid:    'bg-teal-100 text-teal-700',
  overdue: 'bg-red-100 text-red-700',
}
