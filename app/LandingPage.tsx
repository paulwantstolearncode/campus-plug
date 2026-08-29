'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ListingCard, { type ListingCardData } from '@/app/ListingCard'
import { CATEGORIES } from '@/lib/categories'
import FeedbackModal from '@/app/components/FeedbackModal'
import type { User } from '@supabase/supabase-js'
import NavBar from '@/app/components/NavBar'
import { useRouter } from 'next/navigation'

interface MarketplaceStats {
  sellerCount: number
  listingCount: number
}

const SEARCH_PLACEHOLDERS = [
  'Search: past questions, hair braiding, PS5, gas refill, phone repair...',
  'Search: DCIT 201 tutoring, braiding, catering, laundry...',
  'Search: wireless earbuds, laptop stand, generator rental...',
  'Search: manicure, photography, graphic design, typing...',
]

function RotatingSearchPlaceholder() {
  const [index, setIndex] = useState(0)
  const router = useRouter()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % SEARCH_PLACEHOLDERS.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push('/services?q=' + encodeURIComponent(query.trim()))
    } else {
      router.push('/services')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={SEARCH_PLACEHOLDERS[index]}
        className="w-full px-5 py-4 pr-14 rounded-full bg-ink-soft/90 backdrop-blur border border-white/15 text-white text-sm font-medium placeholder:text-white/40 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 transition-all shadow-2xl"
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gold-vivid text-ink flex items-center justify-center hover:bg-gold-light transition-colors shadow-md shadow-gold-glow"
        aria-label="Search"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>
  )
}

