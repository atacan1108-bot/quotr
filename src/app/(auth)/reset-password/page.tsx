'use client'

/**
 * Landing page for the link in the "forgot password" email. Supabase's
 * hosted verify endpoint redirects here after validating the recovery
 * token, appending session tokens as a URL hash — the browser client
 * (detectSessionInUrl, on by default) picks that up automatically and
 * fires a PASSWORD_RECOVERY auth event once the session is live. No
 * custom /auth/callback route needed, same as this app's existing
 * signup-confirmation flow.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Phase = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()

  const [phase, setPhase]       = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPhase('ready')
    })

    // Covers the case where the hash was already processed (and the event
    // already fired) before this listener attached.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPhase(p => (p === 'verifying' ? 'ready' : p))
    })

    // No session materializes within a few seconds → the link was invalid,
    // already used, or expired.
    const timeout = setTimeout(() => {
      setPhase(p => (p === 'verifying' ? 'invalid' : p))
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen.')
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
    setTimeout(() => router.push('/quotes'), 1500)
  }

  if (phase === 'verifying') {
    return (
      <Shell>
        <p className="text-sm text-muted text-center">Link verifiëren…</p>
      </Shell>
    )
  }

  if (phase === 'invalid') {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-on-surface mb-2 text-center">Link ongeldig of verlopen</h1>
        <p className="text-sm text-muted mb-6 text-center">
          Deze resetlink werkt niet meer — vraag een nieuwe aan.
        </p>
        <Link href="/forgot-password" className="inline-flex h-12 px-6 items-center justify-center w-full rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 transition">
          Nieuwe link aanvragen
        </Link>
      </Shell>
    )
  }

  if (phase === 'done') {
    return (
      <Shell>
        <p className="text-sm font-medium text-teal-700 text-center">Wachtwoord gewijzigd — je wordt doorgestuurd…</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-on-surface mb-1">Nieuw wachtwoord instellen</h1>
      <p className="text-sm text-muted mb-8">Kies een nieuw wachtwoord voor je account.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="password">
            Nieuw wachtwoord
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
            placeholder="Minimaal 8 tekens"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="confirm">
            Bevestig wachtwoord
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
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={phase === 'saving'}
          className="h-12 w-full rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 transition disabled:opacity-60 mt-2"
        >
          {phase === 'saving' ? 'Opslaan…' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-10">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
            <span className="text-white text-xl font-bold tracking-tight">Q</span>
          </div>
          <span className="ml-3 text-2xl font-semibold text-on-surface tracking-tight">Quotr</span>
        </div>
        {children}
      </div>
    </div>
  )
}
