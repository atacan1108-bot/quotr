/**
 * Mollie calls this URL whenever a payment's status changes. This is the
 * ONLY place invoices.status is allowed to become 'paid' automatically —
 * everywhere else (the manual "Mark as paid" button) is a human decision.
 *
 * SECURITY MODEL (matches Mollie's own documented pattern exactly —
 * docs.mollie.com/docs/webhooks): the request body carries only a payment
 * id, no status. We NEVER trust anything else in the request — we re-fetch
 * the payment from Mollie's own API using our own secret key, and act on
 * THAT response. This means a forged/fake call to this URL can, at worst,
 * cause us to re-fetch a real payment's real status — it can never mark
 * anything paid that Mollie itself doesn't confirm is paid.
 *
 * IDEMPOTENT: Mollie may call this more than once for the same status
 * change (their own docs describe retrying up to 10 times over 26 hours
 * if we don't respond 200 fast enough). Looked up by the invoiceId
 * embedded in the payment's own metadata (set at creation, see
 * createInvoicePayment.ts) rather than by matching invoices.mollie_
 * payment_id — a contractor can trigger a fresh payment (new send, or a
 * future reminder) before an OLDER payment's webhook arrives, and that
 * older payment might still be the one the client actually completes.
 * Metadata survives that; a mollie_payment_id column match would not.
 *
 * NO LOGIN — Mollie has no Quotr session. Runs with the admin (service
 * role) client, same justified exception as the public quote-accept route
 * (see src/lib/supabase/admin.ts) — every query here is scoped to one
 * exact invoice id taken from Mollie's own metadata, never a general query.
 */
import { NextResponse } from 'next/server'
import { getMollieClient, MollieConfigError } from '@/lib/mollie/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Mollie's own PaymentStatus values that mean "this attempt did not
// succeed and won't on its own" — recorded on the invoice for visibility,
// but invoices.status is deliberately left alone (still 'sent'), so the
// contractor can resend/retry rather than the invoice getting stuck.
const TERMINAL_UNSUCCESSFUL = new Set(['failed', 'expired', 'canceled'])

export async function POST(req: Request) {
  let paymentId: string | null = null
  try {
    const formData = await req.formData()
    const idValue = formData.get('id')
    paymentId = typeof idValue === 'string' ? idValue : null
  } catch (err) {
    console.error('mollie webhook: could not parse request body', { error: err })
    // Mollie will retry a non-200 — but a malformed body will never parse
    // differently on retry, so there is nothing to gain from retries here.
    // Still return 200 to stop the retry storm; this is logged for us to
    // investigate, not something the client caused.
    return NextResponse.json({ ok: true, ignored: 'unparseable body' })
  }

  if (!paymentId) {
    console.error('mollie webhook: request had no payment id')
    return NextResponse.json({ ok: true, ignored: 'no id' })
  }

  let mollie
  try {
    mollie = getMollieClient()
  } catch (err) {
    // Mollie is calling us, so a payment clearly WAS created at some
    // point — MOLLIE_API_KEY going missing/invalid between then and now
    // is a real configuration problem worth loud logging, but responding
    // 200 anyway: retrying against a still-missing key will never help,
    // and we don't want Mollie hammering this URL for 26 hours over it.
    console.error('mollie webhook: Mollie not configured', { paymentId, error: err instanceof MollieConfigError ? err.message : err })
    return NextResponse.json({ ok: true, ignored: 'Mollie not configured' })
  }

  let payment
  try {
    payment = await mollie.payments.get(paymentId)
  } catch (err) {
    console.error('mollie webhook: could not re-fetch payment from Mollie', { paymentId, error: err })
    // A real transient failure (network blip, Mollie API hiccup) — THIS
    // case we do want retried, so respond with an error status.
    return NextResponse.json({ error: 'could not verify payment with Mollie' }, { status: 502 })
  }

  const metadata = payment.metadata
  const invoiceId = metadata && typeof metadata === 'object' && 'invoiceId' in metadata
    ? (metadata as { invoiceId: unknown }).invoiceId
    : null
  if (typeof invoiceId !== 'string' || !invoiceId) {
    console.error('mollie webhook: payment has no invoiceId in its metadata', { paymentId, status: payment.status })
    return NextResponse.json({ ok: true, ignored: 'no invoiceId in metadata' })
  }

  const supabase = createAdminClient()
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, status, paid_at')
    .eq('id', invoiceId)
    .maybeSingle()

  if (fetchError || !invoice) {
    console.error('mollie webhook: invoice not found', { paymentId, invoiceId, error: fetchError })
    return NextResponse.json({ ok: true, ignored: 'invoice not found' })
  }

  const logCtx = { paymentId, invoiceId, mollieStatus: payment.status, currentInvoiceStatus: invoice.status }

  if (payment.status === 'paid') {
    if (invoice.status === 'paid') {
      // Already recorded — a duplicate webhook call for the same paid
      // payment. Idempotent: no-op, not an error.
      console.log('mollie webhook: invoice already marked paid, ignoring duplicate', logCtx)
      return NextResponse.json({ ok: true })
    }
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: payment.paidAt ?? new Date().toISOString(),
        mollie_payment_status: payment.status,
      })
      .eq('id', invoiceId)
    if (updateError) {
      console.error('mollie webhook: failed to mark invoice paid', { ...logCtx, error: updateError })
      return NextResponse.json({ error: 'failed to update invoice' }, { status: 502 })
    }
    console.log('mollie webhook: invoice marked paid', logCtx)
    return NextResponse.json({ ok: true })
  }

  if (TERMINAL_UNSUCCESSFUL.has(payment.status)) {
    // Record the outcome for visibility (e.g. the dashboard can show "last
    // payment attempt failed") — invoices.status is NOT touched, so the
    // invoice stays 'sent' and the contractor can simply resend for a
    // fresh payment link.
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ mollie_payment_status: payment.status })
      .eq('id', invoiceId)
    if (updateError) {
      console.error('mollie webhook: failed to record unsuccessful payment status', { ...logCtx, error: updateError })
      return NextResponse.json({ error: 'failed to update invoice' }, { status: 502 })
    }
    console.log('mollie webhook: recorded unsuccessful payment status', logCtx)
    return NextResponse.json({ ok: true })
  }

  // Any other status (open, pending, authorized) — an in-progress payment,
  // not yet a final outcome. Record it for visibility, nothing else to do.
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ mollie_payment_status: payment.status })
    .eq('id', invoiceId)
  if (updateError) {
    console.error('mollie webhook: failed to record in-progress payment status', { ...logCtx, error: updateError })
  }
  return NextResponse.json({ ok: true })
}
