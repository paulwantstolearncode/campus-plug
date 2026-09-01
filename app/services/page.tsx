'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { formatPriceRange } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoriesByType, getCategoryDisplay } from '@/lib/categories'
import { CAMPUS_LOCATIONS, ALL_LOCATIONS } from '@/lib/campusLocations'
import StarRating from '@/app/StarRating'
import { getSellerRatings, type SellerRating } from '@/lib/reviews'
import NavBar from '@/app/components/NavBar'
import { ListingCardSkeleton } from '@/app/components/Skeleton'

interface Service {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  service_duration: string | null
  service_location: string | null
  category: string | null
  seller_id: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_items: { price: number }[] | null
  listing_images: { id: string }[] | null
}

/** Curated location chips for the filter bar. */
const LOCATION_CHIPS = [
  'All Locations',
  ...CAMPUS_LOCATIONS.halls,
  ...CAMPUS_LOCATIONS.hostels,
  'Off-campus',
  'I come to you',
  'We meet on campus',
  'Delivery available',
]

const SEARCH_PLACEHOLDERS = [
  'Search: past questions, hair braiding, PS5, gas refill, phone repair...',
  'Search: DCIT 201 tutoring, braiding, catering, laundry...',
  'Search: wireless earbuds, laptop stand, generator rental...',
  'Search: manicure, photography, graphic design, typing...',
]

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [sellerRatings, setSellerRatings] = useState<Record<string, SellerRating>>({})

  // Rotating search placeholder
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % SEARCH_PLACEHOLDERS.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  // Read ?q= from URL on mount (so landing page search can link here)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) setSearchQuery(q)
  }, [])

  useEffect(() => {
    async function loadEverything() {
      try {
        const select = '*, seller:profiles!seller_id (full_name, whatsapp_number), listing_items (price), listing_images (id)'
        const baseQuery = (q: ReturnType<typeof supabase.from>) =>
          q.select(select)
            .eq('listing_type', 'service')
            .eq('approval_status', 'approved')
            .is('deleted_at', null)
            .is('sold_at', null)

        // 1) Boosted listings first (paid placement).
        const { data: boosted } = await baseQuery(
          supabase.from('listings')
        ).gt('boosted_until', new Date().toISOString())
          .order('boosted_until', { ascending: false })

        // 2) Regular listings (newest first), excluding already-boosted IDs.
        const boostedIds = new Set((boosted || []).map((l: { id: string }) => l.id))
        const { data: regular, error } = await baseQuery(
          supabase.from('listings')
        ).order('created_at', { ascending: false })

        if (error) {
          console.error('Failed to load services:', error)
        } else if (regular) {
          // Merge: boosted first, then the rest (skip duplicates).
          const merged = [...(boosted || []), ...(regular || []).filter((l: { id: string }) => !boostedIds.has(l.id))] as unknown as Service[]
          setServices(merged)
          const ratings = await getSellerRatings(merged.map((s) => s.seller_id))
          setSellerRatings(ratings)
        }
      } catch (err) {
        console.error('Failed to load services:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEverything()
  }, [])

  const filteredServices = services.filter((s) => {
    if (categoryFilter && s.category !== categoryFilter) return false
    if (locationFilter) {
      if (locationFilter === 'Off-campus') {
        if (!s.service_location?.startsWith('Off-campus')) return false
      } else if (s.service_location !== locationFilter) {
        return false
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const haystack = ((s.title || '') + ' ' + (s.description || '') + ' ' + (s.category || '')).toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  if (loading) {
    return (
      <main className="min-h-screen bg-charcoal">
        <NavBar />
        <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden animated-gradient">
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <div className="h-4 bg-white/10 rounded-full w-32 mb-4 animate-pulse" />
            <div className="h-12 bg-white/10 rounded-xl w-2/3 mb-4 animate-pulse" />
            <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
          </div>
        </section>
        <section className="relative pb-24 bg-off-white -mt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <NavBar />

      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-40 right-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="fade-up inline-flex items-center gap-2 glass px-4 py-2 rounded-full text-sm font-semibold text-gold mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
              </span>
              Services on Campus
            </div>
            <h1 className="fade-up fade-up-delay-1 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[0.95] tracking-tight mb-6">
              Book trusted<br />
              services from<br />
              <span className="gradient-text">fellow students</span>
            </h1>
            <p className="fade-up fade-up-delay-2 text-lg md:text-xl text-white/70 leading-relaxed max-w-2xl">
              Hair styling, tutoring, photography, tech support — all from verified students on campus.
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-off-white to-transparent"></div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white">
        <div className="absolute inset-0 opacity-40" style={{backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">
          {services.length === 0 ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-charcoal to-gray-900 rounded-3xl p-12 md:p-20 text-center border border-white/10">
              <div className="relative">
                <div className="text-6xl mb-4">💼</div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">No services yet</h2>
                <p className="text-white/60 mb-8 max-w-md mx-auto">Be the first to offer your skills to fellow students.</p>
                <Link href="/login" className="inline-flex items-center gap-2 bg-white text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold transition-all hover:scale-105 shadow-xl group">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <p className="text-sm font-semibold text-gold tracking-widest uppercase mb-1">Available Now</p>
                <p className="text-2xl md:text-3xl font-bold text-charcoal">
                  {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''}
                </p>

                {/* Search input with rotating placeholder */}
                <div className="mt-4 relative max-w-lg">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={SEARCH_PLACEHOLDERS[placeholderIdx]}
                    className="w-full px-5 py-3 pr-12 rounded-full bg-white border-2 border-gray-200 text-charcoal text-sm font-medium placeholder:text-gray-400 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 transition-all shadow-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-charcoal text-sm"
                    >
                      ✕
                    </button>
                  )}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-charcoal text-white flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-full bg-white border-2 border-gray-200 text-sm font-semibold text-charcoal focus:outline-none focus:border-gold transition-colors"
                  >
                    <option value="">📋 All Service Categories</option>
                    {getCategoriesByType('service').map((c) => (
                      <option key={c.slug} value={c.slug}>{c.emoji} {c.label}</option>
                    ))}
                  </select>
                  {categoryFilter && (
                    <button
                      onClick={() => setCategoryFilter('')}
                      className="text-xs font-semibold text-gray-500 hover:text-charcoal underline underline-offset-2 transition-colors"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mr-1">Location</span>
                  {LOCATION_CHIPS.map((loc) => {
                    const isActive = locationFilter === loc || (loc === 'All Locations' && !locationFilter)
                    return (
                      <button
                        key={loc}
                        onClick={() => setLocationFilter(loc === 'All Locations' ? '' : loc)}
                        className={
                          'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border ' +
                          (isActive
                            ? 'bg-gold-soft text-charcoal font-bold border-gold'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gold hover:text-charcoal')
                        }
                      >
                        📍 {loc}
                      </button>
                    )
                  })}
                  {locationFilter && (
                    <button
                      onClick={() => setLocationFilter('')}
                      className="text-xs font-semibold text-gray-500 hover:text-charcoal underline underline-offset-2 transition-colors ml-1"
                    >
                      ✕ Clear location
                    </button>
                  )}
                </div>
              </div>

              {filteredServices.length === 0 ? (
                <div className="relative overflow-hidden bg-gradient-to-br from-off-white to-white rounded-3xl p-12 md:p-16 text-center border border-gray-200 shadow-sm">
                  <div className="relative">
                    <div className="text-6xl mb-4 opacity-60">🔍</div>
                    <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">
                      {searchQuery.trim()
                        ? <>Nothing on the board for ‘{searchQuery}’ — yet.</>
                        : 'Nothing matching your filters yet'
                      }
                    </h2>
                    <p className="text-gray-500 mb-8 max-w-lg mx-auto leading-relaxed">
                      {searchQuery.trim()
                        ? 'Be the first to offer it — or put it on the Wanted Board and verified student sellers will pitch you directly.'
                        : 'Try different filters, or put it on the Wanted Board and verified student sellers will pitch you directly.'
                      }
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link
                        href="/requests"
                        className="inline-flex items-center justify-center gap-2 bg-gold text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold-dark transition-all hover:scale-105 shadow-lg shadow-gold/25 group"
                      >
                        Post a Wanted request
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                      </Link>
                      {(searchQuery.trim() || categoryFilter || locationFilter) && (
                        <button
                          onClick={() => { setSearchQuery(''); setCategoryFilter(''); setLocationFilter('') }}
                          className="inline-flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-charcoal px-8 py-4 rounded-full font-semibold hover:border-gold transition-all text-sm"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredServices.map((service, idx) => {
                  const cat = getCategoryDisplay(service.category)
                  return (
                  <div key={service.id} className="group relative fade-up" style={{ animationDelay: (idx * 0.05) + 's' }}>
                    <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">
                      <Link href={"/listing/" + service.id} className="relative block aspect-[4/5] overflow-hidden bg-gray-100">
                        {service.image_url ? (
                          <Image src={service.image_url} alt={service.title} fill sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw" className="object-cover group-hover:scale-110 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                            <span className="text-7xl opacity-40">💼</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/60 to-transparent"></div>
                        <div className="absolute top-4 left-4 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-gold rounded-full"></span>
                          Service
                        </div>
                        <div className="absolute top-4 right-4 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
                          {formatPriceRange(service.listing_items) || 'GH₵ ' + Number(service.price).toLocaleString()}
                        </div>
                        {sellerRatings[service.seller_id]?.is_top_rated && (
                          <div className="absolute top-16 left-4 bg-gold text-charcoal px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1">
                            ⭐ Top Rated
                          </div>
                        )}
                        {service.listing_images && service.listing_images.length > 1 && (
                          <div className="absolute top-16 right-4 glass px-2.5 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                            🖼 {service.listing_images.length}
                          </div>
                        )}
                        <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end text-white">
                          <h3 className="text-xl md:text-2xl font-bold mb-2 line-clamp-2 group-hover:translate-x-1 hover:text-gold transition-all">{service.title}</h3>
                          {service.category && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full mb-2 w-fit bg-gold/20 text-gold">
                              {cat.emoji} {cat.label}
                            </span>
                          )}
                          {service.seller?.full_name && (
                            <p className="text-sm text-white/90 mb-2 flex items-center gap-1.5">
                              <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-xs">{formatName(service.seller.full_name).charAt(0)}</span>
                              {formatName(service.seller.full_name)}
                              {sellerRatings[service.seller_id]?.review_count ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold" title={'Average ' + Number(sellerRatings[service.seller_id].average_rating).toFixed(1) + ' across ' + sellerRatings[service.seller_id].review_count + ' reviews'}>
                                  <StarRating rating={Number(sellerRatings[service.seller_id].average_rating) || 0} size="sm" />
                                  {Number(sellerRatings[service.seller_id].average_rating).toFixed(1)} ({sellerRatings[service.seller_id].review_count})
                                </span>
                              ) : null}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/80">
                            {service.service_duration && (<span className="flex items-center gap-1">⏱ {service.service_duration}</span>)}
                            {service.service_location && (<span className="flex items-center gap-1">📍 {service.service_location}</span>)}
                          </div>
                        </div>
                      </Link>
                      <div className="p-4 flex gap-2">
                        <Link href={"/services/" + service.id + "/book"} className="flex-1 flex items-center justify-center gap-2 bg-charcoal text-white py-3 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm group/btn">
                          📅 Book Now <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                        </Link>
                        {service.seller?.whatsapp_number && (
                          <a href={"https://wa.me/" + service.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I'm interested in your \"" + service.title + "\" service on Campus Plug 🔌")} target="_blank" rel="noopener noreferrer" className="w-12 h-12 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110" title="Message on WhatsApp">💬</a>
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}