/**
 * ProposalPDF — the branded, client-facing proposal document.
 * Rendered server-side only (inside /api/quote/[id]/generate-pdf).
 *
 * All amounts come straight from the pricing engine's breakdown — this
 * component never computes or invents a number, it only formats and
 * lays out numbers it's handed.
 */

import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import type { QuoteExportData } from '@/lib/quoteData'
import { euro, createPdfStyles, DEFAULT_PRIMARY } from '@/lib/pdf/shared'
import { pdfLabels, typeMeta, vatLabel } from '@/lib/pdf/pdfLabels'
import { formatDate } from '@/lib/formatDate'

export function ProposalPDF({ data }: { data: QuoteExportData }) {
  const { job, proposal, rateCard, breakdown } = data
  const client = job.clients
  const s = createPdfStyles(rateCard.branding?.primaryColor || DEFAULT_PRIMARY)
  // Customer-facing document — follows the QUOTE's own language.
  const locale = job.language
  const l = pdfLabels(locale)

  return (
    <Document
      title={`${l.quoteFor} ${client?.name ?? job.title}`}
      author={rateCard.business_name ?? 'Quotr'}
      creator="Quotr"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header: logo, business name, address, email ─────── */}
        <View style={s.header}>
          {rateCard.logo_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={rateCard.logo_url} style={s.logo} />
          ) : null}
          <View>
            <Text style={s.brandName}>{rateCard.business_name ?? 'Your Business'}</Text>
            {rateCard.business_address && <Text style={s.brandMeta}>{rateCard.business_address}</Text>}
            {rateCard.business_email   && <Text style={s.brandMeta}>{rateCard.business_email}</Text>}
          </View>
        </View>
        <View style={s.headerRule} />

        {/* ── Quote for [client] + date ─────────────────────────── */}
        <Text style={s.quoteTitle}>{l.quoteFor} {client?.name ?? ''}</Text>
        <Text style={s.quoteDate}>{formatDate(new Date(), locale)}</Text>

        {/* ── Cover note — first, right after the header/addressee block ── */}
        {proposal?.cover_note && (
          <View style={s.panel} wrap={false}>
            <Text style={s.panelLabel}>{l.aNoteFrom} {rateCard.business_name ?? ''}</Text>
            <Text style={s.panelText}>{proposal.cover_note}</Text>
          </View>
        )}

        {/* ── Itemized table — every number below comes straight
               from the pricing engine's breakdown, never recomputed ── */}
        <Text style={s.sectionLabel}>{l.quoteBreakdown}</Text>
        <View style={s.tableHeadRow}>
          <Text style={[s.tableHeadTxt, s.wDesc]}>{l.description}</Text>
          <Text style={[s.tableHeadTxt, s.wAmount]}>{l.amount}</Text>
        </View>

        {breakdown.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
            <View style={s.wDesc}>
              <Text style={s.itemLabel}>{item.label}</Text>
              <Text style={s.itemMeta}>{typeMeta(locale, item.type, item.quantity)}</Text>
            </View>
            <Text style={[s.amount, s.wAmount]}>{euro(item.line_total)}</Text>
          </View>
        ))}

        {/* ── Totals ──────────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          <View style={s.totRow}>
            <Text style={s.totLabel}>{l.subtotal}</Text>
            <Text style={s.totVal}>{euro(breakdown.subtotal)}</Text>
          </View>
          <View style={s.totRow}>
            <Text style={s.totLabel}>{vatLabel(locale, breakdown.vat_percent)}</Text>
            <Text style={s.totVal}>{euro(breakdown.vat_amount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>{l.total}</Text>
            <Text style={s.grandVal}>{euro(breakdown.total)}</Text>
          </View>
        </View>

        {/* ── Scope of work — after the line items and totals ──────── */}
        {proposal?.scope_text && (
          <View style={s.panel} wrap={false}>
            <Text style={s.panelLabel}>{l.scopeOfWork}</Text>
            <Text style={s.panelText}>{proposal.scope_text}</Text>
          </View>
        )}

        {/* ── Footer: short branded tagline + terms, small and subtle ── */}
        {(rateCard.branding?.footerText || rateCard.terms_text) && (
          <View style={s.footer} fixed>
            {rateCard.branding?.footerText && (
              <Text style={s.footerTagline}>{rateCard.branding.footerText}</Text>
            )}
            {rateCard.terms_text && <Text style={s.footerTxt}>{rateCard.terms_text}</Text>}
          </View>
        )}
      </Page>
    </Document>
  )
}
