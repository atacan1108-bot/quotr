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
import { euro, createPdfStyles, DEFAULT_PRIMARY } from '@/lib/pdf/shared'
import { pdfLabels, typeMeta, vatLabel } from '@/lib/pdf/pdfLabels'
import { formatDate } from '@/lib/formatDate'

interface Props {
  quote:             PublicQuoteView
  signerName:        string
  signatureDataUrl:  string | null
  signedAt:          string
}

export function SignedQuotePDF({ quote, signerName, signatureDataUrl, signedAt }: Props) {
  const { business, breakdown } = quote
  const businessName = business.name ?? 'Stipt'
  const s = createPdfStyles(quote.branding.primaryColor || DEFAULT_PRIMARY)
  const locale = quote.language
  const l = pdfLabels(locale)

  return (
    <Document
      title={`${l.quoteFor} ${quote.clientName ?? quote.jobTitle}`}
      author={businessName}
      creator="Stipt"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.header}>
          {business.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={business.logoUrl} style={s.logo} />
          ) : null}
          <View>
            <Text style={s.brandName}>{businessName}</Text>
            {business.address && <Text style={s.brandMeta}>{business.address}</Text>}
            {business.email   && <Text style={s.brandMeta}>{business.email}</Text>}
          </View>
        </View>
        <View style={s.headerRule} />

        {/* ── Quote for [client] + date ─────────────────────────── */}
        <Text style={s.quoteTitle}>{l.quoteFor} {quote.clientName ?? l.you}</Text>
        <Text style={s.quoteDate}>{formatDate(quote.createdAt, locale)}</Text>

        {/* ── Cover note ─────────────────────────────────────────── */}
        {quote.coverNote && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>{l.aNoteFrom} {businessName}</Text>
            <Text style={s.panelText}>{quote.coverNote}</Text>
          </View>
        )}

        {/* ── Scope of work ──────────────────────────────────────── */}
        {quote.scopeText && (
          <View style={s.panel}>
            <Text style={s.panelLabel}>{l.scopeOfWork}</Text>
            <Text style={s.panelText}>{quote.scopeText}</Text>
          </View>
        )}

        {/* ── Itemized table — straight from the pricing engine ──── */}
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

        {/* ── Signed by ─────────────────────────────────────────────── */}
        <View style={s.signedBlock}>
          <Text style={s.signedLabel}>{l.acceptedAndSigned}</Text>
          <View style={s.signedRow}>
            <View>
              <Text style={s.signerName}>{signerName}</Text>
              <Text style={s.signedDate}>{formatDate(signedAt, locale)} · {l.signedElectronicallyVia}</Text>
            </View>
            {signatureDataUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={signatureDataUrl} style={s.signatureImg} />
            ) : (
              <Text style={s.typedSignature}>{signerName}</Text>
            )}
          </View>
        </View>

        {/* ── Footer: short branded tagline + terms, small and subtle ── */}
        {(quote.branding.footerText || quote.termsText) && (
          <View style={s.footer} fixed>
            {quote.branding.footerText && <Text style={s.footerTagline}>{quote.branding.footerText}</Text>}
            {quote.termsText && <Text style={s.footerTxt}>{quote.termsText}</Text>}
          </View>
        )}
      </Page>
    </Document>
  )
}
