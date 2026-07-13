import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import type { JobWithClient, Proposal } from '@/lib/types'
import { deriveQuoteStatus, QUOTE_STATUS_COLORS } from '@/lib/types'
import { formatEuro } from '@/lib/pricing'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const locale = await getLocale() as Locale
  const t = await getTranslations('quotesList')
  const tStatus = await getTranslations('quoteStatus')

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, clients(id, name, email, phone)')
    .eq('owner_id', user!.id)
    .order('created_at', { ascending: false })

  // Latest proposal per job — drives both the revenue total and the
  // Draft/Sent/Opened/Accepted status + tracking timestamps below.
  const { data: allProposals } = (jobs?.length ?? 0) > 0
    ? await supabase
        .from('proposals')
        .select('job_id, computed_totals, opened_at, accepted_at, declined_at')
        .in('job_id', (jobs ?? []).map(j => j.id))
        .order('created_at', { ascending: false })
    : { data: [] }

  const latestProposalByJob = new Map<string, Pick<Proposal, 'computed_totals' | 'opened_at' | 'accepted_at' | 'declined_at'>>()
  for (const p of allProposals ?? []) {
    if (!latestProposalByJob.has(p.job_id)) latestProposalByJob.set(p.job_id, p)
  }

  const accepted = (jobs ?? []).filter(j => j.status === 'accepted')
  const revenue = accepted.reduce((sum, j) => {
    const total = (latestProposalByJob.get(j.id)?.computed_totals as { total?: number } | undefined)?.total ?? 0
    return sum + total
  }, 0)

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6">
      {/* Header — title + primary "New Quote" action (desktop sidebar and
          mobile bottom nav no longer carry a New Quote item; this button,
          plus the mobile-only FAB below, are the only entry points now).
          On mobile there's no dedicated top bar (unlike desktop's own
          header, which already reserves space for it), so this row needs
          its own top margin to clear the fixed language-switcher pill
          pinned to the top-right of the viewport. */}
      <div className="flex items-center justify-between mb-6 mt-12 md:mt-0">
        <h1 className="text-lg font-semibold text-on-surface">{t('title')}</h1>
        <Link
          href="/quotes/new"
          className="h-11 px-4 inline-flex items-center gap-1.5 rounded-xl bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('newQuote')}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('totalJobs')}</p>
          <p className="text-2xl font-bold text-on-surface">{jobs?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">{t('acceptedRevenue')}</p>
          <p className="text-2xl font-bold text-teal-500">{formatEuro(revenue)}</p>
        </div>
      </div>

      {/* List */}
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('allQuotes')}</p>

      {!jobs || jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="font-semibold text-on-surface mb-1">{t('noQuotesTitle')}</p>
          <p className="text-sm text-muted mb-5">{t('noQuotesBody')}</p>
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 transition"
          >
            {t('createFirstQuote')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-6">
          {(jobs as JobWithClient[]).map(job => {
            const proposal = latestProposalByJob.get(job.id) ?? null
            const status   = deriveQuoteStatus(job.status, proposal)
            return (
              <Link key={job.id} href={`/quotes/${job.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-teal-500 transition active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${QUOTE_STATUS_COLORS[status]}`}>
                          {tStatus(status)}
                        </span>
                        <span className="text-xs text-muted">
                          {t('lineItemCount', { count: job.line_items?.length ?? 0 })}
                        </span>
                      </div>
                      <p className="font-semibold text-on-surface truncate">{job.title}</p>
                      {job.clients && (
                        <p className="text-sm text-muted truncate mt-0.5">{job.clients.name}</p>
                      )}
                      {proposal?.accepted_at ? (
                        <p className="text-xs text-teal-700 font-medium mt-1">{t('accepted', { date: formatDate(proposal.accepted_at, locale, 'short') })}</p>
                      ) : proposal?.declined_at ? (
                        <p className="text-xs text-red-600 font-medium mt-1">{t('declined', { date: formatDate(proposal.declined_at, locale, 'short') })}</p>
                      ) : proposal?.opened_at ? (
                        <p className="text-xs text-muted mt-1">{t('opened', { date: formatDate(proposal.opened_at, locale, 'short') })}</p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted shrink-0 mt-1">{formatDate(job.created_at, locale, 'short')}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Mobile-only floating action button — pinned above the bottom nav
          bar (which is 64px tall) so New Quote stays a one-thumb reach. */}
      <Link
        href="/quotes/new"
        aria-label={t('newQuote')}
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
