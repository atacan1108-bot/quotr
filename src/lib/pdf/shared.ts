/**
 * Shared brand palette, styles, and formatters for every generated PDF
 * (the contractor's on-demand proposal PDF and the customer-signed PDF).
 * Keeping this in one place means both documents always look identical
 * in spirit — same spacing, same table — with zero duplication.
 *
 * The accent color is per-contractor (from rate_cards.branding.primaryColor),
 * so styles are built by createPdfStyles(color) at render time rather than
 * exported as a static object.
 */
import { StyleSheet } from '@react-pdf/renderer'

// ─── Dutch euro formatter ────────────────────────────────────────────────────
// Produces: € 1.234,56
export const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

// ─── Brand palette ───────────────────────────────────────────────────────────

/** Fallback brand color when a contractor hasn't set one (or imported one) yet. */
export const DEFAULT_PRIMARY = '#0F766E'

export const INK   = '#17201E'
export const MUTED = '#575751'
export const RULE  = '#DAD4C4'
export const PANEL = '#F3ECDA'

export function createPdfStyles(primary: string = DEFAULT_PRIMARY) {
  return StyleSheet.create({
    page: {
      fontFamily:     'Helvetica',
      fontSize:       10,
      color:          INK,
      paddingHorizontal: 52,
      paddingVertical:   52,
      backgroundColor:   '#FFFFFF',
    },

    // ── Header ──────────────────────────────────────────────────
    header:        { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    logo:          { width: 40, height: 40, marginRight: 12, objectFit: 'contain' },
    brandName:     { fontSize: 17, fontFamily: 'Helvetica-Bold', color: primary, marginBottom: 2 },
    brandMeta:     { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },
    headerRule:    { borderBottomWidth: 1.5, borderBottomColor: primary, marginBottom: 28 },

    // ── Quote for / date ────────────────────────────────────────
    quoteTitle:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
    quoteDate:     { fontSize: 9, color: MUTED, marginBottom: 24 },

    // ── Panels (cover note / scope of work) ─────────────────────
    panel:         { backgroundColor: PANEL, borderRadius: 6, padding: 16, marginBottom: 18 },
    panelLabel:    { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    panelText:     { fontSize: 9.5, color: INK, lineHeight: 1.6 },

    // ── Itemized table ───────────────────────────────────────────
    sectionLabel:  { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
    tableHeadRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 6, marginBottom: 2 },
    tableHeadTxt:  { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 },
    row:           { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: RULE },
    rowAlt:        { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: RULE, backgroundColor: PANEL },
    itemLabel:     { fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' },
    itemMeta:      { fontSize: 8, color: MUTED, marginTop: 1.5 },
    wDesc:         { flex: 1 },
    wAmount:       { width: 80, textAlign: 'right' },
    amount:        { fontSize: 9.5, color: INK, fontFamily: 'Helvetica-Bold' },

    // ── Totals ───────────────────────────────────────────────────
    totalsBlock:   { marginTop: 18, alignSelf: 'flex-end', width: 220 },
    totRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totLabel:      { fontSize: 9, color: MUTED },
    totVal:        { fontSize: 9, color: INK, fontFamily: 'Helvetica-Bold' },
    grandRow:      {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 8, paddingVertical: 10, paddingHorizontal: 12,
      backgroundColor: primary, borderRadius: 6,
    },
    grandLabel:    { fontSize: 10, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
    grandVal:      { fontSize: 13, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },

    // ── Signed-by block (signed PDF only) ─────────────────────────
    signedBlock:   { marginTop: 20, borderWidth: 1, borderColor: primary, borderRadius: 6, padding: 16 },
    signedLabel:   { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    signedRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    signerName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 2 },
    signedDate:    { fontSize: 8, color: MUTED },
    signatureImg:  { width: 160, height: 60, objectFit: 'contain' },
    typedSignature:{ fontSize: 20, fontFamily: 'Helvetica-Oblique', color: primary },

    // ── Footer ───────────────────────────────────────────────────
    footer:        { position: 'absolute', left: 52, right: 52, bottom: 36, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 10 },
    footerTxt:     { fontSize: 7, color: MUTED, lineHeight: 1.6 },
    footerTagline: { fontSize: 7.5, color: primary, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  })
}
