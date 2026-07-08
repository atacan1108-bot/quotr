import { getPublicProposalByToken } from '@/lib/publicProposal'
import { formatEuro } from '@/lib/pricing'
import AcceptSignSection from './AcceptSignSection'

// This page has no logged-in user and reads via the service-role admin
// client, so it must never be statically cached/prerendered — every
// request needs a fresh check (and the first one needs to stamp opened_at).
export const dynamic = 'force-dynamic'

const TYPE_META: Record<string, (qty: number) => string> = {
  labour:   qty => `${qty} ${qty === 1 ? 'hour' : 'hours'} of labour`,
  material: qty => `${qty} ${qty === 1 ? 'unit' : 'units'}`,
  fixed:    () => 'Fixed price',
}

function formatDate(s: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s))
}

function CleanState({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="font-semibold text-on-surface mb-1">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </div>
  )
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let quote = null
  let configError = false
  try {
    quote = await getPublicProposalByToken(token)
  } catch (err) {
    // Most likely SUPABASE_SERVICE_ROLE_KEY isn't set yet — never show a
    // raw crash to a customer opening a quote link.
    console.error('PublicQuotePage: failed to load proposal', err)
    configError = true
  }

  if (configError) {
    return <CleanState
      title="This page isn’t set up yet"
      body="The site owner needs to finish setting up sharing before this link will work."
    />
  }
  if (!quote) {
    return <CleanState
      title="This link isn’t valid"
      body="The quote may have been removed, or the link was copied incorrectly. Ask the business that sent it for a new link."
    />
  }
  if (quote.status === 'declined') {
    return <CleanState
      title="This quote is no longer available"
      body="The business that sent this quote has withdrawn it. Get in touch with them directly if you have questions."
    />
  }
  if (quote.status === 'expired') {
    return <CleanState
      title="This quote has expired"
      body={`This quote was valid until ${formatDate(quote.expiresAt)}. Ask the business that sent it for an updated quote.`}
    />
  }

  const { business, breakdown, branding } = quote
  const businessName = business.name ?? 'This business'
  const primary = branding.primaryColor || '#0F766E'
  const pageFont = branding.fontFamily || undefined

  return (
    <div className="min-h-screen bg-surface" style={{ fontFamily: pageFont }}>
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>

        {/* ── Header: logo, business identity, brand accent line ─────── */}
        <div className="flex items-center gap-3 mb-2">
          {business.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain shrink-0" />
          )}
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: primary }}>{businessName}</h1>
            {business.address && <p className="text-sm text-muted">{business.address}</p>}
            {business.email   && <p className="text-sm text-muted">{business.email}</p>}
          </div>
        </div>
        <div className="h-[3px] rounded-full mt-4 mb-8" style={{ backgroundColor: primary }} />

        {/* ── Quote for [client] + date + validity ──────────────── */}
        <h2 className="text-xl font-bold text-on-surface mb-1">
          Quote for {quote.clientName ?? 'you'}
        </h2>
        <p className="text-sm text-muted">{formatDate(quote.createdAt)}</p>
        {quote.status === 'open' && (
          <p className="text-xs text-muted mb-6">Valid until {formatDate(quote.expiresAt)}</p>
        )}
        {quote.status !== 'open' && <div className="mb-6" />}

        {/* ── Already accepted banner ─────────────────────────────── */}
        {quote.acceptedAt && (
          <div className="flex items-center gap-2 bg-teal-100 border border-teal-500/30 rounded-xl px-4 py-3 mb-6">
            <svg className="w-5 h-5 text-teal-700 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-sm font-medium text-teal-700">
              You accepted this quote on {formatDate(quote.acceptedAt)}.
            </p>
          </div>
        )}

        {/* ── Cover note ───────────────────────────────────────────── */}
        {quote.coverNote && (
          <div className="bg-white rounded-2xl border border-border p-5 mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              A note from {businessName}
            </p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{quote.coverNote}</p>
          </div>
        )}

        {/* ── Scope of work ────────────────────────────────────────── */}
        {quote.scopeText && (
          <div className="bg-white rounded-2xl border border-border p-5 mb-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Scope of work</p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{quote.scopeText}</p>
          </div>
        )}

        {/* ── Itemized lines ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border p-5 mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Quote breakdown</p>
          <div className="divide-y divide-border">
            {breakdown.items.map((item, i) => (
              <div key={i} className="flex justify-between items-start py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">{item.label}</p>
                  <p className="text-xs text-muted mt-0.5">{(TYPE_META[item.type] ?? (() => ''))(item.quantity)}</p>
                </div>
                <p className="text-sm font-semibold text-on-surface shrink-0">{formatEuro(item.line_total)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{formatEuro(breakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <span>VAT ({breakdown.vat_percent}%)</span>
              <span>{formatEuro(breakdown.vat_amount)}</span>
            </div>
          </div>
        </div>

        {/* ── Total, emphasized in the contractor's brand color ─────── */}
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between mb-6" style={{ backgroundColor: primary }}>
          <span className="font-semibold text-white">Total incl. VAT</span>
          <span className="text-2xl font-bold text-white">{formatEuro(breakdown.total)}</span>
        </div>

        {/* ── Terms & conditions ───────────────────────────────────── */}
        {quote.termsText && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Terms &amp; conditions</p>
            <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{quote.termsText}</p>
          </div>
        )}

        {/* ── Download PDF ─────────────────────────────────────────── */}
        {quote.pdfUrl && (
          <a
            href={quote.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-13 rounded-2xl border-2 font-semibold text-base active:scale-[0.98] transition flex items-center justify-center gap-2 mb-4"
            style={{ borderColor: primary, color: primary }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Download PDF
          </a>
        )}

        {/* ── Accept & sign ────────────────────────────────────────── */}
        <AcceptSignSection
          token={token}
          businessName={businessName}
          alreadyAccepted={Boolean(quote.acceptedAt)}
          initialSignerName={quote.signerName}
          initialSignedPdfUrl={quote.signedPdfUrl}
          primaryColor={primary}
        />

        <p className="text-center text-xs text-muted mt-8">
          {branding.footerText || 'Sent via Quotr'}
        </p>
      </div>
    </div>
  )
}
