'use client'

/**
 * Landing page for the link in the "forgot password" email.
 *
 * Supabase can hand this page a working session in three different shapes
 * depending on how the project's email template is configured, so all
 * three are handled rather than assumed:
 *  1. Hash-fragment tokens (#access_token=...&type=recovery) — Supabase's
 *     classic hosted-verify redirect. Picked up automatically by the
 *     browser client's detectSessionInUrl, which fires a PASSWORD_RECOVERY
 *     auth event once it's processed.
 *  2. ?token_hash=...&type=recovery — Supabase's newer direct-link email
 *     template format. Verified explicitly here via verifyOtp().
 *  3. ?code=... — PKCE-style link. Exchanged explicitly via
 *     exchangeCodeForSession().
 * If Supabase's own hosted verification failed (expired/used link) before
 * any of the above ever reaches this page, it appends
 * ?error_description=... instead — surfaced directly rather than treated
 * as a timeout.
 */
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/client'

type Phase = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done'

const ACCENT = '#0F766E'

function ResetPasswordInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth.resetPassword')

  const [phase, setPhase]               = useState<Phase>('verifying')
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  const [password, setPassword]         = useState('')
  const [confirm, setConfirm]           = useState('')
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !cancelled) setPhase('ready')
    })

    async function establishSession() {
      // Supabase's own hosted verification can fail (expired/used link)
      // before ever reaching a session — surfaced directly rather than
      // left to time out.
      const errorDescription = searchParams.get('error_description')
      if (errorDescription) {
        if (!cancelled) {
          setInvalidReason(errorDescription.replace(/\+/g, ' '))
          setPhase('invalid')
        }
        return
      }

      // Covers the case where the hash was already processed (and the
      // event already fired) before this listener attached.
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (existing) {
        if (!cancelled) setPhase(p => (p === 'verifying' ? 'ready' : p))
        return
      }

      const tokenHash = searchParams.get('token_hash')
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (!cancelled) setPhase(error ? 'invalid' : 'ready')
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!cancelled) setPhase(error ? 'invalid' : 'ready')
        return
      }
      // Nothing usable in the URL yet — the hash-based listener above may
      // still fire; the timeout below covers the case where it never does.
    }
    establishSession()

    const timeout = setTimeout(() => {
      if (!cancelled) setPhase(p => (p === 'verifying' ? 'invalid' : p))
    }, 5000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase, searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError(t('tooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('mismatch'))
      return
    }

    setPhase('saving')
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setPhase('ready')
      return
    }

    setPhase('done')
    setTimeout(() => router.push('/login'), 1800)
  }

  if (phase === 'verifying') {
    return (
      <Shell>
        <p className="text-sm text-muted text-center">{t('verifying')}</p>
      </Shell>
    )
  }

  if (phase === 'invalid') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-on-surface mb-2 text-center">{t('invalidTitle')}</h1>
        <p className="text-sm text-muted mb-6 text-center">
          {invalidReason || t('invalidBodyDefault')}
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-12 px-6 items-center justify-center w-full rounded-xl text-white font-semibold text-sm transition"
          style={{ backgroundColor: ACCENT }}
        >
          {t('requestNewLink')}
        </Link>
      </Shell>
    )
  }

  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-sm font-medium text-center" style={{ color: ACCENT }}>
          {t('successMessage')}
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-on-surface mb-1">{t('title')}</h1>
      <p className="text-sm text-muted mb-8">{t('subtitle')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="password">
            {t('newPassword')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full h-12 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            placeholder={t('passwordPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="confirm">
            {t('confirmPassword')}
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full h-12 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
            placeholder={t('confirmPlaceholder')}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={phase === 'saving'}
          className="h-12 w-full rounded-xl text-white font-semibold text-sm transition disabled:opacity-60 mt-2"
          style={{ backgroundColor: ACCENT }}
        >
          {phase === 'saving' ? t('submitting') : t('submit')}
        </button>
      </form>
    </Shell>
  )
}

function ResetPasswordFallback() {
  const t = useTranslations('auth.resetPassword')
  return (
    <Shell>
      <p className="text-sm text-muted text-center">{t('verifying')}</p>
    </Shell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-10">
          <Logo size="lg" />
        </div>
        {children}
      </div>
    </div>
  )
}
