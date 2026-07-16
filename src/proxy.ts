import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE } from '@/i18n/config'

const LOCALE_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const }

export async function proxy(request: NextRequest) {
  // Done BEFORE the Supabase client below (which itself may recreate the
  // response object via NextResponse.next({ request }) if a session token
  // needs refreshing) so this request-side mutation is naturally carried
  // through by that existing logic — unmodified — rather than risking a
  // second recreation here that could silently drop cookies Supabase just
  // set (e.g. a refreshed session token). Only affects what THIS request
  // renders; whether it's ever persisted to the browser (a real Set-Cookie)
  // is decided further down, once we know if the visitor is logged in.
  const { pathname } = request.nextUrl
  const isMarketingPage = pathname === '/' || pathname === '/en'
  if (isMarketingPage) {
    request.cookies.set(LOCALE_COOKIE, pathname === '/en' ? 'en' : 'nl')
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')
  // /quote/[token] is the customer-facing shared quote page — anyone with the
  // link must be able to view it (and accept it) without an account.
  // /api/public/* is its matching no-auth API surface (e.g. accept endpoint).
  // /pay/complete is where Mollie redirects a client after checkout — they
  // have no Quotr account, so it must be reachable without a session, same
  // as the quote share route. /api/cron/* is called by Vercel's own cron
  // infrastructure, which has no Quotr session either — its real
  // protection is the CRON_SECRET header check inside the route itself
  // (see src/app/api/cron/invoice-reminders/route.ts), not login.
  const isPublicShareRoute = pathname.startsWith('/quote/') || pathname.startsWith('/api/public/') || pathname.startsWith('/pay/complete') || pathname.startsWith('/api/cron/')
  // Clicking the emailed recovery link establishes a real (if narrow) Supabase
  // session — so `user` is truthy here. Treating this like isAuthPage would
  // bounce that session straight to /quotes before the visitor can actually
  // set a new password, so it stays public regardless of auth state.
  const isPasswordResetPage = pathname.startsWith('/reset-password')
  // /en is the English marketing homepage (src/components/marketing/
  // MarketingHome.tsx rendered by src/app/en/page.tsx) — public for the
  // same reason `/` is: prospects have no account yet.
  const isPublicPage = isMarketingPage || isAuthPage || isPublicShareRoute || isPasswordResetPage

  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/quotes', request.url))
  }

  // Persist the locale cookie to the BROWSER only for a logged-out visitor
  // actually looking at the marketing page. A logged-in user hitting `/`
  // or `/en` is redirected straight into the portal by the page component
  // itself and must keep whatever language their account already has
  // (synced at login via syncLocaleFromRateCard) — persisting a marketing-
  // page-implied locale for them here would silently overwrite that
  // preference for every future visit, not just this one. Added directly
  // onto the existing supabaseResponse (never recreated here) so any
  // cookies Supabase itself just set (e.g. a refreshed session token)
  // are never discarded.
  if (!user && isMarketingPage) {
    supabaseResponse.cookies.set(LOCALE_COOKIE, pathname === '/en' ? 'en' : 'nl', LOCALE_COOKIE_OPTIONS)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest|.*\\.png$|.*\\.ico$).*)'],
}
