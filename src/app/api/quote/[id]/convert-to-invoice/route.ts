/**
 * "Convert to invoice" — the hero feature. Contractor-initiated (requires
 * the contractor's own session + normal RLS, NOT the admin-client/
 * public-token pattern the public accept/decline routes use, since this
 * has nothing to do with the customer-facing share link).
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { buildInvoiceDraftFromQuote } from '@/lib/invoicing/convertQuoteToInvoice'
import { EMPTY_BRANDING } from '@/lib/types'
import type { Job, Client } from '@/lib/types'

const DEFAULT_RC = {
  labour_rate_per_hour:    65,
  material_markup_percent: 15,
  vat_percent:             21,
  branding:                EMPTY_BRANDING,
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tErrors = await getTranslations('errors')
  const tApi = await getTranslations('convertToInvoiceApi')
  if (!user) {
    return NextResponse.json({ error: tErrors('notLoggedIn') }, { status: 401 })
  }

  const [{ data: job }, { data: rateCard }] = await Promise.all([
    supabase.from('jobs').select('*, clients(*)').eq('id', id).eq('owner_id', user.id).single(),
    supabase
      .from('rate_cards')
      .select('labour_rate_per_hour, material_markup_percent, vat_percent, branding')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!job) {
    return NextResponse.json({ error: tApi('quoteNotFound') }, { status: 404 })
  }
  if ((job as Job).status !== 'accepted') {
    return NextResponse.json({ error: tApi('notAccepted') }, { status: 400 })
  }

  const draft = buildInvoiceDraftFromQuote(
    job as Job & { clients: Client | null },
    rateCard ?? DEFAULT_RC,
  )

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert(draft)
    .select('id')
    .single()

  if (error) {
    console.error('convert-to-invoice: insert failed', { jobId: id, error })
    return NextResponse.json({ error: tApi('createFailed', { message: error.message }) }, { status: 500 })
  }

  return NextResponse.json({ invoiceId: invoice.id })
}
