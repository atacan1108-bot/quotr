import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')
  // /quote/[token] is the customer-facing shared quote page — anyone with the
  // link must be able to view it (and accept it) without an account.
  // /api/public/* is its matching no-auth API surface (e.g. accept endpoint).
  const isPublicShareRoute = pathname.startsWith('/quote/') || pathname.startsWith('/api/public/')
  // Clicking the emailed recovery link establishes a real (if narrow) Supabase
  // session — so `user` is truthy here. Treating this like isAuthPage would
  // bounce that session straight to /quotes before the visitor can actually
  // set a new password, so it stays public regardless of auth state.
  const isPasswordResetPage = pathname.startsWith('/reset-password')
  const isPublicPage = pathname === '/' || isAuthPage || isPublicShareRoute || isPasswordResetPage

  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/quotes', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest|.*\\.png$|.*\\.ico$).*)'],
}
