/**
 * Cash-flow overview: what you're owed, what's overdue, what's already
 * paid — all figures recomputed fresh from calculateInvoice() per invoice
 * (never from the invoices.computed_totals snapshot column), matching the
 * exact pattern already used by the invoices list page's own stats row.
 * Nothing here is a new data source — it's the same invoices + pricing
 * engine + invoice_reminders log already built for Batches 1-3, just
 * summarized in one place.
 *
 * MONTH SWITCHER: the selected month lives in the URL (?month=YYYY-MM),
 * not client-side state — this keeps the page a plain server component
 * (no new client-side data fetching), makes a given month's view
 * shareable/bookmarkable, and matches how every other list page in this
 * app is already built. The ‹ › arrows and "this month" reset are just
 * links to a different ?month= value; there is no JS-driven filtering.
 *
 * Filtering is by invoices.invoice_date (a plain DATE column, no time-of-
 * day or timezone attached), so matching "YYYY-MM" against the first 7
 * characters of that string is exactly correct for every day in the
 * month, including the 1st and the last day — there's no timezone
 * conversion that could shift a date into the wrong month.
 */
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { calculateInvoice, formatEuro } from '@/lib/pricing'
import { deriveInvoiceStatus, INVOICE_STATUS_COLORS } from '@/lib/invoicing/types'
import type { Invoice } from '@/lib/invoicing/types'
import type { ReminderStage } from '@/lib/reminderEmailContent'
import { formatDate, formatMonthYear } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + 'T00:00:00Z').getTime()
  const to = new Date(toIso + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}

type Props = {
  searchParams: Promise<{ month?: string }>
}

