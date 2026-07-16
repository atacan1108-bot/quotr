/**
 * Creates a fresh Mollie iDEAL payment for an invoice and saves the
 * resulting checkout URL/payment id onto the invoice row. Called on every
 * send/resend (see /api/invoice/[id]/send-email) and by the reminder cron
 * (src/app/api/cron/invoice-reminders) — NOT cached/reused across calls,
 * because iDEAL checkout sessions expire quickly; a reminder sent days
 * after the original send needs its own fresh link, not a dead one.
 *
 * Takes already-fetched invoice data and a Supabase client as PARAMETERS
 * rather than fetching them itself, deliberately — this function is used
 * from two very different contexts: an authenticated request (send-email,
 * with a real logged-in session) and the reminder cron (no user session
 * at all, verified only by CRON_SECRET, using the admin/service-role
 * client instead — see src/lib/supabase/admin.ts). Each caller fetches
 * its invoice data the way that's correct for ITS context; this function
 * doesn't need to know or care which.
 *
 * Amount comes ONLY from the pricing engine's own breakdown.total
 * (src/lib/pricing.ts) — never recomputed or touched by AI. Quotr never
 * sees card/bank details: Mollie hosts the entire checkout; this only
 * creates the payment and stores the URL it returns.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceExportData } from '@/lib/invoiceData'
import { getMollieClient, MollieConfigError } from './client'
import { MollieApiError, PaymentMethod, Locale as MollieLocale } from '@mollie/api-client'

export class CreateInvoicePaymentError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'CreateInvoicePaymentError'
    this.status = status
  }
}

export interface CreateInvoicePaymentResult {
  checkoutUrl: string
  paymentId: string
}

/**
 * @param supabase Either the normal session-bound server client (send-email
 *   route) or the admin client (cron) — whichever the caller already has.
 * @param data Already-fetched invoice + rate card + pricing breakdown.
 * @param baseUrl e.g. "https://quotr-eight.vercel.app" or
 *   "http://localhost:3000" — used to build redirectUrl (always set) and
 *   webhookUrl (omitted for localhost, since Mollie can never reach it —
 *   see docs.mollie.com/docs/webhooks: "must be reachable from Mollie's
 *   point of view, so you cannot use localhost").
 */
export async function createInvoicePayment(
  supabase: SupabaseClient,
  data: InvoiceExportData,
  baseUrl: string,
): Promise<CreateInvoicePaymentResult> {
  const { invoice, rateCard, breakdown } = data
  const invoiceId = invoice.id

  if (invoice.status === 'paid') {
    throw new CreateInvoicePaymentError('This invoice is already marked as paid — no new payment link is needed.', 400)
  }
  if (breakdown.total <= 0) {
    throw new CreateInvoicePaymentError('The invoice total must be greater than €0 to create a payment link.', 400)
  }

  let mollie
  try {
    mollie = getMollieClient()
  } catch (err) {
    if (err instanceof MollieConfigError) throw new CreateInvoicePaymentError(err.message, 503)
    throw err
  }

  const isLocal = /^https?:\/\/localhost(:\d+)?$/.test(baseUrl)
  const description = `${invoice.invoice_number ?? invoice.id} — ${rateCard.business_name || 'Quotr'}`.slice(0, 255)

  let payment
  try {
    payment = await mollie.payments.create({
      amount: { value: breakdown.total.toFixed(2), currency: 'EUR' },
      description,
      redirectUrl: `${baseUrl}/pay/complete?invoice=${encodeURIComponent(invoice.invoice_number ?? invoice.id)}`,
      // Omitted entirely on localhost — Mollie cannot reach a local
      // machine, and this keeps local testing of Batch 1 from failing on
      // an unreachable-URL rejection. Lives under /api/public/ (not
      // /api/mollie/) to reuse the existing no-login-required route
      // convention already set up in src/proxy.ts for the quote share
      // page's own public API routes — Mollie has no Quotr session either.
      ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/public/mollie/webhook` }),
      method: PaymentMethod.ideal,
      locale: invoice.language === 'nl' ? MollieLocale.nl_NL : MollieLocale.en_US,
      metadata: { invoiceId },
    })
  } catch (err) {
    console.error('createInvoicePayment: Mollie rejected the payment request', { invoiceId, error: err })
    throw new CreateInvoicePaymentError(describeMollieError(err), 502)
  }

  const checkoutUrl = payment.getCheckoutUrl()
  if (!checkoutUrl) {
    throw new CreateInvoicePaymentError('Mollie created the payment but did not return a checkout link.', 502)
  }

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      mollie_payment_id: payment.id,
      mollie_checkout_url: checkoutUrl,
      mollie_payment_status: payment.status,
      mollie_payment_created_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)

  if (updateError) {
    console.error('createInvoicePayment: failed to save payment onto invoice', { invoiceId, error: updateError })
    throw new CreateInvoicePaymentError('The payment was created with Mollie, but saving it to the invoice failed.', 502)
  }

  return { checkoutUrl, paymentId: payment.id }
}

function describeMollieError(err: unknown): string {
  if (err instanceof MollieApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return 'Mollie rejected the MOLLIE_API_KEY — it may be invalid or revoked. Get a fresh key from your Mollie dashboard.'
    }
    if (err.statusCode === 422) {
      return `Mollie rejected the payment details: ${err.message}`
    }
    return `Mollie error (${err.statusCode ?? 'unknown status'}): ${err.message}`
  }
  const message = err instanceof Error ? err.message : String(err)
  return `Could not create the Mollie payment: ${message}`
}
