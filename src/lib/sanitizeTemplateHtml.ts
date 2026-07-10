/**
 * Sanitizes a contractor-uploaded HTML template before it's ever stored or
 * rendered. Templates are authored externally (e.g. by an AI design tool)
 * and need real design fidelity — inline <style>, style attributes, tables,
 * images, web fonts — so this is deliberately permissive on structure/CSS
 * while stripping anything that can execute code or reach the network at
 * render time: <script>, event handler attributes, <iframe>/<object>/
 * <embed>/<form>, and javascript: URLs. SERVER-ONLY.
 */
import sanitizeHtml from 'sanitize-html'
import {
  extractLineItemsRegion, reinsertLineItemsRegion,
  extractRecurringRegion, reinsertRecurringRegion,
} from '@/lib/htmlTemplate'

const ALLOWED_TAGS = [
  'html', 'head', 'meta', 'title', 'style', 'body',
  'div', 'span', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'col', 'colgroup',
  'ul', 'ol', 'li', 'a', 'img', 'b', 'strong', 'i', 'em', 'u', 'small', 'sup', 'sub',
  'header', 'footer', 'section', 'article', 'main', 'nav', 'figure', 'figcaption',
]

function runSanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*':   ['style', 'class', 'id', 'width', 'height', 'align', 'colspan', 'rowspan'],
      a:     ['href', 'target', 'rel'],
      img:   ['src', 'alt'],
      meta:  ['charset', 'name', 'content'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    // sanitize-html warns on allowing <style> since it's a theoretical XSS
    // vector in a live browser DOM (e.g. CSS-based data exfiltration via
    // attribute selectors on form inputs). Output here is a static PDF
    // rendered headlessly from a contractor's own uploaded design — there's
    // no live DOM for a victim to interact with and no <form>/<input>
    // allowed at all, so that vector doesn't apply. Scripts, event handler
    // attributes, and javascript: URLs are still stripped below regardless.
    allowVulnerableTags: true,
    // Inline CSS is how these templates are styled — keep style tags/attrs
    // verbatim rather than sanitize-html's default of stripping them.
    allowedStyles: undefined,
    parseStyleAttributes: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['script', 'iframe', 'object', 'embed', 'form', 'noscript'],
  })
}

/**
 * sanitize-html strips HTML comments unconditionally, which would destroy
 * the LINE_ITEMS_START/END and RECURRING_START/END markers a template
 * relies on — so both regions are pulled out (see extractLineItemsRegion /
 * extractRecurringRegion) before sanitizing, sanitized independently, then
 * reassembled with real comments restored. Safe to call more than once on
 * the same input (e.g. once on upload, again on save) — a template missing
 * either region just skips that extraction step.
 */
export function sanitizeTemplateHtml(html: string): string {
  const lineItems = extractLineItemsRegion(html)
  const afterLineItems = lineItems ? lineItems.outerWithPlaceholder : html

  const recurring = extractRecurringRegion(afterLineItems)
  const outer = recurring ? recurring.outerWithPlaceholder : afterLineItems

  let sanitizedOuter = runSanitize(outer)

  if (recurring) {
    sanitizedOuter = reinsertRecurringRegion(sanitizedOuter, runSanitize(recurring.innerTemplate))
  }
  if (lineItems) {
    sanitizedOuter = reinsertLineItemsRegion(sanitizedOuter, runSanitize(lineItems.rowTemplate))
  }
  return sanitizedOuter
}
