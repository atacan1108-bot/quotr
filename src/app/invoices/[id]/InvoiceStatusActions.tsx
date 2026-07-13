'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { InvoiceStatus } from '@/lib/invoicing/types'

export default function InvoiceStatusActions({
  invoiceId,
  currentStatus,
}: {
  invoiceId: string
  currentStatus: InvoiceStatus
}) {
  const router   = useRouter()
  const supabase = createClient()
  const t = useTranslations('invoiceStatusActions')
  const [loading, setLoading] = useState(false)

  async function markAsSent() {
    setLoading(true)
    try {
      const { error } = await supabase.rpc('assign_invoice_number', { p_invoice_id: invoiceId })
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err) {
      alert(t('markSentFailed', { message: (err as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  async function markAsPaid() {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', invoiceId)
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err) {
      alert(t('markPaidFailed', { message: (err as Error).message }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-border px-4 py-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-2">

        {currentStatus === 'draft' && (
          <button
            onClick={markAsSent}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading ? t('updating') : t('markAsSent')}
          </button>
        )}

        {currentStatus === 'sent' && (
          <button
            onClick={markAsPaid}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading ? t('updating') : t('markAsPaid')}
          </button>
        )}

        <button
          onClick={() => window.print()}
          className="w-full h-11 rounded-xl border border-border text-sm font-medium text-on-surface hover:bg-surface active:bg-surface active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
          </svg>
          {t('print')}
        </button>

      </div>
    </div>
  )
}
