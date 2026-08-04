'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Listing {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
}

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([])
  const [isSeller, setIsSeller] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [filter, setFilter] = useState<'all' | 'product' | 'service'>('all')

  useEffect(() => {
    async function loadEverything() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_seller')
            .eq('id', user.id)
            .single()

          setIsSeller(profile?.is_seller || false)

          const { data } = await supabase
            .from('listings')
            .select('*, seller:profiles!seller_id (full_name, whatsapp_number)')
            .order('created_at', { ascending: false })

          if (data) setListings(data as any)
        }
      } catch (err) {
        console.error('Failed to load:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEverything()

    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading Campus Plug...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  // Filter listings
  const filteredListings = filter === 'all'
    ? listings
    : listings.filter(l => l.listing_type === filter)

  return (
    <main className="min-h-screen bg-charcoal">
      {/* Navigation */}
      <nav className={"fixed top-0 w-full z-50 transition-all duration-300 " + (scrolled ? "bg-charcoal/80 backdrop-blur-xl border-b border-white/10" : "bg-transparent")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
              <span className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Campus Plug
              </span>
            </Link>

            <div className="hidden md:flex gap-6">
              <Link href="/" className="text-sm font-medium text-white border-b-2 border-gold pb-1">
                All
              </Link>
              <Link href="/services" className="text-sm font-medium text-white/60 hover:text-gold transition-colors">
                Services
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isSeller && (
              <span className="hidden md:inline-block bg-gold/20 text-gold px-3 py-1 rounded-full text-xs font-semibold border border-gold/30">
                ✓ Seller
              </span>
            )}

            {isSeller ? (
              <Link
                href="/new"
                className="bg-white text-charcoal px-4 sm:px-5 py-2 rounded-full text-sm font-semibold hover:bg-gold transition-all hover:scale-105"
              >
                + Post
              </Link>
            ) : (
              <Link
                href="/become-seller"
                className="shine-button text-charcoal px-4 sm:px-5 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-transform"
              >
                Sell
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="hidden sm:block text-sm text-white/50 hover:text-white transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Hero — DARK with rich gradients */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden animated-gradient">
        {/* Animated blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-40 right-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute bottom-0 left-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        ></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl">
            <div className="fade-up inline-flex items-center gap-2 glass px-4 py-2 rounded-full text-sm font-semibold text-gold mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
              </span>
              Live on campus
            </div>

            <h1 className="fade-up fade-up-delay-1 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[0.95] tracking-tight mb-6">
              Discover<br />
              <span className="gradient-text">amazing things</span>
            </h1>

            <p className="fade-up fade-up-delay-2 text-lg md:text-xl text-white/70 leading-relaxed max-w-2xl">
              Products and services from verified students on your campus. Find what you need, support who you know.
            </p>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-off-white to-transparent"></div>
      </section>

      {/* Listings Grid — LIGHT with pattern */}
      <section className="relative pb-24 md:pb-32 bg-off-white">
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }}
        ></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {listings.length === 0 ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-charcoal to-gray-900 rounded-3xl p-12 md:p-20 text-center border border-white/10">
              <div className="absolute inset-0 opacity-30">
                <div className="blob absolute top-10 left-10 w-40 h-40 bg-gold/40 rounded-full blur-3xl"></div>
                <div className="blob absolute bottom-10 right-10 w-40 h-40 bg-purple-500/40 rounded-full blur-3xl" style={{animationDelay: '3s'}}></div>
              </div>

              <div className="relative">
                <div className="text-6xl mb-4">🛒</div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Nothing here yet
                </h2>
                <p className="text-white/60 mb-8 max-w-md mx-auto">
                  Be the first to list something amazing on Campus Plug.
                </p>
                {isSeller ? (
                  <Link
                    href="/new"
                    className="inline-flex items-center gap-2 bg-white text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold transition-all hover:scale-105 shadow-xl group"
                  >
                    Post Your First Item
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                ) : (
                  <Link
                    href="/become-seller"
                    className="inline-flex items-center gap-2 shine-button text-charcoal px-8 py-4 rounded-full font-semibold hover:scale-105 transition-transform shadow-xl"
                  >
                    Become a Seller
                    <span>→</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Header + Filter Chips */}
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <p className="text-sm font-semibold text-gold tracking-widest uppercase mb-1">
                    Marketplace
                  </p>
                  <p className="text-2xl md:text-3xl font-bold text-charcoal">
                    {filteredListings.length} {filter === 'all' ? 'listing' : filter}{filteredListings.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Filter chips */}
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                  {[
                    { key: 'all' as const, label: 'All', icon: '✨' },
                    { key: 'product' as const, label: 'Products', icon: '📦' },
                    { key: 'service' as const, label: 'Services', icon: '💼' },
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => setFilter(chip.key)}
                      className={"px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all " + (
                        filter === chip.key
                          ? "bg-charcoal text-white shadow-lg scale-105"
                          : "bg-white text-charcoal hover:bg-charcoal hover:text-white border border-gray-200"
                      )}
                    >
                      <span className="mr-1.5">{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Listings Grid */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredListings.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group relative fade-up"
                    style={{ animationDelay: (idx * 0.05) + 's' }}
                  >
                    <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">

                      {/* Image */}
                      <div className="relative aspect-square overflow-hidden bg-gray-100">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                            <span className="text-7xl opacity-40">
                              {item.listing_type === 'service' ? '💼' : '📦'}
                            </span>
                          </div>
                        )}

                        {/* Type badge */}
                        <div className="absolute top-3 left-3 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-gold rounded-full"></span>
                          {item.listing_type === 'service' ? 'Service' : 'Product'}
                        </div>

                        {/* Price tag */}
                        <div className="absolute top-3 right-3 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
                          GH₵ {Number(item.price || 0).toLocaleString()}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-5">
                        <h3 className="font-bold text-charcoal text-lg line-clamp-1 mb-1">
                          {item.title}
                        </h3>

                        {item.seller?.full_name && (
                          <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-gold/10 text-gold-dark flex items-center justify-center text-xs font-semibold">
                              {item.seller.full_name.charAt(0)}
                            </span>
                            {item.seller.full_name}
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {item.listing_type === 'service' ? (
                            <Link
                              href={"/services/" + item.id + "/book"}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm group/btn"
                            >
                              📅 Book
                              <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                            </Link>
                          ) : (
                            item.seller?.whatsapp_number && (
                              <a
                                href={"https://wa.me/" + item.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I'm interested in your \"" + item.title + "\" listing on Campus Plug 🔌")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm"
                              >
                                💬 Message
                              </a>
                            )
                          )}

                          {item.listing_type === 'service' && item.seller?.whatsapp_number && (
                            <a
                              href={"https://wa.me/" + item.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I have a question about your \"" + item.title + "\" service on Campus Plug 🔌")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110 shrink-0"
                              title="Message on WhatsApp"
                            >
                              💬
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Bottom CTA — DARK animated */}
      {listings.length > 0 && (
        <section className="relative py-24 md:py-32 overflow-hidden animated-gradient">
          <div className="absolute inset-0 overflow-hidden">
            <div className="blob absolute -top-20 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
            <div className="blob absolute -bottom-20 -right-20 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          </div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-block glass px-4 py-2 rounded-full text-sm font-semibold text-gold mb-6">
              {isSeller ? "You're a seller" : "For sellers"}
            </div>

            <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
              {isSeller ? (
                <>Got something new?<br /><span className="gradient-text">Post it now.</span></>
              ) : (
                <>Got a skill?<br /><span className="gradient-text">Turn it into income.</span></>
              )}
            </h2>

            <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl mx-auto leading-relaxed">
              {isSeller
                ? "Reach more students by adding new products or services."
                : "Join fellow students earning by offering services on Campus Plug."}
            </p>

            <Link
              href={isSeller ? "/new" : "/become-seller"}
              className="inline-flex items-center gap-2 shine-button text-charcoal px-10 py-5 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-2xl shadow-gold/50"
            >
              {isSeller ? "Post New Listing" : "Become a Seller"}
              <span>→</span>
            </Link>
          </div>
        </section>
      )}
    </main>
  )
}