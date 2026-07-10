'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('nav')

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full h-12 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition"
    >
      {t('logout')}
    </button>
  )
}
