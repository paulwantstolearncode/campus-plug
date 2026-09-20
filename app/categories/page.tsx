import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import NavBar from '@/app/components/NavBar'
import CategoryIcon from '@/app/components/CategoryIcon'
import { CATEGORIES } from '@/lib/categories'
import { SITE_URL } from '@/lib/site'

// Listing counts are live per request (cookie-based Supabase client) — render
// dynamically so the build doesn't attempt (and bail out of) static generation.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Browse Categories — Campus Plug',
  description:
    'Browse every category on Campus Plug — textbooks & tutoring, hostel essentials, electronics, hair & beauty, food, tech repairs and more, all from verified UG students.',
  alternates: { canonical: '/categories' },
  openGraph: {
    title: 'Browse Categories — Campus Plug',
    description:
      'Textbooks & tutoring, hostel essentials, electronics, hair & beauty, food, repairs — all from verified UG students.',
    url: `${SITE_URL}/categories`,
    siteName: 'Campus Plug',
    locale: 'en_GH',
    type: 'website',
  },
}

async function getCategoryCounts(): Promise<Map<string, number>> {
  try {
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
      },
    )

    const { data, error } = await supabase
      .from('listings')
      .select('category')
      .eq('approval_status', 'approved')
      .is('deleted_at', null)
      .is('sold_at', null)

    if (error) {
      console.error('Failed to load category counts:', error)
      return new Map()
    }

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      if (row.category) counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }
    return counts
  } catch (err) {
    console.error('Failed to load category counts:', err)
    return new Map()
  }
}

export default async function CategoriesPage() {
  const categoryCounts = await getCategoryCounts()
  const totalListings = Array.from(categoryCounts.values()).reduce((a, b) => a + b, 0)
  const categoriesWithCount = CATEGORIES.map((c) => ({ ...c, count: categoryCounts.get(c.slug) ?? 0 }))

  return (
    <main className="min-h-screen bg-paper">
      <NavBar variant="light" />

      {/* ── Page header ── */}
      <section className="relative py-20 md:py-28 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="eyebrow text-gold-dark mb-4">All categories</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-ink leading-tight mb-3">
              What are you <em className="font-serif-accent gradient-text">looking for?</em>
            </h2>
            <p className="text-base md:text-lg text-ink-muted">
              {totalListings} listing{totalListings !== 1 ? 's' : ''} live on the board right now
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {categoriesWithCount.map((cat) => (
              <Link
                key={cat.slug}
                href={`/services?category=${cat.slug}`}
                className="group relative bg-surface hairline rounded-2xl p-5 sm:p-6 overflow-hidden card-lift hover:border-gold hover:shadow-glow transition-colors"
              >
                {/* Faded giant emoji backdrop */}
                <span
                  className="absolute -bottom-5 -right-4 text-[5.5rem] leading-none opacity-[0.06] select-none pointer-events-none transition-transform duration-500 group-hover:scale-110"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4 text-ink"
                  style={{ backgroundColor: cat.color + '26' }} // ~15% tint
                >
                  <CategoryIcon slug={cat.slug} size={24} />
                </div>

                <h3 className="text-base sm:text-lg font-bold text-ink leading-snug mb-1">
                  {cat.label}
                </h3>
                <p className="text-[13px] text-ink-muted leading-relaxed line-clamp-2 mb-3">
                  {cat.description}
                </p>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-muted">
                    {cat.count} listing{cat.count !== 1 ? 's' : ''}
                  </span>
                  {/* Arrow reveal on hover */}
                  <span className="text-gold-dark text-lg font-bold opacity-0 -translate-x-2 translate-y-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-300">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA: obsidian card ── */}
      <section className="relative pb-24 md:pb-32 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="relative overflow-hidden bg-ink rounded-3xl px-8 py-14 md:px-16 md:py-20 text-center">
            {/* Gold glow accents */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute -top-24 left-1/4 w-80 h-80 bg-gold/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 right-1/4 w-80 h-80 bg-gold/[0.07] rounded-full blur-3xl" />
            </div>

            <div className="relative">
              <p className="eyebrow text-gold mb-4">Sell on campus plug</p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                Got something to <em className="font-serif-accent gradient-text">sell?</em>
              </h2>
              <p className="text-base md:text-lg text-white/60 max-w-xl mx-auto mb-8 leading-relaxed">
                Post it on the board and reach thousands of students — from Pentagon to
                Night Market. Buyers message you directly on WhatsApp.
              </p>
              <Link
                href="/become-seller"
                className="group inline-flex items-center gap-2 bg-gold-vivid text-ink px-8 py-4 rounded-full font-bold hover:bg-gold-light transition-all hover:scale-[1.03] shadow-lg shadow-gold-glow"
              >
                Start selling
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
