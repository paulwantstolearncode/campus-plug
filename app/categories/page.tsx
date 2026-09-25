import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import NavBar from '@/app/components/NavBar'
import CategoryIcon from '@/app/components/CategoryIcon'
import { CATEGORIES, type Category } from '@/lib/categories'
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

// The 4 hero categories get the asymmetric 2-column treatment, in grid order.
const HERO_SLUGS = ['hostel-essentials', 'electronics-gadgets', 'tutoring', 'hair-beauty'] as const

// Demand badges shown top-right on hero cards.
const HERO_BADGES: Record<(typeof HERO_SLUGS)[number], string> = {
  'hostel-essentials': '🔥 Freshers Choice',
  'electronics-gadgets': '⚡ High Demand',
  tutoring: '🔥 Freshers Choice',
  'hair-beauty': '⚡ High Demand',
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

/** Mini pill tags for a category's sample items. */
function SamplePills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="bg-black/5 text-[11px] px-2.5 py-1 rounded-full text-ink-muted whitespace-nowrap"
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function CountPill({ count, large }: { count: number; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center bg-paper-deep border border-rule rounded-full font-mono text-ink-muted ${
        large ? 'text-xs px-3 py-1' : 'text-[11px] px-2.5 py-0.5'
      }`}
    >
      {count} listing{count !== 1 ? 's' : ''}
    </span>
  )
}

export default async function CategoriesPage() {
  const categoryCounts = await getCategoryCounts()
  const totalListings = Array.from(categoryCounts.values()).reduce((a, b) => a + b, 0)

  const withCount = (c: Category) => ({ ...c, count: categoryCounts.get(c.slug) ?? 0 })
  const heroCategories = CATEGORIES.filter((c) => (HERO_SLUGS as readonly string[]).includes(c.slug)).map(withCount)
  const restCategories = CATEGORIES.filter((c) => !(HERO_SLUGS as readonly string[]).includes(c.slug)).map(withCount)

  return (
    <main className="min-h-screen bg-paper">
      <NavBar variant="light" />

      {/* ── Page header: warm paper + ambient gold glow + search ── */}
      <section className="relative py-20 md:py-28 bg-paper overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="hidden md:block absolute top-[-160px] left-1/2 -translate-x-1/2 w-[560px] h-[420px] bg-gold/10 blur-[100px] rounded-full" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 md:mb-12">
            <p className="font-serif-accent italic text-2xl sm:text-3xl text-gold mb-4">Campus Marketplace Directory</p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink tracking-tight leading-tight mb-6">
              Explore Everything on Campus
            </h1>
            <span className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-rule rounded-full px-4 py-1.5 shadow-sm mb-8">
              <span className="h-2 w-2 rounded-full bg-gold animate-pulse" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-semibold text-ink-muted">
                {totalListings} listing{totalListings !== 1 ? 's' : ''} live on the board right now
              </span>
            </span>

            {/* Search — native GET form, no JS needed; /services reads ?q= */}
            <form action="/services" method="get" className="max-w-xl mx-auto">
              <div className="group flex items-center gap-3 bg-white/90 backdrop-blur-sm border border-rule rounded-full pl-5 pr-2 py-2 shadow-sm transition-all focus-within:border-gold/60 focus-within:shadow-[0_8px_32px_-8px_rgba(201,162,39,0.25)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted shrink-0" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="search"
                  name="q"
                  placeholder="Search laptops, kettles, braiding…"
                  aria-label="Search listings"
                  className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none min-w-0"
                />
                <button
                  type="submit"
                  className="shrink-0 text-ink text-sm font-bold px-5 py-2.5 rounded-full transition-all hover:scale-[1.03] shadow-sm"
                  style={{ backgroundImage: 'linear-gradient(135deg, #e8b93b 0%, #c9a227 55%, #a8841a 100%)' }}
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          {/* ── Asymmetric grid: 4 hero cards (2-col spans) + 10 standard cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {heroCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/services?category=${cat.slug}`}
                className="group relative sm:col-span-2 rounded-2xl p-6 sm:p-7 overflow-hidden border border-rule bg-surface transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(201,162,39,0.2)]"
                style={{ backgroundImage: `linear-gradient(135deg, ${cat.color}14 0%, transparent 60%)` }}
              >
                {/* Demand badge */}
                <span className="absolute top-4 right-4 text-[11px] font-bold px-3 py-1.5 rounded-full bg-gold-soft text-ink border border-gold/30">
                  {HERO_BADGES[cat.slug as (typeof HERO_SLUGS)[number]]}
                </span>

                {/* Faded giant emoji backdrop */}
                <span
                  className="absolute -bottom-6 -right-4 text-[7rem] leading-none opacity-[0.06] select-none pointer-events-none transition-transform duration-500 group-hover:scale-110"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                <div className="relative">
                  <div
                    className="relative w-14 h-14 rounded-full flex items-center justify-center mb-4 text-ink"
                    style={{ backgroundColor: cat.color + '26' }}
                  >
                    <CategoryIcon slug={cat.slug} size={28} />
                    <span
                      className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none blur-md"
                      style={{ backgroundColor: cat.color + '55' }}
                      aria-hidden="true"
                    />
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-ink leading-snug mb-1.5">{cat.label}</h2>
                  <p className="text-sm text-ink-muted leading-relaxed mb-4 max-w-md">{cat.description}</p>

                  <SamplePills items={cat.sampleItems} />

                  <div className="mt-4">
                    <CountPill count={cat.count} large />
                  </div>
                </div>
              </Link>
            ))}

            {restCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/services?category=${cat.slug}`}
                className="group relative bg-white/90 backdrop-blur-sm border border-rule rounded-2xl p-5 overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(201,162,39,0.2)]"
              >
                <span
                  className="absolute -bottom-5 -right-4 text-[5rem] leading-none opacity-[0.06] select-none pointer-events-none transition-transform duration-500 group-hover:scale-110"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                <div
                  className="relative w-11 h-11 rounded-full flex items-center justify-center mb-3 text-ink"
                  style={{ backgroundColor: cat.color + '26' }}
                >
                  <CategoryIcon slug={cat.slug} size={22} />
                  <span
                    className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none blur-md"
                    style={{ backgroundColor: cat.color + '55' }}
                    aria-hidden="true"
                  />
                </div>

                <h2 className="text-base font-bold text-ink leading-snug mb-0.5">{cat.label}</h2>
                <div className="mb-3">
                  <CountPill count={cat.count} />
                </div>

                <SamplePills items={cat.sampleItems} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA: obsidian card, metallic gold border, grain ── */}
      <section className="relative pb-24 md:pb-32 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Gradient p-px wrapper = metallic gold border */}
          <div className="rounded-3xl p-px bg-gradient-to-br from-[#e8b93b] via-[#c9a227]/40 to-[#a8841a]">
            <div className="relative overflow-hidden bg-ink rounded-[calc(1.5rem-1px)] px-8 py-14 md:px-16 md:py-20 text-center">
              <div className="absolute inset-0 grain-overlay opacity-[0.05] pointer-events-none" aria-hidden="true" />
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
        </div>
      </section>
    </main>
  )
}
