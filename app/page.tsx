'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import LandingPage from './LandingPage'
import { formatPriceRange } from '@/lib/format'

interface Listing {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  seller_id: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_items: { price: number }[] | null
  listing_images: { id: string }[] | null
}

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([])
  const [isSeller, setIsSeller] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [filter, setFilter] = useState<'all' | 'product' | 'service' | 'mine'>('all')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function loadEverything() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        // Fetch listings for EVERYONE — a profile lookup that fails (or a
        // user with no profile row) must never blank out the marketplace.
        const { data, error } = await supabase
          .from('listings')
          .select('*, seller:profiles!seller_id (full_name, whatsapp_number), listing_items (price), listing_images (id)')
          .eq('approval_status', 'approved')
          .order('created_at', { ascending: false })

        if (error) {
          // First place to look when the feed is empty: this prints e.g. a
          // missing-relation error if the listing_items migration hasn't been
          // run, or an RLS denial for the current role.
          console.error('Failed to load listings:', error)
        } else if (data) {
          setListings(data as unknown as Listing[])
        }

        // Seller/admin flags are best-effort UI only — independent of the
        // listings fetch and failure-tolerant (worst case: no Sell/Admin
        // buttons, the feed still renders).
        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_seller, is_admin')
            .eq('id', user.id)
            .single()

          if (profileError) {
            console.error('Failed to load profile flags:', profileError)
          }
          setIsSeller(profile?.is_seller || false)
          setIsAdmin(profile?.is_admin || false)
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
    try {
      await supabase.auth.signOut()
    } catch (err) {
      // Even if sign-out fails on the network, the local session is dropped
      // by the reload below, so never leave the button appearing dead.
      console.error('Logout failed:', err)
    } finally {
      setUser(null)
      window.location.reload()
    }
  }

  const handleDelete = async (listingId: string, listingTitle: string) => {
    if (!confirm('Delete "' + listingTitle + '"?\n\nThis cannot be undone.')) return

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        alert('You must be logged in')
        return
      }

      // Scope the delete to the current user's own listing — defense in depth
      // in case the RLS delete policy is ever misconfigured.
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId)
        .eq('seller_id', user.id)

      if (error) {
        alert('Failed to delete: ' + error.message)
      } else {
        // Best-effort: remove the listing's image from storage so deleted
        // listings don't leave orphaned blobs behind forever.
        const imageUrl = listings.find(l => l.id === listingId)?.image_url
        const marker = '/listing-images/'
        const markerIndex = imageUrl ? imageUrl.indexOf(marker) : -1
        if (markerIndex !== -1) {
          const fileName = imageUrl!.slice(markerIndex + marker.length).split('?')[0]
          if (fileName) {
            try {
              await supabase.storage.from('listing-images').remove([fileName])
            } catch {
              // Non-fatal: the listing row is already deleted.
            }
          }
        }
        setListings(prev => prev.filter(l => l.id !== listingId))
      }
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Something went wrong. Please try again.')
    }
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

  const filteredListings = listings
    .filter(l => {
      if (filter === 'mine') return user ? l.seller_id === user.id : false
      if (filter === 'all') return true
      return l.listing_type === filter
    })
    .filter(l => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return (
        l.title.toLowerCase().includes(query) ||
        (l.description?.toLowerCase().includes(query) ?? false)
      )
    })

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className={"fixed top-0 w-full z-50 transition-all duration-300 " + (scrolled ? "bg-charcoal/80 backdrop-blur-xl border-b border-white/10" : "bg-transparent")}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
              <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
            </Link>
            <div className="hidden md:flex gap-6">
              <Link href="/" className="text-sm font-medium text-white border-b-2 border-gold pb-1">All</Link>
              <Link href="/services" className="text-sm font-medium text-white/60 hover:text-gold transition-colors">Services</Link>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <span className="hidden lg:block text-sm text-white/60 max-w-[180px] truncate" title={user.email}>{user.email}</span>
            {isAdmin && (
              <Link href="/admin" className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-semibold hover:bg-red-500/30 hover:text-red-300 transition-colors">🛡️ Admin</Link>
            )}
            {isSeller && (
              <span className="bg-gold/20 text-gold px-3 py-1 rounded-full text-xs font-semibold border border-gold/30">✓ Seller</span>
            )}
            {isSeller && (
              <Link href="/dashboard" className="bg-white/10 text-white px-3 py-1 rounded-full text-xs font-semibold border border-white/20 hover:bg-white/20 transition-colors">📊 Dashboard</Link>
            )}
            {isSeller ? (
              <Link href="/new" className="bg-white text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:bg-gold transition-all hover:scale-105">+ Post</Link>
            ) : (
              <Link href="/become-seller" className="shine-button text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-transform">Sell</Link>
            )}
            <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">Logout</button>
          </div>

          <div className="md:hidden flex items-center gap-3">
            {isSeller ? (
              <Link href="/new" className="bg-white text-charcoal px-4 py-2 rounded-full text-sm font-semibold">+ Post</Link>
            ) : (
              <Link href="/become-seller" className="shine-button text-charcoal px-4 py-2 rounded-full text-sm font-semibold">Sell</Link>
            )}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white p-2 -mr-2" aria-label="Menu">
              {mobileMenuOpen ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-charcoal/95 backdrop-blur-xl border-t border-white/10 px-4 py-4">
            <div className="flex flex-col gap-1">
              <div className="px-4 py-3 border-b border-white/10 mb-2">
                <p className="text-xs text-white/50 mb-1">Signed in as</p>
                <p className="text-sm text-white truncate">{user.email}</p>
                {isSeller && (
                  <span className="inline-block mt-2 bg-gold/20 text-gold px-2 py-0.5 rounded-full text-xs font-semibold border border-gold/30">✓ Seller</span>
                )}
                {isAdmin && (
                  <span className="inline-block mt-2 ml-1.5 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-semibold border border-red-500/30">🛡️ Admin</span>
                )}
              </div>
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"><span>✨</span> All Listings</Link>
              <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"><span>💼</span> Services</Link>
              {isAdmin && (<Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3"><span>🛡️</span> Admin Panel</Link>)}
              {isSeller && (<Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"><span>📊</span> Dashboard</Link>)}
              {isSeller && (<Link href="/new" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"><span>➕</span> Post New Listing</Link>)}
              {!isSeller && (<Link href="/become-seller" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"><span>💚</span> Become a Seller</Link>)}
              <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 text-left"><span>🚪</span> Logout</button>
            </div>
          </div>
        )}
      </nav>

      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-40 right-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '5s'}}></div>
          <div className="blob absolute bottom-0 left-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" style={{animationDelay: '10s'}}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px'}}></div>

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
            <p className="fade-up fade-up-delay-2 text-lg md:text-xl text-white/70 leading-relaxed max-w-2xl mb-8">
              Products and services from verified students on your campus.
            </p>

            {/* SEARCH BAR */}
            <div className="fade-up fade-up-delay-3 max-w-xl">
              <div className="relative">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search for anything..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-14 pr-14 py-4 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:border-gold focus:bg-white/15 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                    aria-label="Clear search"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-off-white to-transparent"></div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white">
        <div className="absolute inset-0 opacity-40" style={{backgroundImage: 'radial-gradient(circle, #d4af37 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">
          {listings.length === 0 ? (
            <div className="relative overflow-hidden bg-gradient-to-br from-charcoal to-gray-900 rounded-3xl p-12 md:p-20 text-center border border-white/10">
              <div className="relative">
                <div className="text-6xl mb-4">🛒</div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Nothing here yet</h2>
                <p className="text-white/60 mb-8 max-w-md mx-auto">Be the first to list something amazing on Campus Plug.</p>
                {isSeller ? (
                  <Link href="/new" className="inline-flex items-center gap-2 bg-white text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold transition-all hover:scale-105 shadow-xl group">
                    Post Your First Item <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                ) : (
                  <Link href="/become-seller" className="inline-flex items-center gap-2 shine-button text-charcoal px-8 py-4 rounded-full font-semibold hover:scale-105 transition-transform shadow-xl">
                    Become a Seller <span>→</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <p className="text-sm font-semibold text-gold tracking-widest uppercase mb-1">Marketplace</p>
                  <p className="text-2xl md:text-3xl font-bold text-charcoal">
                    {filteredListings.length} {searchQuery ? 'result' : (filter === 'all' ? 'listing' : (filter === 'mine' ? 'my listing' : filter))}{filteredListings.length !== 1 ? 's' : ''}
                    {searchQuery && <span className="text-gray-500 text-lg font-normal ml-2">for &quot;{searchQuery}&quot;</span>}
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                  {[
                    { key: 'all' as const, label: 'All', icon: '✨' },
                    { key: 'product' as const, label: 'Products', icon: '📦' },
                    { key: 'service' as const, label: 'Services', icon: '💼' },
                    ...(isSeller ? [{ key: 'mine' as const, label: 'My Listings', icon: '🏠' }] : []),
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => setFilter(chip.key)}
                      className={"px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all " + (filter === chip.key ? "bg-charcoal text-white shadow-lg scale-105" : "bg-white text-charcoal hover:bg-charcoal hover:text-white border border-gray-200")}
                    >
                      <span className="mr-1.5">{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredListings.length === 0 ? (
                filter === 'mine' ? (
                  <div className="text-center py-20">
                    <div className="text-6xl mb-4 opacity-50">🏠</div>
                    <p className="text-xl font-semibold text-charcoal mb-2">You haven&apos;t posted any listings yet</p>
                    <p className="text-gray-500 mb-6">
                      {searchQuery ? 'Try different keywords or clear filters.' : 'Once approved, your listings appear here.'}
                    </p>
                    {isSeller ? (
                      <Link href="/new" className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-all hover:scale-105">
                        + Post your first listing
                      </Link>
                    ) : (
                      <Link href="/become-seller" className="inline-flex items-center gap-2 shine-button text-charcoal px-6 py-3 rounded-full font-semibold hover:scale-105 transition-transform">
                        Start selling →
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="text-6xl mb-4 opacity-50">🔍</div>
                    <p className="text-xl font-semibold text-charcoal mb-2">No results found</p>
                    <p className="text-gray-500">Try different keywords or clear filters</p>
                  </div>
                )
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredListings.map((item, idx) => {
                    const isOwner = user && item.seller_id === user.id
                    const priceLabel = formatPriceRange(item.listing_items) || 'GH₵ ' + Number(item.price || 0).toLocaleString()
                    return (
                      <div key={item.id} className="group relative fade-up" style={{ animationDelay: (idx * 0.05) + 's' }}>
                        <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">
                          <Link href={"/listing/" + item.id} className="relative block aspect-square overflow-hidden bg-gray-100">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                                <span className="text-7xl opacity-40">{item.listing_type === 'service' ? '💼' : '📦'}</span>
                              </div>
                            )}
                            <div className="absolute top-3 left-3 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="w-2 h-2 bg-gold rounded-full"></span>
                              {item.listing_type === 'service' ? 'Service' : 'Product'}
                            </div>
                            <div className="absolute top-3 right-3 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
                              {priceLabel}
                            </div>
                            {item.listing_images && item.listing_images.length > 1 && (
                              <div className="absolute bottom-3 left-3 glass px-2.5 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                                🖼 {item.listing_images.length}
                              </div>
                            )}
                            {isOwner && (
                              <div className="absolute bottom-3 right-3 bg-blue-500/90 backdrop-blur text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg">
                                Your listing
                              </div>
                            )}
                          </Link>
                          <div className="p-5">
                            <Link href={"/listing/" + item.id} className="block">
                              <h3 className="font-bold text-charcoal text-lg line-clamp-1 mb-1 hover:text-gold-dark transition-colors">{item.title}</h3>
                            </Link>
                            {item.seller?.full_name && (
                              <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-gold/10 text-gold-dark flex items-center justify-center text-xs font-semibold">{item.seller.full_name.charAt(0)}</span>
                                {item.seller.full_name}
                              </p>
                            )}
                            <div className="flex gap-2">
                              {isOwner ? (
                                <>
                                  <Link href={"/new?edit=" + item.id} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                                    ✏️ Edit
                                  </Link>
                                  <button
                                    onClick={() => handleDelete(item.id, item.title)}
                                    className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 transition-all hover:scale-110 shrink-0"
                                    title="Delete listing"
                                  >
                                    🗑️
                                  </button>
                                </>
                              ) : (
                                <>
                                  {item.listing_type === 'service' ? (
                                    <Link href={"/services/" + item.id + "/book"} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                                      📅 Book
                                    </Link>
                                  ) : (
                                    item.seller?.whatsapp_number && (
                                      <a href={"https://wa.me/" + item.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I'm interested in your \"" + item.title + "\" listing on Campus Plug 🔌")} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                                        💬 Message
                                      </a>
                                    )
                                  )}
                                  {item.listing_type === 'service' && item.seller?.whatsapp_number && (
                                    <a href={"https://wa.me/" + item.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I have a question about your \"" + item.title + "\" service on Campus Plug 🔌")} target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110 shrink-0" title="Message on WhatsApp">💬</a>
                                  )}
                                </>
                              )}
                            </div>
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