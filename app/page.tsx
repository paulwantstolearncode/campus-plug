import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import LandingPage from './LandingPage'
import HomeFeed from '@/app/components/HomeFeed'

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Logged-out visitors land on the SEO-optimised, server-rendered
  // LandingPage. Logged-in users get the interactive client feed.
  if (!user) {
    return <LandingPage />
  }

  return <HomeFeed user={user} />
}
