import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import QRCode from 'qrcode'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Job, Proposal, Client } from '@/lib/types'
import { deriveQuoteStatus, QUOTE_STATUS_COLORS } from '@/lib/types'
import { formatEuro, itemTotal } from '@/lib/pricing'
import { recurringRateItemText, recurringRateLabel } from '@/lib/pdf/pdfLabels'
import { formatDate } from '@/lib/formatDate'
import type { Locale } from '@/i18n/config'
import JobStatusActions from './JobStatusActions'
import QuoteLanguageToggle from './QuoteLanguageToggle'
import CopyLinkButton from './CopyLinkButton'
import GenerateWordingSection from './GenerateWordingSection'
import QuotePdfAndEmail from './QuotePdfAndEmail'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const locale = await getLocale() as Locale
  const t = await getTranslations('quoteDetail')
  const tStatus = await getTranslations('quoteStatus')

  const { data: job } = await supabase
    .from('jobs')
    .select('*, clients(*)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!job) notFound()

  const { data: proposal } = await supabase
    .from('proposals')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rc = rateCard ?? { labour_rate_per_hour: 65, material_markup_percent: 15, vat_percent: 21 }
  const totals = (proposal as Proposal | null)?.computed_totals
  const client = (job as Job & { clients: Client | null }).clients
  const quoteStatus = deriveQuoteStatus((job as Job).status, proposal as Proposal | null)

  // ── QR code — generated server-side so no client JS needed ───────────────
  const headersList = await headers()
  const host    = headersList.get('host') ?? 'localhost:3000'
  const proto   = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`
  const shareUrl = proposal?.share_token ? `${baseUrl}/quote/${proposal.share_token}` : null
  const qrDataUrl = shareUrl
    ? await QRCode.toDataURL(shareUrl, {
        width:  240,
        margin: 1,
        color:  { dark: '#0F766E', light: '#FFFFFF' },
      })
    : null

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/quotes" className="flex items-center gap-1.5 text-sm text-muted hover:text-on-surface transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t('back')}
          </Link>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${QUOTE_STATUS_COLORS[quoteStatus]}`}>
            {tStatus(quoteStatus)}
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-56">

        {/* Title & client */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h1 className="text-lg font-bold text-on-surface font-display">{job.title}</h1>
            <p className="text-xs text-muted shrink-0 mt-1">{formatDate(job.created_at, locale)}</p>
          </div>
          <div className="mb-3">
            <QuoteLanguageToggle jobId={id} language={(job as Job).language} />
          </div>
          {(proposal as Proposal | null)?.opened_at && (
            <p className="text-xs text-muted mb-1">
              {t('openedByClient', { date: formatDate((proposal as Proposal).opened_at!, locale) })}
            </p>
          )}
          {(proposal as Proposal | null)?.accepted_at && (
            <p className="text-xs font-medium text-teal-700 mb-1">
              {t('accepted', { date: formatDate((proposal as Proposal).accepted_at!, locale) })}
              {(proposal as Proposal).signer_name && t('signedBy', { name: (proposal as Proposal).signer_name! })}
            </p>
          )}
          {(proposal as Proposal | null)?.declined_at && (
            <p className="text-xs font-medium text-red-600 mb-1">
              {t('declined', { date: formatDate((proposal as Proposal).declined_at!, locale) })}
              {(proposal as Proposal).decline_reason && (
                <span className="block text-muted font-normal mt-0.5">
                  {t('declineReason', { reason: (proposal as Proposal).decline_reason! })}
                </span>
              )}
            </p>
          )}
          {(proposal as Proposal | null)?.signed_pdf_url && (
            <a
              href={(proposal as Proposal).signed_pdf_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-500 hover:text-teal-700 transition mb-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
              </svg>
              {t('downloadSignedPdf')}
            </a>
          )}
          {client && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{t('client')}</p>
              <p className="font-semibold text-on-surface">{client.name}</p>
              {client.email   && <p className="text-sm text-muted">{client.email}</p>}
              {client.phone   && <p className="text-sm text-muted">{client.phone}</p>}
              {client.address && <p className="text-sm text-muted">{client.address}</p>}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('lineItems')}</p>
          {!job.line_items || job.line_items.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">{t('noLineItems')}</p>
          ) : (
            <div className="divide-y divide-border">
              {job.line_items.map((item: Job['line_items'][number], i: number) => (
                <div key={i} className="flex justify-between items-start py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface">{item.label}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {item.rate_type
                        ? `${recurringRateLabel(locale, item.rate_type)} · ${recurringRateItemText(locale, item.rate_type, item.quantity, item.unit_cost).rateText}`
                        : `${t(item.type)} · ${item.quantity} ${item.type === 'labour' ? t('hourUnit') : t('unitUnit')}${item.type === 'material' ? ` × €${item.unit_cost}` : ''}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-on-surface shrink-0">
                    {formatEuro(itemTotal(item, rc))}
                  </p>
                </div>
              ))}
            </div>
          )}
          {totals && (
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              {totals.labour_total   > 0 && <TRow label={t('labour')}  value={totals.labour_total} />}
              {totals.material_total > 0 && <TRow label={t('material')} value={totals.material_total} />}
              {totals.fixed_total    > 0 && <TRow label={t('fixed')}   value={totals.fixed_total} />}
              <div className="flex justify-between text-sm text-muted">
                <span>{t('subtotal')}</span>
                <span>{formatEuro(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted">
                <span>{t('vat', { percent: rc.vat_percent })}</span>
                <span>{formatEuro(totals.vat_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-on-surface text-lg pt-2 border-t border-border">
                <span>{t('totalInclVat')}</span>
                <span className="text-teal-500">{formatEuro(totals.total)}</span>
              </div>
            </div>
          )}
        </div>

        {/* AI-generated wording — only once the quote has been priced */}
        {proposal && (
          <GenerateWordingSection
            proposalId={proposal.id}
            jobId={id}
            jobTitle={job.title}
            clientName={client?.name ?? null}
            quoteType={(job as Job).quote_type}
            lineItems={(job as Job).line_items}
            recurringConfig={(job as Job).recurring_config}
            initialScopeText={(proposal as Proposal).scope_text}
            initialCoverNote={(proposal as Proposal).cover_note}
          />
        )}

        {/* Branded PDF — only once the quote has been priced */}
        {proposal && (
          <QuotePdfAndEmail
            jobId={id}
            initialPdfUrl={(proposal as Proposal).pdf_url}
            locale={locale}
            initialEmailSentAt={(proposal as Proposal).email_sent_at}
            initialEmailSentTo={(proposal as Proposal).email_sent_to}
          />
        )}

        {/* QR code — share with client */}
        {qrDataUrl && shareUrl && (
          <div className="bg-white rounded-2xl border border-border p-5 mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">
              {t('shareWithClient')}
            </p>
            <div className="flex flex-col items-center">
              {/* QR code image generated server-side */}
              <img
                src={qrDataUrl}
                alt={t('qrAlt')}
                width={200}
                height={200}
                className="rounded-xl"
              />
              <p className="text-sm text-muted text-center mt-3 max-w-xs">
                {t('scanToOpen')}
              </p>
              {/* Copy link fallback */}
              <CopyLinkButton url={shareUrl} />
            </div>
          </div>
        )}

      </main>

      <JobStatusActions jobId={id} currentStatus={(job as Job).status} />
    </div>
  )
}

function TRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs text-muted">
      <span>{label}</span>
      <span>{formatEuro(value)}</span>
    </div>
  )
}
