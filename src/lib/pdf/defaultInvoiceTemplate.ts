/**
 * The built-in invoice design — code-authored (not contractor-uploaded), so
 * it goes through fillInvoiceTemplate() directly with no sanitize-html pass.
 * Visual language matches the live quote template exactly (teal banner,
 * Archivo font, same accent color) so an invoice looks like it belongs to
 * the same document family as a contractor's quotes. The banner/body colors
 * below are the DEFAULTS — buildInvoiceTemplateData() overrides them with
 * the contractor's real rate_cards.branding.primaryColor/accentColor via a
 * small inline <style> block spliced in before the token fill (see there),
 * so this one static template still reflects real per-contractor branding.
 *
 * Same token/region contract as the quote template (see htmlTemplate.ts's
 * file header) plus one addition: VAT_BREAKDOWN, a second repeating region
 * for the "amount per VAT rate" table (0-3 rows for NL rates 21/9/0, empty
 * when reverse-charged).
 */
export const DEFAULT_INVOICE_TEMPLATE_HTML = `
<html>
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; background: #ffffff; font-family: "Archivo", sans-serif; }
  a { color: var(--accent, #31859c); text-decoration: none; }
  /* No logo uploaded yet — {{business_logo}} resolves to an empty src,
     which would otherwise render as an empty/broken-image box. Hide the
     whole badge rather than show nothing inside it. !important is required
     because the badge div sets display:flex as an INLINE style, which
     otherwise always wins over a plain stylesheet rule. */
  .logo-img[src=""] { display: none; }
  .logo-badge:has(> img[src=""]) { display: none !important; }
  /* Optional one-line details that are blank when not applicable (client
     BTW/KvK, the discount row, the footer note) — hidden entirely rather
     than shown as an empty styled line. */
  .opt-line:empty { display: none; }
</style>
</head>
<body>
  <div style="width:100%;background:#ffffff;box-sizing:border-box;display:flex;flex-direction:column;font-family:'Archivo',sans-serif;color:#26333a;">

    <div style="background:var(--primary, #215968);color:#ffffff;padding:36px 56px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:18px;">
        <div class="logo-badge" style="width:62px;height:62px;background:#ffffff;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img class="logo-img" src="{{business_logo}}" alt="Logo" style="width:52px;height:52px;object-fit:contain;" /></div>
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:0.04em;">{{business_name}}</div>
          <div style="font-size:11px;font-weight:600;letter-spacing:0.3em;color:var(--accent-light, #8fd0e2);margin-top:3px;">{{business_website}}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;">{{lbl_invoice}}</div>
        <div style="font-size:13px;color:var(--accent-light, #8fd0e2);font-weight:600;margin-top:2px;">{{lbl_invoice_number}} {{invoice_number}}</div>
      </div>
    </div>
    <div style="height:5px;background:var(--accent, #4bacc6);"></div>

    <!-- PAID_START -->
    <div style="background:#0f766e;color:#ffffff;text-align:center;padding:8px;font-size:13px;font-weight:800;letter-spacing:0.2em;">{{paid_stamp}}</div>
    <!-- PAID_END -->

    <div style="padding:28px 56px 32px;display:flex;flex-direction:column;flex:1;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;">
        <div>
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.18em;color:var(--accent, #4bacc6);margin-bottom:8px;text-transform:uppercase;">{{lbl_client}}</div>
          <div style="font-size:13.5px;line-height:1.6;"><strong>{{customer_name}}</strong><br />{{customer_address}}</div>
          <div class="opt-line" style="font-size:11.5px;color:#5a686e;margin-top:4px;">{{customer_extra_line}}</div>
        </div>
        <div>
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.18em;color:var(--accent, #4bacc6);margin-bottom:8px;text-transform:uppercase;">{{lbl_from}}</div>
          <div style="font-size:13.5px;line-height:1.6;"><strong>{{business_name}}</strong><br />{{business_address}}</div>
        </div>
        <div>
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.18em;color:var(--accent, #4bacc6);margin-bottom:8px;text-transform:uppercase;">{{lbl_details}}</div>
          <div style="font-size:13.5px;line-height:1.6;">{{lbl_invoice_number}}: <strong>{{invoice_number}}</strong><br />{{lbl_invoice_date}}: <strong>{{invoice_date}}</strong><br />{{lbl_due_date}}: <strong>{{due_date}}</strong></div>
        </div>
      </div>

      <div style="margin-top:24px;border-radius:10px;overflow:hidden;border:1px solid #d7e2e6;">
        <div style="display:grid;grid-template-columns:1fr 90px 100px 60px 110px;gap:16px;background:var(--primary, #215968);color:#ffffff;padding:12px 20px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
          <div>{{lbl_description}}</div><div style="text-align:right;">{{lbl_quantity}}</div><div style="text-align:right;">{{lbl_rate}}</div><div style="text-align:right;">{{lbl_vat_column}}</div><div style="text-align:right;">{{lbl_amount}}</div>
        </div>
        <!-- LINE_ITEMS_START -->
        <div style="display:grid;grid-template-columns:1fr 90px 100px 60px 110px;gap:16px;padding:16px 20px;background:#ffffff;border-bottom:1px solid #e6edef;">
          <div style="font-size:14px;font-weight:700;">{{item_label}}</div>
          <div style="text-align:right;font-size:14px;color:#5a686e;">{{item_quantity}}</div>
          <div style="text-align:right;font-size:14px;color:#5a686e;">{{item_unit_price}}</div>
          <div style="text-align:right;font-size:14px;color:#5a686e;">{{item_vat_rate}}</div>
          <div style="text-align:right;font-size:14px;font-weight:700;color:var(--primary, #215968);">{{item_total}}</div>
        </div>
        <!-- LINE_ITEMS_END -->
      </div>

      <div style="display:flex;justify-content:flex-end;margin-top:18px;">
        <div style="width:320px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;font-size:13.5px;color:#5a686e;">
            <div>{{lbl_subtotal}}</div><div>{{subtotal}}</div>
          </div>
          <!-- DISCOUNT_START -->
          <div style="display:flex;justify-content:space-between;font-size:13.5px;color:#5a686e;">
            <div>{{lbl_discount}}</div><div>&minus; {{discount_amount}}</div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;color:#5a686e;">
            <div>{{lbl_taxable_subtotal}}</div><div>{{taxable_subtotal}}</div>
          </div>
          <!-- DISCOUNT_END -->

          <!-- REVERSE_CHARGE_START -->
          <div class="opt-line" style="font-size:12px;color:#5a686e;font-style:italic;padding:4px 0;">{{reverse_charge_note}}</div>
          <!-- REVERSE_CHARGE_END -->

          <!-- VAT_BREAKDOWN_START -->
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#5a686e;">
            <div>{{vat_rate_label}} <span style="opacity:0.7;">({{vat_base}})</span></div><div>{{vat_row_amount}}</div>
          </div>
          <!-- VAT_BREAKDOWN_END -->

          <div style="display:flex;justify-content:space-between;align-items:center;background:var(--primary, #215968);color:#ffffff;border-radius:8px;padding:12px 16px;margin-top:4px;">
            <div style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">{{lbl_amount_due}}</div>
            <div style="font-size:19px;font-weight:800;">{{total}}</div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:24px;margin-top:24px;break-inside:avoid;page-break-inside:avoid;">
        <div style="flex:1;background:#f6fafb;border:1px solid #d7e2e6;border-radius:10px;padding:16px 22px;">
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.18em;color:var(--accent, #4bacc6);text-transform:uppercase;">{{lbl_payment_details}}</div>
          <div style="font-size:13.5px;line-height:1.7;margin-top:8px;">
            {{lbl_iban}}: <strong>{{iban}}</strong><br />
            {{lbl_account_holder}}: <strong>{{account_holder}}</strong><br />
            {{lbl_payment_reference}}: <strong>{{payment_reference}}</strong>
          </div>
        </div>
      </div>

      <p class="opt-line" style="margin-top:14px;font-size:12px;color:#5a686e;line-height:1.6;break-inside:avoid;page-break-inside:avoid;">{{note_text}}</p>
    </div>
  </div>
</body>
</html>
`

/**
 * Splices a `:root { --primary: ...; --accent: ... }` override into the
 * template's <head> — the template's own CSS reads these via
 * `var(--primary, #215968)`, so with no override it just falls back to the
 * default teal shown above; with one, the whole document picks up the
 * contractor's real rate_cards.branding.primaryColor/accentColor. A plain
 * string splice, not a token — this runs before fillInvoiceTemplate(), on
 * the raw template, since colors aren't part of the {{token}} data model.
 */
export function injectInvoiceBrandColors(html: string, primaryColor: string | null | undefined, accentColor: string | null | undefined): string {
  if (!primaryColor && !accentColor) return html
  const primary = primaryColor || '#215968'
  const accent  = accentColor || '#4bacc6'
  const style = `<style>:root{--primary:${cssColor(primary)};--accent:${cssColor(accent)};--accent-light:${cssColor(accent)};}</style>`
  return html.replace('</head>', `${style}</head>`)
}

/** Defensive allowlist — only accepts a #hex color, so this can never inject
 * arbitrary CSS/HTML even though branding.primaryColor ultimately comes from
 * a contractor-controlled settings field. */
function cssColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#215968'
}
