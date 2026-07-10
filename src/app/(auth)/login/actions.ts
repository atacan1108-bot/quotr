'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { syncLocaleFromRateCard } from '@/lib/locale'

export type LoginState = { error: string } | null

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email    = ((formData.get('email')    as string) ?? '').trim()
  const password =  (formData.get('password') as string) ?? ''

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const t = await getTranslations('auth.login')
    const msg = error.message.toLowerCase()
    if (msg.includes('email not confirmed'))
      return { error: t('emailNotConfirmed') }
    if (msg.includes('invalid login') || msg.includes('invalid credentials'))
      return { error: t('invalidCredentials') }
    return { error: error.message }
  }

  await syncLocaleFromRateCard()
  redirect('/quotes')
}
