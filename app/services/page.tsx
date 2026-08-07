'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { formatPriceRange } from '@/lib/format'

interface Service {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  service_duration: string | null
  service_location: string | null
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_items: { price: number }[] | null
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [isSeller, setIsSeller] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    async function loadEverything() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_seller, is_admin')
            .eq('id', user.id)
            .single()

          setIsSeller(profile?.is_seller || false)
          setIsAdmin(profile?.is_admin || false)
        }

       const { data } = await supabase
  .from('listings')
  .select('*, seller:profiles!seller_id (full_name, whatsapp_number), listing_items (price)')
  .eq('listing_type', 'service')
  .eq('approval_status', 'approved')
  .order('created_at', { ascending: false })

        if (data) setServices(data as unknown as Service[])
      } catch (err) {
        // A failed auth/network lookup must not strand the page on the
        // loading screen forever.
        console.error('Failed to load services:', err)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading services...</p>
        </div>
      </div>
    )
  }

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
              <Link href="/" className="text-sm font-medium text-white/60 hover:text-gold transition-colors">All</Link>
              <Link href="/services" className="text-sm font-medium text-white border-b-2 border-gold pb-1">Services</Link>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <>
                <span className="hidden lg:block text-sm text-white/60 max-w-[180px] truncate" title={user.email}>{user.email}</span>
                {isAdmin && (
                  <Link href="/admin" className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-semibold hover:bg-red-500/30 hover:text-red-300 transition-colors">🛡️ Admin</Link>
                )}
                {isSeller && (
                  <span className="bg-gold/20 text-gold px-3 py-1 rounded-full text-xs font-semibold border border-gold/30">✓ Seller</span>
                )}
                {isSeller ? (
                  <Link href="/new" className="bg-white text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:bg-gold transition-all hover:scale-105">+ Post</Link>
                ) : (
                  <Link href="/become-seller" className="shine-button text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-transform">Sell</Link>
                )}
                <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">Logout</button>
              </>
            ) : (
              <Link href="/login" className="bg-gold text-charcoal px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-gold-dark transition-all hover:scale-105">Get Started</Link>
            )}
          </div>

          <div className="md:hidden flex items-center gap-3">
            {user ? (
              isSeller ? (
                <Link href="/new" className="bg-white text-charcoal px-4 py-2 rounded-full text-sm font-semibold">+ Post</Link>
              ) : (
                <Link href="/become-seller" className="shine-button text-charcoal px-4 py-2 rounded-full text-sm font-semibold">Sell</Link>
              )
            ) : (
              <Link href="/login" className="bg-gold text-charcoal px-4 py-2 rounded-full text-sm font-semibold">Login</Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-white p-2 -mr-2"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-charcoal/95 backdrop-blur-xl border-t border-white/10 px-4 py-4">
            <div className="flex flex-col gap-1">
              {user && (
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
              )}
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3">
                <span>✨</span> All Listings
              </Link>
              <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3">
                <span>💼</span> Services
              </Link>
              {isAdmin && (
                <Link href="/admin" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3">
                  <span>🛡️</span> Admin Panel
                </Link>
              )}
              {user && isSeller && (
                <Link href="/new" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3">
                  <span>➕</span> Post New Listing
                </Link>
              )}
              {user && !isSeller && (
                <Link href="/become-seller" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3">
                  <span>💚</span> Become a Seller
                </Link>
              )}
              {user ? (
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3 text-left"
                >
                  <span>🚪</span> Logout
                </button>
              ) : (
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-gold hover:bg-gold/10 rounded-xl transition-colors flex items-center gap-3">
                  <span>🔑</span> Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

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
                {user ? (
                  isSeller ? (
                    <Link href="/new" className="inline-flex items-center gap-2 bg-white text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold transition-all hover:scale-105 shadow-xl group">
                      Post Your Service <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </Link>
                  ) : (
                    <Link href="/become-seller" className="inline-flex items-center gap-2 shine-button text-charcoal px-8 py-4 rounded-full font-semibold hover:scale-105 transition-transform shadow-xl">
                      Start Selling <span>→</span>
                    </Link>
                  )
                ) : (
                  <Link href="/login" className="inline-flex items-center gap-2 bg-white text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-gold transition-all hover:scale-105 shadow-xl group">
                    Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-10">
                <p className="text-sm font-semibold text-gold tracking-widest uppercase mb-1">Available Now</p>
                <p className="text-2xl md:text-3xl font-bold text-charcoal">
                  {services.length} service{services.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((service, idx) => (
                  <div key={service.id} className="group relative fade-up" style={{ animationDelay: (idx * 0.05) + 's' }}>
                    <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">
                      <Link href={"/listing/" + service.id} className="relative block aspect-[4/5] overflow-hidden bg-gray-100">
                        {service.image_url ? (
                          <img src={service.image_url} alt={service.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
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
                        <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end text-white">
                          <h3 className="text-xl md:text-2xl font-bold mb-2 group-hover:translate-x-1 hover:text-gold transition-all">{service.title}</h3>
                          {service.seller?.full_name && (
                            <p className="text-sm text-white/90 mb-2 flex items-center gap-1.5">
                              <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-xs">{service.seller.full_name.charAt(0)}</span>
                              {service.seller.full_name}
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
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}