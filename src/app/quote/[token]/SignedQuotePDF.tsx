/**
 * SignedQuotePDF — the same branded proposal as ProposalPDF, plus a
 * signed-by block (name, signature, date). Generated server-side the
 * moment a customer accepts on the public /quote/[token] page.
 *
 * Built from PublicQuoteView (the public, token-scoped data shape) rather
 * than QuoteExportData (the authenticated contractor shape) — different
 * data source, same shared styles via '@/lib/pdf/shared' so the two
 * documents stay visually identical.
 */
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import type { PublicQuoteView } from '@/lib/publicProposal'
import { euro, fmtDate, pdfStyles as s, TYPE_META } from '@/lib/pdf/shared'

interface Props {
  quote:             PublicQuoteView
  signerName:        string
  signatureDataUrl:  string | null
  signedAt:          string
}

export function SignedQuotePDF({ quote, signerName, signatureDataUrl, signedAt }: Props) {
  const { business, breakdown } = quote
  const businessName = business.name ?? 'Quotr'

  return (
    <Document
      title={`Signed quote for ${quote.clientName ?? quote.jobTitle}`}
      author={businessName}
      creator="Quotr"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>{businessName}</Text>
            {business.address && <Text style={s.brandMeta}>{business.address}</Text>}
            {business.email   && <Text style={s.brandMeta}>{business.email}</Text>}
          </View>
        </View>
        <View style={s.headerRule} />

        {/* ── Quote for [client] + date ─────────────────────────── */}
        <Text style={s.quoteTitle}>Quote for {quote.clientName ?? 'you'}</Text>
        <Text style={s.quoteDate}>{fmtDate(new Date(quote.createdAt))}</Text>

        {/* ── Cover note ─────────────────────────────────────────── */}
        {quote.coverNote && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>A note from {businessName}</Text>
            <Text style={s.panelText}>{quote.coverNote}</Text>
          </View>
        )}

        {/* ── Scope of work ──────────────────────────────────────── */}
        {quote.scopeText && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>Scope of work</Text>
            <Text style={s.panelText}>{quote.scopeText}</Text>
          </View>
        )}

        {/* ── Itemized table — straight from the pricing engine ──── */}
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

        {/* ── Signed by ─────────────────────────────────────────────── */}
        <View style={s.signedBlock}>
          <Text style={s.signedLabel}>Accepted &amp; signed</Text>
          <View style={s.signedRow}>
            <View>
              <Text style={s.signerName}>{signerName}</Text>
              <Text style={s.signedDate}>{fmtDate(new Date(signedAt))} · Signed electronically via Quotr</Text>
            </View>
            {signatureDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={signatureDataUrl} style={s.signatureImg} />
            ) : (
              <Text style={s.typedSignature}>{signerName}</Text>
            )}
          </View>
        </View>

        {/* ── Footer: terms & conditions, small and subtle ───────── */}
        {quote.termsText && (
          <View style={s.footer} fixed>
            <Text style={s.footerTxt}>{quote.termsText}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}
