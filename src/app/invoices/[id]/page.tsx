import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { calculateInvoice, formatEuro } from '@/lib/pricing'
import { deriveInvoiceStatus, INVOICE_STATUS_COLORS } from '@/lib/invoicing/types'
import type { Invoice } from '@/lib/invoicing/types'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'
import InvoiceStatusActions from './InvoiceStatusActions'
import InvoicePdfAndEmail from './InvoicePdfAndEmail'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const locale = await getLocale() as Locale
  const t = await getTranslations('invoiceDetail')
  const tStatus = await getTranslations('invoiceStatus')

  const { data: invoiceRow } = await supabase
    .from('invoices')
    .select('*, jobs(id, title)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!invoiceRow) notFound()
  const invoice = invoiceRow as Invoice & { jobs: { id: string; title: string } | null }

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('branding')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const status = deriveInvoiceStatus(invoice)
  const breakdown = calculateInvoice(invoice.line_items, {
    discountType: invoice.discount_type ?? undefined,
    discountValue: invoice.discount_value ?? undefined,
    reverseCharge: invoice.reverse_charge,
  })

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/invoices" className="flex items-center gap-1.5 text-sm text-muted hover:text-on-surface transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t('back')}
          </Link>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${INVOICE_STATUS_COLORS[status]}`}>
            {tStatus(status)}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-56">

        {/* Title & client / from / details */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h1 className="text-lg font-bold text-on-surface">
              {invoice.invoice_number ?? t('notSentYet')}
            </h1>
            <p className="text-xs text-muted shrink-0 mt-1">{formatDate(invoice.invoice_date, locale)}</p>
          </div>

          {invoice.jobs && (
            <Link
              href={`/quotes/${invoice.jobs.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-500 hover:text-teal-700 transition mb-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              {t('convertedFromQuote')}: {invoice.jobs.title}
            </Link>
          )}

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t('client')}</p>
              <p className="font-semibold text-on-surface">{invoice.client_name}</p>
              {invoice.client_email && <p className="text-sm text-muted">{invoice.client_email}</p>}
              {invoice.client_address && <p className="text-sm text-muted">{invoice.client_address}</p>}
              {invoice.client_btw && <p className="text-xs text-muted mt-1">{t('clientVatNumber')}: {invoice.client_btw}</p>}
              {invoice.client_kvk && <p className="text-xs text-muted">{t('clientKvkNumber')}: {invoice.client_kvk}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t('details')}</p>
              <p className="text-sm text-on-surface">{t('dueDate')}: <strong>{formatDate(invoice.due_date, locale)}</strong></p>
            </div>
          </div>
        </div>

        {/* Line items + totals */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('lineItems')}</p>
          {breakdown.items.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">{t('noLineItems')}</p>
          ) : (
            <div className="divide-y divide-border">
              {breakdown.items.map((item, i) => {
                const isText = invoice.line_items[i]?.type === 'text'
                return (
                  <div key={i} className="flex justify-between items-start py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-on-surface">{item.label}</p>
                      {!isText && (
                        <p className="text-xs text-muted mt-0.5">{item.quantity} × {formatEuro(item.unit_cost)} · {item.vat_rate}% BTW</p>
                      )}
                    </div>
                    {!isText && (
                      <p className="text-sm font-semibold text-on-surface shrink-0">{formatEuro(item.line_total)}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm text-muted">
              <span>{t('subtotal')}</span>
              <span>{formatEuro(breakdown.subtotal)}</span>
            </div>
            {breakdown.discount_amount > 0 && (
              <>
                <div className="flex justify-between text-sm text-muted">
                  <span>{t('discount')}</span>
                  <span>&minus; {formatEuro(breakdown.discount_amount)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>{t('taxableSubtotal')}</span>
                  <span>{formatEuro(breakdown.taxable_subtotal)}</span>
                </div>
              </>
            )}
            {invoice.reverse_charge ? (
              <p className="text-xs text-muted italic">{t('reverseChargeNote')}</p>
            ) : (
              breakdown.vat_breakdown.map(row => (
                <div key={row.vat_rate} className="flex justify-between text-sm text-muted">
                  <span>{t('vat', { percent: row.vat_rate })}</span>
                  <span>{formatEuro(row.vat_amount)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between font-bold text-on-surface text-lg pt-2 border-t border-border">
              <span>{t('amountDue')}</span>
              <span className="text-teal-500">{formatEuro(breakdown.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment details */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('paymentDetails')}</p>
          <div className="space-y-1 text-sm text-on-surface">
            <p>{t('iban')}: <strong>{rateCard?.branding?.iban ?? '—'}</strong></p>
            <p>{t('accountHolder')}: <strong>{rateCard?.branding?.accountHolderName ?? '—'}</strong></p>
            <p>{t('paymentReference')}: <strong>{invoice.payment_reference ?? invoice.invoice_number ?? '—'}</strong></p>
          </div>
        </div>

        <InvoicePdfAndEmail
          invoiceId={id}
          initialPdfUrl={invoice.pdf_url}
          locale={locale}
          initialEmailSentTo={invoice.email_sent_to}
          initialSentAt={invoice.sent_at}
        />

      </main>

      <InvoiceStatusActions invoiceId={id} currentStatus={invoice.status} />
    </div>
  )
}
