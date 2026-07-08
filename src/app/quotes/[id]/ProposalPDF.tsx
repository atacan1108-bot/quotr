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
import { euro, fmtDate, pdfStyles as s, TYPE_META } from '@/lib/pdf/shared'

export function ProposalPDF({ data }: { data: QuoteExportData }) {
  const { job, proposal, rateCard, breakdown } = data
  const client = job.clients

  return (
    <Document
      title={`Quote for ${client?.name ?? job.title}`}
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
        <Text style={s.quoteTitle}>Quote for {client?.name ?? 'you'}</Text>
        <Text style={s.quoteDate}>{fmtDate(new Date())}</Text>

        {/* ── Cover note ─────────────────────────────────────────── */}
        {proposal?.cover_note && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>A note from {rateCard.business_name ?? 'us'}</Text>
            <Text style={s.panelText}>{proposal.cover_note}</Text>
          </View>
        )}

        {/* ── Scope of work ──────────────────────────────────────── */}
        {proposal?.scope_text && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>Scope of work</Text>
            <Text style={s.panelText}>{proposal.scope_text}</Text>
          </View>
        )}

        {/* ── Itemized table — every number below comes straight
               from the pricing engine's breakdown, never recomputed ── */}
        <Text style={s.sectionLabel}>Quote breakdown</Text>
        <View style={s.tableHeadRow}>
          <Text style={[s.tableHeadTxt, s.wDesc]}>Description</Text>
          <Text style={[s.tableHeadTxt, s.wAmount]}>Amount</Text>
        </View>

        {breakdown.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? s.row : s.rowAlt}>
            <View style={s.wDesc}>
              <Text style={s.itemLabel}>{item.label}</Text>
              <Text style={s.itemMeta}>{(TYPE_META[item.type] ?? (() => ''))(item.quantity)}</Text>
            </View>
            <Text style={[s.amount, s.wAmount]}>{euro(item.line_total)}</Text>
          </View>
        ))}

        {/* ── Totals ──────────────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal</Text>
            <Text style={s.totVal}>{euro(breakdown.subtotal)}</Text>
          </View>
          <View style={s.totRow}>
            <Text style={s.totLabel}>VAT ({breakdown.vat_percent}%)</Text>
            <Text style={s.totVal}>{euro(breakdown.vat_amount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandVal}>{euro(breakdown.total)}</Text>
          </View>
        </View>

        {/* ── Footer: terms & conditions, small and subtle ───────── */}
        {rateCard.terms_text && (
          <View style={s.footer} fixed>
            <Text style={s.footerTxt}>{rateCard.terms_text}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
