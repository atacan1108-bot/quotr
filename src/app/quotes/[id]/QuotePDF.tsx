/**
 * QuotePDF — React-PDF document component.
 * Rendered server-side only (inside the /api/quote/[id]/pdf route).
 * All amounts come from the pricing engine breakdown — nothing is recomputed here.
 */

import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { QuoteExportData } from '@/lib/quoteData'

// ─── Dutch euro formatter ────────────────────────────────────────────────────
// Produces: € 1.234,56
const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

function fmtDate(s: string) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s))
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const TEAL  = '#0F766E'
const INK   = '#1C1C1E'
const MUTED = '#6E7580'
const RULE  = '#E5E5E3'
const LIGHT = '#F4FDFB'

const s = StyleSheet.create({
  page:          { fontFamily: 'Helvetica', fontSize: 9, color: INK, paddingHorizontal: 48, paddingVertical: 48, backgroundColor: '#FFFFFF' },
  // Header
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  brandName:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 2 },
  brandSub:      { fontSize: 8, color: MUTED },
  headerRight:   { textAlign: 'right' },
  headerLabel:   { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  headerVal:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK },
  // Divider
  rule:          { borderBottomWidth: 1, borderBottomColor: RULE, marginBottom: 20 },
  // Client / meta
  twoCol:        { flexDirection: 'row', gap: 32, marginBottom: 24 },
  colLabel:      { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  colVal:        { fontSize: 9, color: INK, lineHeight: 1.5 },
  colValBold:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 },
  // Section heading
  sectionHead:   { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  // Table
  tableHeader:   { flexDirection: 'row', backgroundColor: TEAL, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 2 },
  tableHeaderTxt:{ color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow:      { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE },
  tableRowAlt:   { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: LIGHT },
  cell:          { fontSize: 9, color: INK },
  cellMuted:     { fontSize: 8, color: MUTED },
  cellRight:     { fontSize: 9, color: INK, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  // Widths for table columns
  wDesc:         { flex: 1 },
  wType:         { width: 56 },
  wQty:          { width: 36, textAlign: 'right' },
  wAmount:       { width: 68, textAlign: 'right' },
  // Totals block
  totalsBlock:   { marginTop: 16, alignSelf: 'flex-end', width: 220 },
  totRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totLabel:      { fontSize: 8, color: MUTED },
  totVal:        { fontSize: 8, color: INK, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  totRuleSmall:  { borderBottomWidth: 1, borderBottomColor: RULE, marginVertical: 4 },
  grandRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, backgroundColor: TEAL, borderRadius: 3, paddingHorizontal: 8, marginTop: 4 },
  grandLabel:    { fontSize: 9, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  grandVal:      { fontSize: 11, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  // Footer
  footer:        { marginTop: 36, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 12 },
  footerTxt:     { fontSize: 7, color: MUTED, lineHeight: 1.6 },
  shareUrl:      { fontSize: 7, color: TEAL, marginTop: 6 },
})

// ─── Component ────────────────────────────────────────────────────────────────

export function QuotePDF({ data }: { data: QuoteExportData }) {
  const { job, proposal, rateCard, breakdown, shareUrl } = data
  const client = job.clients

  const TYPE_LABEL: Record<string, string> = {
    labour: 'Arbeid', material: 'Materiaal', fixed: 'Vast',
  }

  return (
    <Document
      title={job.title}
      author={rateCard.business_name ?? 'Quotr'}
      creator="Quotr"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>{rateCard.business_name ?? 'Quotr'}</Text>
            {rateCard.business_address && <Text style={s.brandSub}>{rateCard.business_address}</Text>}
            {rateCard.business_email   && <Text style={s.brandSub}>{rateCard.business_email}</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Offerte</Text>
            <Text style={s.headerVal}>{fmtDate(job.created_at)}</Text>
          </View>
        </View>

        <View style={s.rule} />

        {/* ── Client + job title ─────────────────────────────── */}
        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.colLabel}>Klant</Text>
            {client ? (
              <>
                <Text style={s.colValBold}>{client.name}</Text>
                {client.email   && <Text style={s.colVal}>{client.email}</Text>}
                {client.phone   && <Text style={s.colVal}>{client.phone}</Text>}
                {client.address && <Text style={s.colVal}>{client.address}</Text>}
              </>
            ) : (
              <Text style={s.colVal}>—</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.colLabel}>Werkzaamheden</Text>
            <Text style={s.colValBold}>{job.title}</Text>
          </View>
        </View>

        {/* ── Line items table ────────────────────────────────── */}
        <Text style={s.sectionHead}>Regelposten</Text>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderTxt, s.wDesc]}>Omschrijving</Text>
          <Text style={[s.tableHeaderTxt, s.wType]}>Type</Text>
          <Text style={[s.tableHeaderTxt, s.wQty, { textAlign: 'right' }]}>Aantal</Text>
          <Text style={[s.tableHeaderTxt, s.wAmount]}>Bedrag</Text>
        </View>

        {/* Table rows — all amounts from pricing engine */}
        {breakdown.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <View style={s.wDesc}>
              <Text style={s.cell}>{item.label}</Text>
              {item.type === 'material' && item.markup_amount > 0 && (
                <Text style={s.cellMuted}>
                  {euro(item.base_cost)} + {rateCard.material_markup_percent}% markup
                </Text>
              )}
            </View>
            <Text style={[s.cell, s.wType]}>{TYPE_LABEL[item.type] ?? item.type}</Text>
            <Text style={[s.cell, s.wQty]}>
              {item.type === 'labour' ? `${item.quantity} u` : `${item.quantity} st`}
            </Text>
            <Text style={[s.cellRight, s.wAmount]}>{euro(item.line_total)}</Text>
          </View>
        ))}

        {/* ── Totals block ────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          {breakdown.labour_total   > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Arbeid</Text>
              <Text style={s.totVal}>{euro(breakdown.labour_total)}</Text>
            </View>
          )}
          {breakdown.material_total > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Materiaal</Text>
              <Text style={s.totVal}>{euro(breakdown.material_total)}</Text>
            </View>
          )}
          {breakdown.fixed_total    > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Vast</Text>
              <Text style={s.totVal}>{euro(breakdown.fixed_total)}</Text>
            </View>
          )}
          <View style={s.totRuleSmall} />
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotaal (excl. BTW)</Text>
            <Text style={s.totVal}>{euro(breakdown.subtotal)}</Text>
          </View>
          <View style={s.totRow}>
            <Text style={s.totLabel}>BTW {breakdown.vat_percent}%</Text>
            <Text style={s.totVal}>{euro(breakdown.vat_amount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Totaal incl. BTW</Text>
            <Text style={s.grandVal}>{euro(breakdown.total)}</Text>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────── */}
        <View style={s.footer}>
          {shareUrl ? (
            <>
              <Text style={s.footerTxt}>
                Bekijk en accepteer deze offerte online:
              </Text>
              <Text style={s.shareUrl}>{shareUrl}</Text>
            </>
          ) : null}
          <Text style={[s.footerTxt, { marginTop: shareUrl ? 8 : 0 }]}>
            Gegenereerd met Quotr · Alle prijzen in euro (€) · BTW {breakdown.vat_percent}%
          </Text>
        </View>

      </Page>
    </Document>
  )
}
