import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // The exchange can throw on a network failure rather than resolving
    // with { error } — treat that like any other failed exchange so the user
    // gets the friendly redirect below instead of a 500.
    let exchangeError: Error | null = null
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      exchangeError = error
    } catch (err) {
      exchangeError = err as Error
    }

    if (!exchangeError) {
      // Honor a return-to target only when it is a same-origin relative path
      // (no scheme, no leading //) — otherwise this endpoint could be used as
      // an open redirect.
      const next = searchParams.get('next')
      const target =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : '/'

      return NextResponse.redirect(origin + target)
    }

    console.error('Auth callback code exchange failed:', exchangeError)
  }

  // No code, or the exchange failed (expired/used code, network error): send
  // the user back to login with a visible error instead of silently landing
  // them on the home page logged out.
  return NextResponse.redirect(origin + '/login?error=signin_failed')
}