export default function LandingPage() {
  const [liveListings, setLiveListings] = useState<ListingCardData[]>([])
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map())
  const [user, setUser] = useState<User | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  useEffect(() => {
    // Check auth status
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    
    checkAuth()
    
    // TODO(seo): convert this page to a Server Component and fetch listings
    // server-side so the live/category sections render in the initial HTML.
    // Requires splitting the client-only scroll-handler logic into a child
    // component. Client-side fetching is fine for now.

    // "Featured on Campus" — admin-curated slots first (landing_featured_listings),
    // then fill remaining slots with the newest approved listings that have an
    // image and aren't already featured. If the migration hasn't been run yet
    // (table missing), this falls back to the newest-6 behavior automatically.
    // Showcase only; every tap funnels to /login. The whole section hides
    // itself if there are zero approved listings with images.
    async function loadLive() {
      // Pre-migration safety (same pattern as the original table-missing
      // fallback): until supabase/add_campus_location.sql has been run, a
      // select that includes campus_location 400s (unknown column) and would
      // hide the whole section. If the primary load comes back empty, retry
      // without the column — locations just won't show until the migration.
      const listingSelect =
        'id, title, description, price, image_url, listing_type, category, campus_location, approval_status, seller_id, seller:profiles!seller_id (full_name, whatsapp_number), listing_items (price), listing_images (id)'
      const legacySelect = listingSelect.replace(', campus_location', '')

      async function loadWith(select: string): Promise<ListingCardData[]> {
        // 1) Admin-curated slots, in order. A slot only counts if its listing
        //    still exists, is approved, and has an image.
        const { data: slotData, error: slotError } = await supabase
          .from('landing_featured_listings')
          .select('slot, listing:listings!listing_id (' + select + ')')
          .order('slot', { ascending: true })

        let featured: ListingCardData[] = []
        if (slotError) {
          // Table or column missing (migration not run yet) — fall through
          // to newest-6.
          console.error('Failed to load featured slots:', slotError)
        } else if (slotData) {
          featured = (slotData as unknown as { slot: number; listing: ListingCardData | null }[])
            .filter((s) =>
              s.listing &&
              s.listing.approval_status === 'approved' &&
              !s.listing.deleted_at &&
              !!s.listing.image_url &&
              s.listing.image_url.trim() !== ''
            )
            .map((s) => s.listing as ListingCardData)
        }

        // 2) Fill the remaining slots with the newest approved listings that
        //    aren't already featured.
        let combined = featured
        if (combined.length < 6) {
          const picked = combined.map((l) => l.id)
          const fillQuery = supabase
            .from('listings')
            .select(select)
            .eq('approval_status', 'approved')
            .is('deleted_at', null)
            .not('image_url', 'is', null)
            .neq('image_url', '')
            .order('created_at', { ascending: false })
            .limit(6)
          if (picked.length > 0) fillQuery.not('id', 'in', picked)

          const { data: fillData, error: fillError } = await fillQuery
          if (fillError) {
            // Last resort: newest-6 with no exclusion (pre-featured behavior).
            const { data: fallback } = await supabase
              .from('listings')
              .select(select)
              .eq('approval_status', 'approved')
              .is('deleted_at', null)
              .not('image_url', 'is', null)
              .neq('image_url', '')
              .order('created_at', { ascending: false })
              .limit(6)
            if (fallback) combined = fallback as unknown as ListingCardData[]
          } else if (fillData) {
            combined = [...featured, ...(fillData as unknown as ListingCardData[])].slice(0, 6)
          }
        }

        return combined
      }

      try {
        let combined = await loadWith(listingSelect)
        if (combined.length === 0) combined = await loadWith(legacySelect)
        if (combined.length > 0) setLiveListings(combined)
      } catch (err) {
        // Decorative — a failed fetch just leaves the section hidden.
        console.error('Failed to load live listings:', err)
      }
    }

    // Hero social-proof pill counts (security-definer RPC — see
    // supabase/add_marketplace_stats.sql). Shows the loading placeholder
    // until data arrives; if the RPC hasn't been created yet the pill
    // simply stays on its placeholder.
    async function loadStats() {
      try {
        const { data } = await supabase.rpc('marketplace_stats')
        if (data && data[0]) {
          setStats({
            sellerCount: Number(data[0].seller_count),
            listingCount: Number(data[0].listing_count),
          })
        }
      } catch (err) {
        console.error('Failed to load marketplace stats:', err)
      }
    }

    // Category showcase counts — one lightweight query, tallied client-side.
    async function loadCategoryCounts() {
      try {
        const { data } = await supabase
          .from('listings')
          .select('category')
          .eq('approval_status', 'approved')
          .is('deleted_at', null)
        if (!data) return
        const counts = new Map<string, number>()
        for (const row of data as { category: string | null }[]) {
          if (row.category) {
            counts.set(row.category, (counts.get(row.category) || 0) + 1)
          }
        }
        setCategoryCounts(counts)
      } catch (err) {
        console.error('Failed to load category counts:', err)
      }
    }

    loadLive()
    loadStats()
    loadCategoryCounts()
  }, [])

  // Categories with at least one live approved listing, in canonical order.
  const visibleCategories = CATEGORIES.filter(
    (c) => (categoryCounts.get(c.slug) || 0) > 0
  )

  const howItWorks = [
    {
      number: '01',
      emoji: '🔍',
      title: 'Browse',
      desc: 'Discover verified UG student sellers offering products and services',
    },
    {
      number: '02',
      emoji: '💬',
      title: 'Message',
      desc: 'Chat directly on WhatsApp — no middleman',
    },
    {
      number: '03',
      emoji: '✅',
      title: 'Book',
      desc: 'Agree on details, meet up, done. Pay via cash or MoMo',
    },
  ]

  const whyCards = [
    { icon: '🛡️', title: 'Verified', desc: 'Every seller manually approved' },
    { icon: '🇬🇭', title: 'Local', desc: 'Ghana Cedis, MoMo, WhatsApp' },
    { icon: '⚡', title: 'Fast', desc: 'Direct WhatsApp = instant reply' },
    { icon: '💛', title: 'Student', desc: 'By UG, for UG community' },
  ]

  return (
    <main className="min-h-screen bg-paper overflow-hidden">
      <NavBar />

      {/* ── Hero: obsidian editorial statement + floating bento ── */}
      <section className="relative min-h-[92vh] flex items-center pt-28 pb-16 md:pt-32 md:pb-24 overflow-hidden bg-ink text-white">
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-32 w-[32rem] h-[32rem] bg-gold/15 rounded-full blur-3xl"></div>
          <div className="blob absolute top-1/3 right-[-10%] w-[36rem] h-[36rem] bg-gold/10 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute bottom-[-10%] left-1/4 w-[28rem] h-[28rem] bg-purple-400/10 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)`,
            backgroundSize: '64px 64px'
          }}
        ></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 w-full">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* LEFT — headline + search + CTAs */}
            <div className="lg:col-span-7 text-center lg:text-left">
              {/* Social proof — live counts */}
              <div className="fade-up inline-flex items-center gap-2.5 glass px-4 py-2 rounded-full text-sm font-semibold text-white/90 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold-vivid opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gold-vivid"></span>
                </span>
                {stats
                  ? stats.sellerCount + ' UG students · ' + stats.listingCount + ' listings · live now'
                  : 'Live at UG 🇬🇭'}
              </div>

              {/* Eyebrow trust badge */}
              <div className="fade-up inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-5 py-2 rounded-full border border-white/10 bg-white/5 text-white/80 mb-7 max-w-[95vw]">
                <svg width="13" height="15" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <span className="uppercase tracking-[0.2em] text-[10px] sm:text-[11px] font-bold">
                  The trusted plug for UG
                </span>
              </div>

              {/* Main headline */}
              <h1 className="fade-up fade-up-delay-1 text-5xl sm:text-6xl md:text-7xl xl:text-8xl font-bold text-white leading-[0.95] tracking-tight mb-5">
                Campus help,<br className="hidden sm:block" />
                without the <em className="font-serif-accent gradient-text not-italic">guesswork</em>.
              </h1>

              <p className="fade-up fade-up-delay-1 text-base sm:text-lg text-gold-vivid font-semibold tracking-wide mb-4">
                Good finds. Better plug.
              </p>

              <p className="fade-up fade-up-delay-2 text-lg sm:text-xl text-white/60 max-w-xl mx-auto lg:mx-0 leading-relaxed mb-8">
                Buy &amp; sell with verified UG students — from Pentagon to Night Market. No agents. No stress. Just WhatsApp.
              </p>

              {/* Glowing search-as-hero */}
              <div className="fade-up fade-up-delay-2 max-w-xl mx-auto lg:mx-0 mb-8 relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-gold/40 via-gold-vivid/30 to-gold/40 rounded-full blur-lg opacity-60 pointer-events-none" aria-hidden />
                <RotatingSearchPlaceholder />
              </div>

              {/* CTA buttons */}
              <div className="fade-up fade-up-delay-3 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start items-center mb-8">
                <Link
                  href="/services"
                  className="w-full sm:w-auto group bg-gold-vivid text-ink px-8 py-4 rounded-full font-bold hover:bg-gold-light transition-all hover:scale-[1.03] shadow-lg shadow-gold-glow flex items-center justify-center gap-2"
                >
                  Browse the board
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto glass text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all hover:scale-[1.03] flex items-center justify-center gap-2 border border-white/15"
                >
                  Put it on the board
                </Link>
              </div>

              {/* Trust badges */}
              <div className="fade-up fade-up-delay-3 flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center">
                    <span className="text-gold-vivid text-xs">✓</span>
                  </div>
                  Verified sellers
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center">
                    <span className="text-gold-vivid text-xs">✓</span>
                  </div>
                  WhatsApp booking
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center">
                    <span className="text-gold-vivid text-xs">✓</span>
                  </div>
                  Ghana Cedis
                </div>
              </div>
            </div>

            {/* RIGHT — floating glass bento */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="relative">
                <div className="grid grid-cols-2 gap-4">
                  {/* Featured listing card */}
                  <div className="col-span-2 fade-up fade-up-delay-1 glass-dark rounded-3xl p-3 card-lift">
                    {liveListings[0] ? (
                      <Link href="/services" className="block">
                        <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-white/5">
                          {liveListings[0].image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={liveListings[0].image_url} alt={liveListings[0].title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">🔌</div>
                          )}
                          <div className="absolute top-3 right-3 bg-gold-signal text-ink font-mono font-bold px-2.5 py-1 rounded-lg text-xs shadow-lg">
                            {'GH₵ ' + Number(liveListings[0].price || 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="px-2 py-3">
                          <p className="text-sm font-semibold text-white line-clamp-1">{liveListings[0].title}</p>
                          <p className="text-[11px] text-white/50 mt-0.5 font-mono">📍 {liveListings[0].campus_location || 'University of Ghana'}</p>
                        </div>
                      </Link>
                    ) : (
                      <div className="px-2 py-3 text-center">
                        <p className="text-sm text-white/60">Fresh listings drop here</p>
                      </div>
                    )}
                  </div>

                  {/* Wanted board teaser */}
                  <Link href="/requests" className="fade-up fade-up-delay-2 glass-dark rounded-3xl p-5 card-lift flex flex-col justify-between">
                    <div className="text-2xl mb-3">📋</div>
                    <p className="text-sm font-semibold text-white mb-1">Need something specific?</p>
                    <p className="text-[11px] text-white/50 mb-4">Post it — sellers pitch you on WhatsApp.</p>
                    <span className="text-xs font-bold text-gold-vivid">Put it on the board →</span>
                  </Link>

                  {/* Stats card */}
                  <div className="fade-up fade-up-delay-3 glass-dark rounded-3xl p-5 card-lift flex flex-col justify-between">
                    <div className="text-2xl mb-3">⚡</div>
                    <p className="text-3xl font-bold text-white font-mono leading-none mb-1">
                      {stats ? stats.listingCount : '—'}
                    </p>
                    <p className="text-[11px] text-white/50 mb-4">live listings on campus</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-whatsapp-bright font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-bright" />
                      WhatsApp handoff
                    </div>
                  </div>
                </div>

                {/* Floating accent chip */}
                <div className="blob absolute -bottom-6 -left-6 glass-dark rounded-2xl px-4 py-3 flex items-center gap-2 shadow-xl">
                  <span className="text-lg">💬</span>
                  <div>
                    <p className="text-xs font-bold text-white">No middleman</p>
                    <p className="text-[10px] text-white/50">Chat &amp; pay directly</p>
                  </div>
                </div>
                <div className="blob absolute -top-5 -right-3 glass-dark rounded-2xl px-4 py-3 flex items-center gap-2 shadow-xl" style={{ animationDelay: '4s' }}>
                  <span className="text-lg">🛡️</span>
                  <div>
                    <p className="text-xs font-bold text-white">Verified sellers</p>
                    <p className="text-[10px] text-white/50">Every one approved</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade into paper */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-paper to-transparent pointer-events-none" />
      </section>

      {/* What is Campus Plug? — plain-English explainer for crawlers and new visitors */}
      <section className="relative py-16 md:py-24 bg-paper">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="hairline rounded-3xl bg-surface px-6 py-12 md:px-12 md:py-16 text-center shadow-lift">
            <p className="eyebrow text-gold-dark mb-4">The marketplace</p>
            <h2 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-6">
              What is <em className="font-serif-accent gradient-text">Campus Plug</em>?
            </h2>
            <p className="text-lg md:text-xl text-ink-muted leading-relaxed">
              Campus Plug is a student marketplace built for the University of Ghana community. Browse verified student sellers offering services like braiding, tutoring, home-cooked meals, phone repairs, and everyday products — then message them directly on WhatsApp to book. Every seller is a verified UG student.
            </p>
          </div>
        </div>
      </section>

      {/* Live on Campus — logged-out preview of the marketplace */}
      {liveListings.length > 0 && (
        <section className="relative py-24 md:py-32 bg-off-white overflow-hidden">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)',
              backgroundSize: '30px 30px'
            }}
          ></div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12 md:mb-16">
              <p className="eyebrow text-gold-dark mb-4">01 · Fresh on campus</p>
              <h2 className="text-4xl md:text-6xl font-bold text-ink leading-tight">
                See what&apos;s fresh <em className="font-serif-accent gradient-text">right now</em>
              </h2>
              <p className="text-ink-muted mt-3">This week on Campus Plug</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {liveListings.map((listing, idx) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  index={idx}
                  preview
                  staggerSeconds={0.1}
                />
              ))}
            </div>

            <div className="text-center mt-12 md:mt-14">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl shadow-charcoal/25"
              >
                Browse the board
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="relative py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="eyebrow text-gold-dark mb-4">02 · How it works</p>
            <h2 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-3">
              How it <em className="font-serif-accent gradient-text">works</em>
            </h2>
            <p className="text-lg md:text-xl text-ink-muted">
              Three steps. That&apos;s it.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {howItWorks.map((step, idx) => (
              <div
                key={step.number}
                className="fade-up card-lift group relative bg-surface hairline p-8 md:p-10 rounded-3xl"
                style={{ animationDelay: (idx * 0.1) + 's' }}
              >
                <span className="absolute top-6 right-8 text-4xl md:text-5xl font-bold text-gold/30 group-hover:text-gold transition-colors font-mono">
                  {step.number}
                </span>
                <div className="text-6xl mb-6">{step.emoji}</div>
                <h3 className="text-2xl md:text-3xl font-bold text-ink mb-2">
                  {step.title}
                </h3>
                <p className="text-ink-muted leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explore by Category */}
      {visibleCategories.length > 0 && (
        <section className="relative py-20 md:py-28 bg-off-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12 md:mb-16">
              <p className="eyebrow text-gold-dark mb-4">03 · Explore categories</p>
              <h2 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-3">
                Explore by <em className="font-serif-accent gradient-text">category</em>
              </h2>
              <p className="text-lg md:text-xl text-ink-muted">
                Find exactly what you need
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {visibleCategories.map((c, idx) => {
                const count = categoryCounts.get(c.slug) || 0
                return (
                  <Link
                    key={c.slug}
                    href="/login"
                    className="fade-up card-lift group inline-flex items-center gap-2 bg-surface hairline text-ink px-5 py-2.5 rounded-full font-semibold text-sm hover:border-gold hover:text-gold-dark transition-colors"
                    style={{ animationDelay: (idx * 0.07) + 's' }}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                    <span className="text-ink/20 group-hover:text-gold/40">·</span>
                    <span className="font-mono text-ink-muted group-hover:text-gold-dark">{count}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Why Campus Plug */}
      <section className="relative py-20 md:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 md:mb-16">
            <p className="eyebrow text-gold-dark mb-4">04 · Why campus plug</p>
            <h2 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-3">
              Why Campus <em className="font-serif-accent gradient-text">Plug</em>
            </h2>
            <p className="text-lg md:text-xl text-ink-muted">
              Built for campus
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            {whyCards.map((card, idx) => (
              <div
                key={card.title}
                className="fade-up card-lift group bg-surface hairline p-8 md:p-10 rounded-3xl"
                style={{ animationDelay: (idx * 0.07) + 's' }}
              >
                <div className="text-5xl mb-4">{card.icon}</div>
                <h3 className="text-xl md:text-2xl font-bold text-ink mb-2">
                  {card.title}
                </h3>
                <p className="text-ink-muted leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wanted Board — Request a Plug */}
      <section className="relative py-20 md:py-28 bg-off-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="eyebrow text-gold-dark mb-4">05 · Wanted board</p>
            <h2 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-4">
              Need something <em className="font-serif-accent gradient-text">specific</em>?
            </h2>
            <p className="text-lg md:text-xl text-ink-muted max-w-2xl mx-auto">
              Put it on the board and sellers will pitch you directly on WhatsApp.
            </p>
          </div>
          <div className="text-center">
            <Link
              href="/requests"
              className="group inline-flex items-center gap-2 bg-gold-signal text-ink px-8 py-4 rounded-full font-bold hover:bg-gold-vivid transition-all hover:scale-[1.03] shadow-lg shadow-gold-glow"
            >
              Put it on the board
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 md:py-32 overflow-hidden bg-gradient-to-br from-charcoal to-black">
        <div className="absolute inset-0 overflow-hidden">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/20 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-10 right-0 w-96 h-96 bg-gold/10 rounded-full blur-3xl" style={{ animationDelay: '6s' }}></div>
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="fade-up text-5xl md:text-7xl font-bold text-white leading-tight tracking-tight mb-6">
            Ready to <em className="font-serif-accent italic text-gold">plug in</em>? 🔌
          </h2>
          <p className="fade-up fade-up-delay-1 text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            Join UG students already earning and buying on Campus Plug.
          </p>
          <Link
            href="/login"
            className="fade-up fade-up-delay-2 inline-flex items-center gap-2 bg-gold text-charcoal px-10 py-5 rounded-full font-bold text-lg hover:bg-gold-dark transition-all hover:scale-105 shadow-2xl shadow-gold/30"
          >
            Get Started Free
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-charcoal text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
              <span className="text-xl font-bold">Campus Plug</span>
            </Link>

            <p className="text-sm text-white/60 text-center">
              Made with <span className="text-gold">💛</span> in Ghana for UG students
            </p>

            <div className="flex gap-6 text-sm">
              <Link href="/requests" className="text-white/60 hover:text-gold transition-colors">
                Wanted Board
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Login
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Sign up
              </Link>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="text-white/60 hover:text-gold transition-colors"
              >
                Send feedback
              </button>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-xs text-white/40">
            © 2026 Campus Plug. All rights reserved.
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-gold transition-colors">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-gold transition-colors">Terms</Link>
          </div>
        </div>
      </footer>

      {/* Sticky mobile "Post yours" CTA */}
      <div className="fixed bottom-4 right-4 md:hidden z-40">
        <Link
          href="/login"
          className="flex items-center gap-2 bg-gold text-charcoal px-5 py-3 rounded-full font-bold text-sm shadow-xl shadow-gold/30 hover:bg-gold-dark transition-all hover:scale-105"
        >
          ＋ Post yours — free
        </Link>
      </div>

      <FeedbackModal key={feedbackOpen ? 'open' : 'closed'} isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </main>
  )
}
