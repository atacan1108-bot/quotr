/**
 * QuotePDF — React-PDF document component.
 * Rendered server-side only (inside the /api/quote/[id]/pdf route).
 * All amounts come from the pricing engine breakdown — nothing is recomputed here.
 */

import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer'
import type { QuoteExportData } from '@/lib/quoteData'
import { pdfLabels, itemTypeLabel, vatLabel, generatedWithLabel, vatBasisLabel } from '@/lib/pdf/pdfLabels'
import { formatDate } from '@/lib/formatDate'

// Money formatting stays nl-NL style regardless of quote language.
// Produces: € 1.234,56
const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

// ─── Styles ──────────────────────────────────────────────────────────────────

const TEAL  = '#0F766E'
const INK   = '#17201E'
const MUTED = '#575751'
const RULE  = '#DAD4C4'
const LIGHT = '#F3ECDA'

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
  // Recurring-quote totals — same row style as totalsBlock above, just two
  // more lines directly below it.
  periodBlock:  { marginTop: 8, alignSelf: 'flex-end', width: 220 },
  periodBasis:  { fontSize: 7, color: MUTED, marginTop: 2, textAlign: 'right' },
})

// ─── Component ────────────────────────────────────────────────────────────────

export function QuotePDF({ data }: { data: QuoteExportData }) {
  const { job, rateCard, breakdown, shareUrl, recurringPeriods } = data
  const client = job.clients
  // Customer-facing document — follows the QUOTE's own language.
  const locale = job.language
  const l = pdfLabels(locale)
  const isRecurring = job.quote_type === 'recurring' && !!recurringPeriods
  const useExVat = rateCard.prices_shown_excluding_vat

  return (
    <Document
      title={job.title}
      author={rateCard.business_name ?? 'Stipt'}
      creator="Stipt"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>{rateCard.business_name ?? 'Stipt'}</Text>
            {rateCard.business_address && <Text style={s.brandSub}>{rateCard.business_address}</Text>}
            {rateCard.business_email   && <Text style={s.brandSub}>{rateCard.business_email}</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>{l.quote}</Text>
            <Text style={s.headerVal}>{formatDate(job.created_at, locale)}</Text>
          </View>
        </View>

        <View style={s.rule} />

        {/* ── Client + job title ─────────────────────────────── */}
        <View style={s.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.colLabel}>{l.client}</Text>
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
            <Text style={s.colLabel}>{l.workDescription}</Text>
            <Text style={s.colValBold}>{job.title}</Text>
          </View>
        </View>

        {/* ── Line items table ────────────────────────────────── */}
        <Text style={s.sectionHead}>{l.lineItems}</Text>

        {/* Table header */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderTxt, s.wDesc]}>{l.description}</Text>
          <Text style={[s.tableHeaderTxt, s.wType]}>{l.type}</Text>
          <Text style={[s.tableHeaderTxt, s.wQty, { textAlign: 'right' }]}>{l.quantity}</Text>
          <Text style={[s.tableHeaderTxt, s.wAmount]}>{l.amount}</Text>
        </View>

        {/* Table rows — all amounts from pricing engine */}
        {breakdown.items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
            <View style={s.wDesc}>
              <Text style={s.cell}>{item.label}</Text>
              {item.type === 'material' && item.markup_amount > 0 && (
                <Text style={s.cellMuted}>
                  {euro(item.base_cost)} + {rateCard.material_markup_percent}% {l.markupSuffix}
                </Text>
              )}
            </View>
            <Text style={[s.cell, s.wType]}>{itemTypeLabel(locale, item.type)}</Text>
            <Text style={[s.cell, s.wQty]}>
              {item.type === 'labour' ? `${item.quantity} ${l.hourUnit}` : `${item.quantity} ${l.unitUnit}`}
            </Text>
            <Text style={[s.cellRight, s.wAmount]}>{euro(item.line_total)}</Text>
          </View>
        ))}

        {/* ── Totals block ────────────────────────────────────── */}
        <View style={s.totalsBlock}>
          {breakdown.labour_total   > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>{l.itemTypeLabour}</Text>
              <Text style={s.totVal}>{euro(breakdown.labour_total)}</Text>
            </View>
          )}
          {breakdown.material_total > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>{l.itemTypeMaterial}</Text>
              <Text style={s.totVal}>{euro(breakdown.material_total)}</Text>
            </View>
          )}
          {breakdown.fixed_total    > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>{l.itemTypeFixed}</Text>
              <Text style={s.totVal}>{euro(breakdown.fixed_total)}</Text>
            </View>
          )}
          <View style={s.totRuleSmall} />
          <View style={s.totRow}>
            <Text style={s.totLabel}>{l.subtotalExclVat}</Text>
            <Text style={s.totVal}>{euro(breakdown.subtotal)}</Text>
          </View>
          <View style={s.totRow}>
            <Text style={s.totLabel}>{vatLabel(locale, breakdown.vat_percent)}</Text>
            <Text style={s.totVal}>{euro(breakdown.vat_amount)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>{l.totalInclVat}</Text>
            <Text style={s.grandVal}>{euro(breakdown.total)}</Text>
          </View>
        </View>

        {/* ── Recurring quotes only: per-day and per-month totals — the
               SAME figures the app's live summary shows, straight from
               calculateRecurringPeriods, nothing recomputed here. Same row
               style as the totals block directly above. ──────────────── */}
        {isRecurring && recurringPeriods && (
          <View style={s.periodBlock}>
            <View style={s.totRow}>
              <Text style={s.totLabel}>{l.columnPerDay}</Text>
              <Text style={s.totVal}>{euro(useExVat ? recurringPeriods.per_day.ex_vat : recurringPeriods.per_day.incl_vat)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>{l.columnPerMonth}</Text>
              <Text style={s.totVal}>{euro(useExVat ? recurringPeriods.per_month.ex_vat : recurringPeriods.per_month.incl_vat)}</Text>
            </View>
            <Text style={s.periodBasis}>{vatBasisLabel(locale, useExVat)}</Text>
          </View>
        )}

        {/* ── Footer ──────────────────────────────────────────── */}
        <View style={s.footer}>
          {shareUrl ? (
            <>
              <Text style={s.footerTxt}>
                {l.viewAndAcceptOnline}
              </Text>
              <Text style={s.shareUrl}>{shareUrl}</Text>
            </>
          ) : null}
          <Text style={[s.footerTxt, { marginTop: shareUrl ? 8 : 0 }]}>
            {generatedWithLabel(locale, breakdown.vat_percent)}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
