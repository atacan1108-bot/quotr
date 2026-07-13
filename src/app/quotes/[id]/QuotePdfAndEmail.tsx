'use client'

import { useState } from 'react'
import type { Locale } from '@/i18n/config'
import GeneratePdfSection from './GeneratePdfSection'
import EmailQuoteSection from './EmailQuoteSection'

interface Props {
  jobId: string
  initialPdfUrl: string | null
  locale: Locale
  initialEmailSentAt: string | null
  initialEmailSentTo: string | null
}

/**
 * Holds the one piece of state GeneratePdfSection and EmailQuoteSection both
 * need to agree on: whether a PDF exists yet. The quote detail page is a
 * Server Component, so it can only pass each child its server-rendered
 * initialPdfUrl — that's stale the moment GeneratePdfSection generates a
 * fresh one client-side. This wrapper is the shared client-side source of
 * truth so EmailQuoteSection appears immediately after a PDF is built,
 * with no page reload.
 */
export default function QuotePdfAndEmail({ jobId, initialPdfUrl, locale, initialEmailSentAt, initialEmailSentTo }: Props) {
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl)

  return (
    <>
      <GeneratePdfSection jobId={jobId} initialPdfUrl={initialPdfUrl} onGenerated={setPdfUrl} />
      <EmailQuoteSection
        jobId={jobId}
        pdfUrl={pdfUrl}
        locale={locale}
        initialEmailSentAt={initialEmailSentAt}
        initialEmailSentTo={initialEmailSentTo}
      />
    </>
  )
}
