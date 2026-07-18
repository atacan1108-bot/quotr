/**
 * Builds the HTML string handed to Puppeteer's real, repeating page footer
 * (page.pdf's footerTemplate option — see src/lib/pdf/renderHtmlPdf.ts).
 * Chrome renders this fresh on EVERY physical PDF page itself, using its
 * own <span class="pageNumber">/<span class="totalPages"> placeholders —
 * this is what makes the footer land at the bottom of every page reliably,
 * unlike a footer baked into the template's own HTML flow (which only ever
 * ends up wherever that content naturally falls).
 *
 * Puppeteer does NOT resolve {{token}} placeholders in a footerTemplate —
 * it's plain HTML rendered by Chrome directly — so every value here must
 * already be a resolved, HTML-escaped string, not a template token.
 */
import type { TemplateData } from '@/lib/htmlTemplate'
import { escapeHtml } from '@/lib/htmlTemplate'
import { pdfLabels } from '@/lib/pdf/pdfLabels'
import { STIPT_PDF_FONT_CSS } from './pdfFonts'
import type { Locale } from '@/i18n/config'

/** Reserve this much bottom margin on every page for the footer — see
 * renderHtmlToPdf's footerHeight option. Matches the footer's own rendered
 * height (two lines + a divider) with a little breathing room. */
export const FOOTER_HEIGHT = '78px'

export function buildFooterTemplate(data: TemplateData, locale: Locale): string {
  const l = pdfLabels(locale)

  const businessLine = [data.business_name, data.business_address, data.business_phone, data.business_email]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &middot; ')

  const identityLine = [
    data.business_kvk ? `KvK ${escapeHtml(data.business_kvk)}` : '',
    data.business_btw ? `BTW ${escapeHtml(data.business_btw)}` : '',
    data.business_iban ? `IBAN ${escapeHtml(data.business_iban)}` : '',
  ].filter(Boolean).join(' &middot; ')

  // "pagina <span class="pageNumber"></span> van <span class="totalPages"></span>"
  // — same wording as pdfLabels' pageOf template, just with Chrome's own
  // auto-populated spans standing in for the {current}/{total} numbers,
  // since only Chrome knows the real page count at render time.
  const pageOf = l.pageOf
    .replace('{current}', '<span class="pageNumber"></span>')
    .replace('{total}', '<span class="totalPages"></span>')

  // Puppeteer's footerTemplate is its OWN isolated mini-document — it does
  // not inherit the main page's <head>/<style>, so the fonts have to be
  // embedded again here, not just once on the main template.
  return `
    <style>${STIPT_PDF_FONT_CSS}</style>
    <div style="width:100%;font-family:var(--font-body);font-size:11px;color:var(--steen-700, #575751);padding:0 56px;box-sizing:border-box;-webkit-print-color-adjust:exact;">
      <div style="display:flex;justify-content:flex-end;padding-bottom:6px;font-size:12px;">${escapeHtml(l.initials)}: ______</div>
      <div style="border-top:2px solid var(--primary, #0F766E);padding-top:8px;display:flex;justify-content:space-between;align-items:baseline;font-weight:500;gap:16px;">
        <div>${businessLine}${identityLine ? ` &middot; <span style="font-family:var(--font-mono);">${identityLine}</span>` : ''}</div>
        <div style="white-space:nowrap;font-family:var(--font-mono);">${pageOf}</div>
      </div>
    </div>
  `
}
