import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_RATE_CARD } from '@/lib/types'
import LogoutButton from './LogoutButton'
import SettingsForm from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('settings')

  const { data: rateCard } = await supabase
    .from('rate_cards')
    .select('*')
    .eq('owner_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <h1 className="text-lg font-semibold text-on-surface mb-6">{t('title')}</h1>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('account')}</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
            <span className="text-teal-700 text-sm font-bold">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {rateCard?.business_name || t('yourCompany')}
            </p>
            <p className="text-xs text-muted">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Everything that personalizes a contractor's quotes */}
      <SettingsForm
        ownerId={user!.id}
        initialRateCard={rateCard ?? { id: null, ...DEFAULT_RATE_CARD }}
      />

      {/* App info */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-4 mt-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('app')}</p>
        <div className="flex justify-between items-center text-sm">
          <span className="text-on-surface">Quotr</span>
          <span className="text-muted">v0.1.0</span>
        </div>
      </div>

      {/* Sign out */}
      <LogoutButton />
    </div>
  )
}
