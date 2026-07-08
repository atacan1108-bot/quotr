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
import { headers } from 'next/headers'
import { getQuoteExportData } from '@/lib/quoteData'

// Dutch euro format: € 1.234,56
const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

const fmtDate = (s: string) =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s))

const TEAL = '0F766E'   // docx uses hex without '#'

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { fill: TEAL },
    borders: noBorders(),
    children: [
      new Paragraph({
        children: [new TextRun({ text, color: 'FFFFFF', bold: true, size: 16 })],
      }),
    ],
  })
}

function bodyCell(text: string, opts: { bold?: boolean; right?: boolean; muted?: boolean } = {}): TableCell {
  return new TableCell({
    borders: bottomBorder(),
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold:  opts.bold,
            color: opts.muted ? '6E7580' : '1C1C1E',
            size:  18,
          }),
        ],
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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const headersList = await headers()
  const host    = headersList.get('host') ?? 'localhost:3000'
  const proto   = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  const data = await getQuoteExportData(id, baseUrl)
  if (!data) {
    return new Response('Quote not found or not authorised', { status: 404 })
  }

  const { job, rateCard, breakdown, shareUrl } = data
  const client = job.clients

  const TYPE_LABEL: Record<string, string> = {
    labour: 'Arbeid', material: 'Materiaal', fixed: 'Vast',
  }

  // ── Build the document ─────────────────────────────────────────────────────

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: '1C1C1E' },
        },
      },
    },
    sections: [{
      children: [

        // ── Business header
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text:  rateCard.business_name ?? 'Quotr',
              color: TEAL,
              bold:  true,
              size:  36,
            }),
          ],
        }),

        ...(rateCard.business_address ? [
          new Paragraph({
            children: [new TextRun({ text: rateCard.business_address, color: '6E7580', size: 18 })],
          }),
        ] : []),

        ...(rateCard.business_email ? [
          new Paragraph({
            children: [new TextRun({ text: rateCard.business_email, color: '6E7580', size: 18 })],
            spacing: { after: 240 },
          }),
        ] : [
          new Paragraph({ text: '', spacing: { after: 240 } }),
        ]),

        // ── OFFERTE heading + date
        new Paragraph({
          children: [
            new TextRun({ text: 'OFFERTE', bold: true, size: 28, color: '1C1C1E' }),
            new TextRun({ text: `   ${fmtDate(job.created_at)}`, color: '6E7580', size: 20 }),
          ],
          spacing: { after: 160 },
        }),

        // ── Client details
        ...(client ? [
          new Paragraph({
            children: [new TextRun({ text: 'KLANT', bold: true, size: 16, color: '6E7580' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: client.name, bold: true, size: 22 })],
          }),
          ...(client.email   ? [new Paragraph({ children: [new TextRun({ text: client.email,   size: 20 })] })] : []),
          ...(client.phone   ? [new Paragraph({ children: [new TextRun({ text: client.phone,   size: 20 })] })] : []),
          ...(client.address ? [new Paragraph({ children: [new TextRun({ text: client.address, size: 20 })] })] : []),
        ] : []),

        // ── Job title
        new Paragraph({
          children: [
            new TextRun({ text: 'WERKZAAMHEDEN  ', bold: true, size: 16, color: '6E7580' }),
            new TextRun({ text: job.title, size: 22 }),
          ],
          spacing: { before: 240, after: 320 },
        }),

        // ── Line items table
        new Paragraph({
          children: [new TextRun({ text: 'REGELPOSTEN', bold: true, size: 16, color: '6E7580' })],
          spacing: { after: 80 },
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header row
            new TableRow({
              tableHeader: true,
              children: [
                headerCell('Omschrijving'),
                headerCell('Type'),
                headerCell('Aantal'),
                headerCell('Bedrag'),
              ],
            }),

            // One row per priced item — amounts from pricing engine only
            ...breakdown.items.map(item =>
              new TableRow({
                children: [
                  // Description + optional markup note for materials
                  new TableCell({
                    borders: bottomBorder(),
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: item.label, size: 18 })],
                      }),
                      ...(item.type === 'material' && item.markup_amount > 0 ? [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${euro(item.base_cost)} + ${rateCard.material_markup_percent}% markup`,
                              color: '6E7580', size: 16,
                            }),
                          ],
                        }),
                      ] : []),
                    ],
                  }),
                  bodyCell(TYPE_LABEL[item.type] ?? item.type),
                  bodyCell(
                    item.type === 'labour' ? `${item.quantity} u` : `${item.quantity} st`,
                    { right: true },
                  ),
                  bodyCell(euro(item.line_total), { bold: true, right: true }),
                ],
              })
            ),
          ],
        }),

        // ── Totals block
        new Paragraph({ text: '', spacing: { after: 160 } }),

        ...(breakdown.labour_total > 0 ? [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Arbeid: ${euro(breakdown.labour_total)}`, size: 18, color: '6E7580' }),
            ],
          }),
        ] : []),

        ...(breakdown.material_total > 0 ? [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Materiaal: ${euro(breakdown.material_total)}`, size: 18, color: '6E7580' }),
            ],
          }),
        ] : []),

        ...(breakdown.fixed_total > 0 ? [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Vast: ${euro(breakdown.fixed_total)}`, size: 18, color: '6E7580' }),
            ],
          }),
        ] : []),

        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `Subtotaal (excl. BTW): ${euro(breakdown.subtotal)}`, size: 18, color: '6E7580' }),
          ],
        }),

        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: `BTW ${breakdown.vat_percent}%: ${euro(breakdown.vat_amount)}`,
              size: 18, color: '6E7580',
            }),
          ],
        }),

        // Grand total — prominent
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 80, after: 320 },
          children: [
            new TextRun({
              text: `Totaal incl. BTW: ${euro(breakdown.total)}`,
              bold: true, size: 26, color: TEAL,
            }),
          ],
        }),

        // ── Share URL footer
        ...(shareUrl ? [
          new Paragraph({
            children: [
              new TextRun({ text: 'Bekijk en accepteer online: ', size: 18, color: '6E7580' }),
              new TextRun({ text: shareUrl, size: 18, color: TEAL }),
            ],
          }),
        ] : []),

        new Paragraph({
          children: [
            new TextRun({
              text: `Gegenereerd met Quotr · Alle prijzen in euro (€) · BTW ${breakdown.vat_percent}%`,
              size: 16, color: '6E7580',
            }),
          ],
          spacing: { before: 80 },
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)

  const safeName = job.title
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="offerte-${safeName}.docx"`,
      'Cache-Control':       'no-store',
    },
  })
}
