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

      {/* ── Page header: warm paper + ambient gold glow ── */}
      <section className="relative py-20 md:py-28 bg-paper overflow-hidden">
        {/* Radial ambient gold glow behind the header */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-[-160px] left-1/2 -translate-x-1/2 w-[560px] h-[420px] bg-gold/10 blur-[100px] rounded-full" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="font-serif-accent italic text-2xl sm:text-3xl text-gold mb-4">Curated Selection</p>
            <h1 className="font-display text-4xl sm:text-5xl md:text-5xl font-bold text-ink tracking-tight leading-tight mb-6">
              Browse Campus Categories
            </h1>
            {/* Total listings pill with gold signal pulse */}
            <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-rule rounded-full px-4 py-1.5 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-semibold text-ink-muted">
                {totalListings} listing{totalListings !== 1 ? 's' : ''} live on the board right now
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {categoriesWithCount.map((cat) => (
              <Link
                key={cat.slug}
                href={`/services?category=${cat.slug}`}
                className="group relative bg-white/90 backdrop-blur-sm border border-rule rounded-2xl p-5 sm:p-6 overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(201,162,39,0.2)]"
              >
                {/* Faded giant emoji backdrop */}
                <span
                  className="absolute -bottom-5 -right-4 text-[5.5rem] leading-none opacity-[0.06] select-none pointer-events-none transition-transform duration-500 group-hover:scale-110"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                {/* Glowing ambient icon circle in the category's own color */}
                <div
                  className="relative w-12 h-12 rounded-full flex items-center justify-center mb-4 text-ink"
                  style={{ backgroundColor: cat.color + '26' }} // ~15% tint
                >
                  <CategoryIcon slug={cat.slug} size={24} />
                  {/* Colored ambient glow on hover (inline style — per-category color) */}
                  <span
                    className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none blur-md"
                    style={{ backgroundColor: cat.color + '55' }}
                    aria-hidden="true"
                  />
                </div>

                <h2 className="text-base sm:text-lg font-bold text-ink leading-snug mb-1">
                  {cat.label}
                </h2>
                <p className="text-[13px] text-ink-muted leading-relaxed line-clamp-2 mb-4">
                  {cat.description}
                </p>

                {/* Sleek count pill + arrow reveal */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center bg-paper-deep border border-rule rounded-full px-2.5 py-1 font-mono text-[11px] text-ink-muted">
                    {cat.count} listing{cat.count !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gold-dark text-lg font-bold opacity-0 -translate-x-2 translate-y-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-300">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA: obsidian card with grain + gold glow + metallic button ── */}
      <section className="relative pb-24 md:pb-32 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="relative overflow-hidden bg-ink rounded-3xl px-8 py-14 md:px-16 md:py-20 text-center">
            {/* Grain texture overlay */}
            <div className="absolute inset-0 grain-overlay opacity-[0.05] pointer-events-none" aria-hidden="true" />
            {/* Gold ambient glow accents */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute -top-24 left-1/4 w-80 h-80 bg-gold/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 right-1/4 w-80 h-80 bg-gold/[0.07] rounded-full blur-3xl" />
            </div>

            <div className="relative">
              <p className="font-serif-accent italic text-xl sm:text-2xl text-gold mb-4">Sell on Campus Plug</p>
              <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
                Got something to <em className="font-serif-accent gradient-text">sell?</em>
              </h2>
              <p className="text-base md:text-lg text-white/60 max-w-xl mx-auto mb-8 leading-relaxed">
                Post it on the board and reach thousands of students — from Pentagon to
                Night Market. Buyers message you directly on WhatsApp.
              </p>
              {/* Gold metallic button */}
              <Link
                href="/become-seller"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-ink transition-all hover:scale-[1.03] shadow-lg shadow-gold-glow"
                style={{ backgroundImage: 'linear-gradient(135deg, #e8b93b 0%, #c9a227 45%, #a8841a 100%)' }}
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
