import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_RATE_CARD } from '@/lib/types'
import { isMollieConfigured, isMollieLiveKey } from '@/lib/mollie/client'
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

  // Read-only status — MOLLIE_API_KEY is a server-only secret, never
  // exposed to the browser. Only whether it's configured, and whether
  // it's a live_ (real money) or test_ key, is shown here — never the key
  // itself. This is genuinely server-rendered (not a client fetch), so
  // there's no extra round trip and no risk of the key leaking to the client bundle.
  const mollieConfigured = isMollieConfigured()
  const mollieLive = isMollieLiveKey()

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">
      <h1 className="text-lg font-semibold text-on-surface font-display mb-6">{t('title')}</h1>

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

      {/* Mollie (online payments) connection status — read-only; the key
          itself is pasted into .env.local (local) / Vercel's project
          settings (deployed), never typed into the app itself. */}
      <div className="bg-white rounded-2xl border border-border p-5 mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('mollieTitle')}</p>
        <div className="flex items-center gap-3 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${mollieConfigured ? (mollieLive ? 'bg-red-500' : 'bg-teal-500') : 'bg-border'}`} />
          <p className="text-sm font-semibold text-on-surface">
            {mollieConfigured
              ? (mollieLive ? t('mollieLive') : t('mollieTest'))
              : t('mollieNotConnected')}
          </p>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          {mollieConfigured
            ? (mollieLive ? t('mollieLiveHint') : t('mollieTestHint'))
            : t('mollieSetupHint')}
        </p>
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
          <span className="text-on-surface">Stipt</span>
          <span className="text-muted">v0.1.0</span>
        </div>
      </div>

      {/* Sign out */}
      <LogoutButton />
    </div>
  )
}
