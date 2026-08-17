'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ListingCard, { type ListingCardData } from '@/app/ListingCard'
import { CATEGORIES } from '@/lib/categories'

interface MarketplaceStats {
  sellerCount: number
  listingCount: number
}

export default function LandingPage() {
  const [liveListings, setLiveListings] = useState<ListingCardData[]>([])
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map())
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
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

    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
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
    <main className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-charcoal tracking-tight">
              Campus Plug
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-charcoal hover:text-gold transition-colors px-3 py-2"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="bg-charcoal text-white px-4 sm:px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-all hover:scale-105 shadow-lg shadow-charcoal/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section with Animated Background */}
      <section className="relative min-h-[70vh] flex items-center pt-20 pb-16 md:pb-24">
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-20 -left-20 w-72 h-72 bg-gold/20 rounded-full blur-3xl"></div>
          <div className="blob absolute top-40 right-0 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute bottom-0 left-1/3 w-80 h-80 bg-blue-300/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 w-full">
          <div className="text-center max-w-4xl mx-auto">
            {/* Social proof — live counts, placeholder until fetched */}
            <div className="fade-up inline-flex items-center gap-2.5 glass-light px-4 py-2 rounded-full text-sm font-semibold text-charcoal mb-4 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              {stats
                ? stats.sellerCount + ' UG students. ' + stats.listingCount + ' listings. Live.'
                : 'Live at UG 🇬🇭'}
            </div>

            {/* Trust badge — replaces the old "Now live at University of Ghana" pill */}
            <div className="fade-up inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-5 py-2.5 rounded-full border border-charcoal/15 bg-white/70 backdrop-blur text-charcoal mb-8 shadow-lg max-w-[95vw]">
              <svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span className="uppercase tracking-widest text-[10px] sm:text-[11px] font-bold">
                The trusted plug for UG
              </span>
              <span className="text-charcoal/25">—</span>
              <span className="text-xs sm:text-sm font-medium normal-case">
                Every listing reviewed by a real person
              </span>
            </div>

            {/* Main headline */}
            <h1 className="fade-up fade-up-delay-1 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-charcoal leading-[0.95] tracking-tight mb-6">
              Campus help, without<br />
              the <em className="font-serif-accent italic text-gold">guesswork</em>.
            </h1>

            <p className="fade-up fade-up-delay-2 text-lg sm:text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10 px-4">
              Find a verified braider, tutor, cook or repairer on campus — then chat directly and agree your terms.
            </p>

            {/* CTA Buttons */}
            <div className="fade-up fade-up-delay-3 flex flex-col sm:flex-row gap-3 justify-center items-center px-4 mb-16">
              <Link
                href="/services"
                className="w-full sm:w-auto group bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl shadow-charcoal/25 flex items-center justify-center gap-2"
              >
                Explore the plug
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto glass-light text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-white transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2 border border-gray-200"
              >
                Start selling
              </Link>
            </div>

            {/* Trust badges */}
            <div className="fade-up fade-up-delay-4 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gold/10 flex items-center justify-center">
                  <span className="text-gold text-xs">✓</span>
                </div>
                Verified sellers
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gold/10 flex items-center justify-center">
                  <span className="text-gold text-xs">✓</span>
                </div>
                WhatsApp booking
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gold/10 flex items-center justify-center">
                  <span className="text-gold text-xs">✓</span>
                </div>
                Ghana Cedis
              </div>
            </div>
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
              <div className="inline-flex items-center gap-2 bg-gold text-charcoal px-4 py-2 rounded-full text-sm font-semibold mb-3 shadow-lg">
                FEATURED <span className="text-charcoal/50">/</span> 01
              </div>
              <p className="text-sm italic text-gray-500 mb-3">This week on Campus Plug</p>
              <h2 className="text-4xl md:text-6xl font-bold text-charcoal leading-tight">
                See what&apos;s fresh <span className="gradient-text">right now</span>
              </h2>
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
                See all listings
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
            <h2 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight mb-3">
              How it <em className="font-serif-accent italic text-gold">works</em>
            </h2>
            <p className="text-lg md:text-xl text-gray-500">
              Three steps. That&apos;s it.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {howItWorks.map((step, idx) => (
              <div
                key={step.number}
                className="fade-up group relative bg-off-white p-8 md:p-10 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
                style={{ animationDelay: (idx * 0.1) + 's' }}
              >
                <span className="absolute top-6 right-8 text-4xl md:text-5xl font-bold text-gold/30 group-hover:text-gold transition-colors">
                  {step.number}
                </span>
                <div className="text-6xl mb-6">{step.emoji}</div>
                <h3 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
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
              <h2 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight mb-3">
                Explore by <em className="font-serif-accent italic text-gold">category</em>
              </h2>
              <p className="text-lg md:text-xl text-gray-500">
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
                    className="fade-up group inline-flex items-center gap-2 bg-white border border-charcoal/15 text-charcoal px-5 py-2.5 rounded-full font-semibold text-sm hover:border-gold hover:text-gold transition-colors"
                    style={{ animationDelay: (idx * 0.07) + 's' }}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                    <span className="text-charcoal/20 group-hover:text-gold/40">·</span>
                    <span className="text-gray-400 group-hover:text-gold">{count}</span>
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
            <h2 className="text-4xl md:text-5xl font-bold text-charcoal leading-tight mb-3">
              Why Campus <em className="font-serif-accent italic text-gold">Plug</em>
            </h2>
            <p className="text-lg md:text-xl text-gray-500">
              Built for campus
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            {whyCards.map((card, idx) => (
              <div
                key={card.title}
                className="fade-up group bg-off-white p-8 md:p-10 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
                style={{ animationDelay: (idx * 0.07) + 's' }}
              >
                <div className="text-5xl mb-4">{card.icon}</div>
                <h3 className="text-xl md:text-2xl font-bold text-charcoal mb-2">
                  {card.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
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
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Login
              </Link>
              <Link href="/login" className="text-white/60 hover:text-gold transition-colors">
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center text-xs text-white/40">
            © 2026 Campus Plug. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  )
}