export default async function CashflowPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const thisMonth = currentMonthKey()
  const selectedMonth = monthParam && MONTH_KEY_PATTERN.test(monthParam) ? monthParam : thisMonth
  const prevMonth = shiftMonthKey(selectedMonth, -1)
  const nextMonth = shiftMonthKey(selectedMonth, 1)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const locale = await getLocale() as Locale
  const t = await getTranslations('cashflow')
  const tStatus = await getTranslations('invoiceStatus')
  const tReminderStage = await getTranslations('invoiceDetail')

  const [{ data: invoices }, { data: reminders }] = await Promise.all([
    supabase.from('invoices').select('*').eq('owner_id', user!.id).order('invoice_date', { ascending: true }),
    // RLS (invoice_reminders_setup.sql) already scopes this to invoices
    // this owner actually owns — no explicit filter needed here.
    supabase.from('invoice_reminders').select('invoice_id, stage, sent_at'),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const remindersByInvoice = new Map<string, { stage: ReminderStage; sent_at: string }[]>()
  for (const r of reminders ?? []) {
    const list = remindersByInvoice.get(r.invoice_id) ?? []
    list.push(r as { stage: ReminderStage; sent_at: string })
    remindersByInvoice.set(r.invoice_id, list)
  }

  const allRows = ((invoices ?? []) as Invoice[]).map(invoice => {
    const status = deriveInvoiceStatus(invoice)
    const total = calculateInvoice(invoice.line_items, {
      discountType: invoice.discount_type ?? undefined,
      discountValue: invoice.discount_value ?? undefined,
      reverseCharge: invoice.reverse_charge,
    }).total
    const invoiceReminders = (remindersByInvoice.get(invoice.id) ?? []).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    return {
      invoice, status, total,
      daysOverdue: status === 'overdue' ? daysBetween(invoice.due_date, today) : null,
      reminders: invoiceReminders,
    }
  })

  // Quotes are untouched by this switcher (per spec) — this page only
  // ever dealt with invoices in the first place, so there's nothing to
  // exclude; the filter below is purely about WHICH invoices, by month.
  const monthRows = allRows.filter(r => r.invoice.invoice_date.slice(0, 7) === selectedMonth)

  const invoicedTotal = monthRows.reduce((sum, r) => sum + r.total, 0)
  const paidRows = monthRows.filter(r => r.status === 'paid')
  const paidTotal = paidRows.reduce((sum, r) => sum + r.total, 0)
  const outstandingRows = monthRows.filter(r => r.status === 'sent' || r.status === 'overdue')
  const outstandingTotal = outstandingRows.reduce((sum, r) => sum + r.total, 0)
  const overdueRows = monthRows.filter(r => r.status === 'overdue')
  const overdueTotal = overdueRows.reduce((sum, r) => sum + r.total, 0)

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <div className="mb-6 mt-12 md:mt-0">
        <h1 className="text-lg font-semibold text-on-surface">{t('title')}</h1>
      </div>

      {/* Month switcher */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-border p-2 mb-4">
        <Link
          href={`/cashflow?month=${prevMonth}`}
          aria-label={t('previousMonth')}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface active:scale-95 transition shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </Link>

        <div className="flex flex-col items-center">
          <span className="text-sm font-bold" style={{ color: '#0F766E' }}>
            {formatMonthYear(selectedMonth, locale)}
          </span>
          {selectedMonth !== thisMonth && (
            <Link href="/cashflow" className="text-xs font-medium text-teal-500 hover:text-teal-700 transition">
              {t('backToThisMonth')}
            </Link>
          )}
        </div>

        <Link
          href={`/cashflow?month=${nextMonth}`}
          aria-label={t('nextMonth')}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-on-surface hover:bg-surface active:scale-95 transition shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </Link>
      </div>

      {/* Headline */}
      <div className="bg-teal-500 rounded-2xl p-5 mb-4 text-white">
        <p className="text-xs font-medium uppercase tracking-wide opacity-90 mb-1">{t('headlineLabel')}</p>
        <p className="text-2xl font-bold">{t('headline', { amount: formatEuro(outstandingTotal), count: outstandingRows.length })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('invoiced')}</p>
          <p className="text-lg font-bold text-on-surface">{formatEuro(invoicedTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('paid')}</p>
          <p className="text-lg font-bold text-on-surface">{formatEuro(paidTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('outstanding')}</p>
          <p className="text-lg font-bold text-teal-500">{formatEuro(outstandingTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('overdue')}</p>
          <p className={`text-lg font-bold ${overdueRows.length > 0 ? 'text-red-600' : 'text-on-surface'}`}>{formatEuro(overdueTotal)}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
        {t('monthInvoicesTitle', { month: formatMonthYear(selectedMonth, locale) })}
      </p>

      {monthRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <p className="font-semibold text-on-surface mb-1">{t('noInvoicesThisMonthTitle')}</p>
          <p className="text-sm text-muted">{t('noInvoicesThisMonthBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {monthRows.map(({ invoice, status, total, daysOverdue, reminders: invoiceReminders }) => {
            const lastReminder = invoiceReminders[invoiceReminders.length - 1]
            const showReminders = status === 'sent' || status === 'overdue'
            return (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-teal-500 transition active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${INVOICE_STATUS_COLORS[status]}`}>
                          {tStatus(status)}
                        </span>
                        {status === 'overdue' && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            {t('daysOverdue', { days: daysOverdue ?? 0 })}
                          </span>
                        )}
                        <span className="text-xs text-muted">{invoice.invoice_number ?? t('notSentYet')}</span>
                      </div>
                      <p className="font-semibold text-on-surface truncate">{invoice.client_name}</p>
                      <p className="text-sm text-muted truncate mt-0.5">
                        {formatEuro(total)} · {t('dueOn', { date: formatDate(invoice.due_date, locale, 'short') })}
                      </p>
                      {showReminders && (
                        <p className="text-xs text-muted mt-1">
                          {invoiceReminders.length === 0
                            ? t('noRemindersSent')
                            : t('remindersSentSummary', {
                                count: invoiceReminders.length,
                                stage: tReminderStage(`reminderStage_${lastReminder.stage}`),
                                date: formatDate(lastReminder.sent_at, locale, 'short'),
                              })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
