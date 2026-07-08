'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
    const msg = error.message.toLowerCase()
    if (msg.includes('email not confirmed'))
      return { error: 'Bevestig eerst je e-mail. Check je inbox voor de bevestigingsmail.' }
    if (msg.includes('invalid login') || msg.includes('invalid credentials'))
      return { error: 'E-mailadres of wachtwoord klopt niet.' }
    return { error: error.message }
  }

  redirect('/quotes')
}
