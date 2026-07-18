import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'
import Logo from '@/components/Logo'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex h-dvh">
      {/* Sidebar renders itself only on md+ via CSS */}
      <AppNav />

      {/* Content area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Desktop header */}
        <header className="hidden md:flex items-center justify-between px-6 h-16 border-b border-border bg-white shrink-0">
          <h1 className="text-sm font-semibold text-on-surface font-display">Stipt</h1>
          <span className="text-xs text-muted">{user.email}</span>
        </header>

        {/* Mobile header — the desktop one above is `hidden` below md, and
            nothing replaced it, so mobile never showed the logo at all
            (previously just plain "Stipt" text, not even the Logo
            component). This takes the same real layout space every list
            page was already reserving for itself via an mt-12 top-margin
            hack (to clear the floating LanguageSwitcher pill) — those
            per-page hacks are removed now that this header provides that
            space properly, so nothing ends up double-spaced. Logo sits on
            the LEFT specifically so it never collides with the
            LanguageSwitcher pill, which floats independently in the
            top-RIGHT corner on every page. */}
        <header
          className="md:hidden flex items-center px-4 h-14 border-b border-border bg-white shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))' }}
        >
          <Logo size="sm" />
        </header>

        {/* Page content — bottom padding leaves room for mobile nav bar */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
