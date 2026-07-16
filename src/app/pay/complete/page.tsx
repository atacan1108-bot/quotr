/**
 * Where Mollie sends the client back after a checkout attempt (paid,
 * failed, or abandoned). Deliberately generic and STATELESS — it does not
 * look up the invoice or show a real payment status. Per Mollie's own
 * documented security model, redirect-time query params are never
 * authoritative (only a re-fetch of the payment from Mollie's API is —
 * see the webhook route), so this page must never claim "payment
 * successful" from anything the browser handed it. The invoice's actual
 * status is confirmed separately by the webhook; this page exists purely
 * so the client has somewhere pleasant to land. No login required (see
 * src/proxy.ts's isPublicPage) — the client has no Quotr account.
 */
type Props = {
  searchParams: Promise<{ invoice?: string }>
}

export default async function PaymentCompletePage({ searchParams }: Props) {
  const { invoice } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-border p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-on-surface mb-2">
          Bedankt! / Thank you!
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          {invoice
            ? <>We hebben je betaling voor factuur <strong>{invoice}</strong> ontvangen en verwerken deze nu.<br /><br />We&apos;ve received your payment for invoice <strong>{invoice}</strong> and are processing it now.</>
            : <>We verwerken je betaling.<br /><br />We&apos;re processing your payment.</>
          }
        </p>
        <p className="text-xs text-muted mt-4">
          De ontvanger bevestigt de betaling zodra deze is verwerkt. / The recipient will confirm receipt once it&apos;s processed.
        </p>
      </div>
    </div>
  )
}
