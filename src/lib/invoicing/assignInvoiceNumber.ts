import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Assigns a real, sequential, gap-free invoice number ("PREFIX-YYYY-NNNN",
 * resetting to 0001 each calendar year) and flips the invoice to 'sent'.
 * Thin wrapper around the assign_invoice_number() Postgres function (see
 * supabase-invoicing-setup.sql) — all the actual locking/incrementing logic
 * lives there so it's atomic under concurrent calls, not in this file.
 */
export async function assignInvoiceNumber(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('assign_invoice_number', { p_invoice_id: invoiceId })
  if (error) throw new Error(`Failed to assign invoice number: ${error.message}`)
  return data as string
}
