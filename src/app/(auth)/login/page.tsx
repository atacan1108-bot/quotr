'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { loginAction } from './actions'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center">
            <span className="text-white text-xl font-bold tracking-tight">Q</span>
          </div>
          <span className="ml-3 text-2xl font-semibold text-on-surface tracking-tight">Quotr</span>
        </div>

        <h1 className="text-xl font-semibold text-on-surface mb-1">Welkom terug</h1>
        <p className="text-sm text-muted mb-8">Log in om je offertes te beheren</p>

        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5" htmlFor="email">
              E-mailadres
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="w-full h-12 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="jij@bedrijf.nl"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-on-surface" htmlFor="password">
                Wachtwoord
              </label>
              <Link href="/forgot-password" className="text-sm text-teal-500 font-medium hover:text-teal-700">
                Wachtwoord vergeten?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="w-full h-12 rounded-xl border border-border bg-white px-4 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
              placeholder="••••••••"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="h-12 w-full rounded-xl bg-teal-500 text-white font-semibold text-sm hover:bg-teal-700 active:bg-teal-700 transition disabled:opacity-60 mt-2"
          >
            {isPending ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Nog geen account?{' '}
          <Link href="/register" className="text-teal-500 font-medium hover:text-teal-700">
            Registreer je
          </Link>
        </p>

      </div>
    </div>
  )
}
