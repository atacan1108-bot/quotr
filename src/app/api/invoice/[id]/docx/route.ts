/**
 * Word (.docx) export for an invoice — hand-built with the `docx` package,
 * no template system, same as /api/quote/[id]/docx. Reuses getInvoiceExportData
 * (the same fresh-recompute-from-stored-inputs data source the PDF route
 * uses) and pdfLabels' invoice-only keys.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getInvoiceExportData } from '@/lib/invoiceData'
import type { InvoiceExportData } from '@/lib/invoiceData'
import { pdfLabels, typeMeta, vatLabel } from '@/lib/pdf/pdfLabels'
import type { ItemType } from '@/lib/pricing'

// Money formatting stays nl-NL style regardless of invoice language, same
// convention as the quote DOCX route's own local euro().
const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const TEAL = '215968'

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { fill: TEAL },
    borders: noBorders(),
    children: [new Paragraph({ children: [new TextRun({ text, color: 'FFFFFF', bold: true, size: 16 })] })],
  })
}

function bodyCell(text: string, opts: { bold?: boolean; right?: boolean } = {}): TableCell {
  return new TableCell({
    borders: bottomBorder(),
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, color: '1C1C1E', size: 18 })],
      }),
    ],
  })
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

function bottomBorder() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'E5E5E3' }
  return { top: none, bottom: line, left: none, right: none }
}

function rightText(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 18, color: opts.color ?? '6E7580' })],
  })
}

/** Pure builder — no data fetching, no Next.js request context — so it can
 * be exercised directly in tests/scripts with a hand-built InvoiceExportData,
 * the same way the PDF pipeline's buildInvoiceTemplateData is verified. */
export function buildInvoiceDocx(data: InvoiceExportData): Document {
  const { invoice, rateCard, breakdown } = data
  const locale = invoice.language
  const l = pdfLabels(locale)

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '1C1C1E' } } } },
    sections: [{
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: rateCard.business_name ?? 'Quotr', color: TEAL, bold: true, size: 36 })],
        }),
        ...(rateCard.business_address ? [
          new Paragraph({ children: [new TextRun({ text: rateCard.business_address, color: '6E7580', size: 18 })] }),
        ] : []),
        new Paragraph({
          children: [new TextRun({ text: rateCard.business_email ?? '', color: '6E7580', size: 18 })],
          spacing: { after: 240 },
        }),

        new Paragraph({
          children: [
            new TextRun({ text: l.invoice.toUpperCase(), bold: true, size: 28, color: '1C1C1E' }),
            new TextRun({ text: `   ${invoice.invoice_number ?? ''}`, color: '6E7580', size: 20 }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${l.invoiceDate}: `, size: 18, color: '6E7580' }),
            new TextRun({ text: invoice.invoice_date, size: 18 }),
            new TextRun({ text: `   ${l.dueDate}: `, size: 18, color: '6E7580' }),
            new TextRun({ text: invoice.due_date, size: 18 }),
          ],
          spacing: { after: 160 },
        }),

        // ── Client details
        new Paragraph({ children: [new TextRun({ text: l.client.toUpperCase(), bold: true, size: 16, color: '6E7580' })] }),
        new Paragraph({ children: [new TextRun({ text: invoice.client_name, bold: true, size: 22 })] }),
        ...(invoice.client_address ? [new Paragraph({ children: [new TextRun({ text: invoice.client_address, size: 20 })] })] : []),
        ...(invoice.client_email ? [new Paragraph({ children: [new TextRun({ text: invoice.client_email, size: 20 })] })] : []),
        ...(invoice.client_btw ? [new Paragraph({ children: [new TextRun({ text: `${l.clientVatNumber}: ${invoice.client_btw}`, size: 18, color: '6E7580' })] })] : []),
        ...(invoice.client_kvk ? [new Paragraph({ children: [new TextRun({ text: `${l.clientKvkNumber}: ${invoice.client_kvk}`, size: 18, color: '6E7580' })] })] : []),

        new Paragraph({ text: '', spacing: { after: 240 } }),

        // ── Line items table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [headerCell(l.description), headerCell(l.quantity), headerCell(l.rate), headerCell(l.vatShort), headerCell(l.amount)],
            }),
            ...breakdown.items.map((item, i) => {
              const isText = invoice.line_items[i]?.type === 'text'
              return new TableRow({
                children: [
                  bodyCell(item.label),
                  bodyCell(isText ? '' : typeMeta(locale, item.type as ItemType, item.quantity), { right: true }),
                  bodyCell(isText ? '' : euro(item.unit_cost), { right: true }),
                  bodyCell(isText ? '' : `${item.vat_rate}%`, { right: true }),
                  bodyCell(isText ? '' : euro(item.line_total), { bold: true, right: true }),
                ],
              })
            }),
          ],
        }),

        new Paragraph({ text: '', spacing: { after: 160 } }),

        rightText(`${l.subtotal}: ${euro(breakdown.subtotal)}`),
        ...(breakdown.discount_amount > 0 ? [
          rightText(`${l.discountLabel}: -${euro(breakdown.discount_amount)}`),
          rightText(`${l.subtotalExclVat}: ${euro(breakdown.taxable_subtotal)}`),
        ] : []),
        ...(invoice.reverse_charge ? [
          rightText(l.reverseChargeNote),
        ] : breakdown.vat_breakdown.map(row =>
          rightText(`${vatLabel(locale, row.vat_rate)}: ${euro(row.vat_amount)}`),
        )),

        rightText(`${l.amountDue}: ${euro(breakdown.total)}`, { bold: true, size: 26, color: TEAL }),

        new Paragraph({ text: '', spacing: { before: 320, after: 80 } }),
        new Paragraph({ children: [new TextRun({ text: l.paymentDetails.toUpperCase(), bold: true, size: 16, color: '6E7580' })] }),
        new Paragraph({ children: [new TextRun({ text: `${l.iban}: ${rateCard.branding?.iban ?? ''}`, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: `${l.accountHolder}: ${rateCard.branding?.accountHolderName ?? rateCard.business_name ?? ''}`, size: 18 })] }),
        new Paragraph({ children: [new TextRun({ text: `${l.paymentReference}: ${invoice.payment_reference ?? invoice.invoice_number ?? ''}`, size: 18 })] }),

        ...(invoice.note_text ? [
          new Paragraph({
            children: [new TextRun({ text: invoice.note_text, size: 18, color: '6E7580' })],
            spacing: { before: 160 },
          }),
        ] : []),
      ],
    }],
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const data = await getInvoiceExportData(id)
  if (!data) {
    const tApi = await getTranslations('generateInvoicePdfApi')
    return new Response(tApi('invoiceNotFound'), { status: 404 })
  }

  const doc = buildInvoiceDocx(data)
  const buffer = await Packer.toBuffer(doc)
  const l = pdfLabels(data.invoice.language)

  const safeName = (data.invoice.invoice_number ?? data.invoice.client_name)
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${l.invoice.toLowerCase()}-${safeName}.docx"`,
      'Cache-Control': 'no-store',
    },
  })
}
