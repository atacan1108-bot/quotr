/**
 * Supabase "admin" client — uses the SERVICE ROLE key, which bypasses Row
 * Level Security entirely.
 *
 * SERVER-ONLY. Never import this file from a 'use client' component or from
 * anything that ships to the browser — the service role key can read and
 * write every table, for every contractor, ignoring all RLS policies.
 *
 * It exists for exactly one purpose in this app: the public /quote/[token]
 * page and its accept endpoint, which run with NO logged-in user and so
 * have no auth.uid() for RLS to check against. Every query built with this
 * client in this codebase must be hand-scoped to a single row by an exact
 * share_token or id — never a general listing query — since RLS is not
 * there to protect you here.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey || serviceRoleKey === 'PASTE_YOUR_SERVICE_ROLE_KEY_HERE') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — add it in .env.local (Supabase Dashboard → Project Settings → API).',
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
