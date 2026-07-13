'use client'

import { useState } from 'react'
import type { Locale } from '@/i18n/config'
import InvoiceGeneratePdfSection from './InvoiceGeneratePdfSection'
import EmailInvoiceSection from './EmailInvoiceSection'

interface Props {
  invoiceId: string
  initialPdfUrl: string | null
  locale: Locale
  initialEmailSentTo: string | null
  initialSentAt: string | null
}

/** Same reasoning as QuotePdfAndEmail.tsx — shared client-side pdfUrl state
 * so EmailInvoiceSection appears right after a PDF is generated, no reload. */
export default function InvoicePdfAndEmail({ invoiceId, initialPdfUrl, locale, initialEmailSentTo, initialSentAt }: Props) {
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl)

  return (
    <>
      <InvoiceGeneratePdfSection invoiceId={invoiceId} initialPdfUrl={initialPdfUrl} onGenerated={setPdfUrl} />
      <EmailInvoiceSection
        invoiceId={invoiceId}
        pdfUrl={pdfUrl}
        locale={locale}
        initialEmailSentTo={initialEmailSentTo}
        initialSentAt={initialSentAt}
      />
    </>
  )
}
