'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const t = useTranslations('auth.forgotPassword')
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [sent,    setSent]    = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      // Rate limiting is the one case worth surfacing distinctly — everything
      // else (including "no account with that email") stays the same generic
      // confirmation below, so this form never reveals whether an email is registered.
      if (error.message.toLowerCase().includes('rate limit')) {
        setError(t('rateLimited'))
        return
      }
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-on-surface mb-2">{t('checkInboxTitle')}</h1>
          <p className="text-sm text-muted mb-6">
            {t.rich('checkInboxBody', { email, b: chunks => <strong>{chunks}</strong> })}
          </p>
          <Link href="/login" className="inline-flex h-12 px-6 items-center rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 transition">
            {t('toLogin')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        <div className="flex items-center justify-center mb-10">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
            <span className="text-white text-xl font-bold tracking-tight">Q</span>
          </div>
          <span className="ml-3 text-2xl font-semibold text-on-surface tracking-tight">Quotr</span>
        </div>

        <h1 className="text-xl font-semibold text-on-surface mb-1">{t('title')}</h1>
        <p className="text-sm text-muted mb-8">{t('subtitle')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="email">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-12 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 transition disabled:opacity-60 mt-2"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          <Link href="/login" className="text-teal-500 font-medium hover:text-teal-700">
            {t('backToLogin')}
          </Link>
        </p>

      </div>
    </div>
  )
}
