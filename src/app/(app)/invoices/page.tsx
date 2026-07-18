import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { calculateInvoice, formatEuro } from '@/lib/pricing'
import { deriveInvoiceStatus, INVOICE_STATUS_COLORS } from '@/lib/invoicing/types'
import type { Invoice } from '@/lib/invoicing/types'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const locale = await getLocale() as Locale
  const t = await getTranslations('invoicesList')
  const tStatus = await getTranslations('invoiceStatus')

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('owner_id', user!.id)
    .order('created_at', { ascending: false })

  const rows = (invoices ?? []) as Invoice[]
  const withStatus = rows.map(invoice => ({
    invoice,
    status: deriveInvoiceStatus(invoice),
    total: calculateInvoice(invoice.line_items, {
      discountType: invoice.discount_type ?? undefined,
      discountValue: invoice.discount_value ?? undefined,
      reverseCharge: invoice.reverse_charge,
    }).total,
  }))

  const outstanding = withStatus
    .filter(r => r.status === 'sent' || r.status === 'overdue')
    .reduce((sum, r) => sum + r.total, 0)
  const overdueCount = withStatus.filter(r => r.status === 'overdue').length

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6">
      {/* Header — title + primary "New Invoice" action, matching the Quotes
          page pattern exactly (desktop sidebar and mobile bottom nav don't
          carry a New Invoice item; this button, plus the mobile-only FAB
          below, are the only entry points). No extra top margin needed —
          both the desktop header and the mobile one ((app)/layout.tsx) now
          reserve that space themselves. */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-on-surface font-display">{t('title')}</h1>
        <Link
          href="/invoices/new"
          className="h-11 px-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('newInvoice')}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('outstanding')}</p>
          <p className="text-2xl font-bold text-teal-500">{formatEuro(outstanding)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('overdueLabel')}</p>
          <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-on-surface'}`}>{overdueCount}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('allInvoices')}</p>

      {withStatus.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25h6m-6 3h6m-9.75.75V4.5a2.25 2.25 0 0 1 2.25-2.25h5.379a1.5 1.5 0 0 1 1.06.44l3.622 3.622a1.5 1.5 0 0 1 .44 1.06V18a2.25 2.25 0 0 1-2.25 2.25H8.25a2.25 2.25 0 0 1-2.25-2.25Zm4.5-10.5h3.75" />
            </svg>
          </div>
          <p className="font-semibold text-on-surface mb-1">{t('noInvoicesTitle')}</p>
          <p className="text-sm text-muted mb-5">{t('noInvoicesBody')}</p>
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 transition"
          >
            {t('createFirstInvoice')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-6">
          {withStatus.map(({ invoice, status, total }) => (
            <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
              <div className="bg-white rounded-2xl border border-border p-4 hover:border-teal-500 transition active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[status]}`}>
                        {tStatus(status)}
                      </span>
                      <span className="text-xs text-muted">
                        {invoice.invoice_number ?? t('notSentYet')}
                      </span>
                    </div>
                    <p className="font-semibold text-on-surface truncate">{invoice.client_name}</p>
                    <p className="text-sm text-muted truncate mt-0.5">{formatEuro(total)}</p>
                  </div>
                  <p className="text-xs text-muted shrink-0 mt-1">{t('dueDate', { date: formatDate(invoice.due_date, locale, 'short') })}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Mobile-only floating action button — pinned above the bottom nav
          bar (which is 64px tall) so New Invoice stays a one-thumb reach. */}
      <Link
        href="/invoices/new"
        aria-label={t('newInvoice')}
        className="md:hidden fixed z-30 flex items-center justify-center w-14 h-14 rounded-full bg-teal-500 text-white shadow-lg active:bg-teal-700 active:scale-95 transition"
        style={{ right: '16px', bottom: 'calc(64px + env(safe-area-inset-bottom) + 16px)' }}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </Link>
    </div>
  )
}
