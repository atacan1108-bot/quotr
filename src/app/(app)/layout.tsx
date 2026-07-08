import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'

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
          <h1 className="text-sm font-semibold text-on-surface">Quotr</h1>
          <span className="text-xs text-muted">{user.email}</span>
        </header>

        {/* Page content — bottom padding leaves room for mobile nav bar */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
