import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getQuoteExportData } from '@/lib/quoteData'
import { QuotePDF } from '@/app/quotes/[id]/QuotePDF'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const headersList = await headers()
  const host  = headersList.get('host') ?? 'localhost:3000'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  const data = await getQuoteExportData(id, baseUrl)
  if (!data) {
    const tErrors = await getTranslations('errors')
    return new Response(tErrors('quoteNotFoundOrUnauthorized'), { status: 404 })
  }

  const buffer = await renderToBuffer(<QuotePDF data={data} />)

  const safeName = data.job.title
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="offerte-${safeName}.pdf"`,
      'Cache-Control':       'no-store',
    },
  })
}
