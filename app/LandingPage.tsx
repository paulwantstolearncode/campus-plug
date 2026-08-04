'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface FeaturedService {
  id: string
  title: string
  price: number
  image_url: string | null
  service_location: string | null
  seller: {
    full_name: string | null
  } | null
}

export default function LandingPage() {
  const [featuredServices, setFeaturedServices] = useState<FeaturedService[]>([])
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    async function loadFeatured() {
      try {
        const { data } = await supabase
          .from('listings')
          .select(`
            id, title, price, image_url, service_location,
            seller:profiles!seller_id (full_name)
          `)
          .eq('listing_type', 'service')
          .order('created_at', { ascending: false })
          .limit(6)

        // The explicit-column select makes supabase-js infer the embedded
        // `seller` join as an array; at runtime it is a single object (to-one
        // FK join), so cast through unknown.
        if (data) setFeaturedServices(data as unknown as FeaturedService[])
      } catch (err) {
        // Featured section is decorative — a failed fetch should just leave
        // it empty rather than throw an unhandled rejection.
        console.error('Failed to load featured services:', err)
      }
    }
    loadFeatured()

    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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
      <section className="relative min-h-screen flex items-center pt-20 pb-32">
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
            {/* Badge */}
            <div className="fade-up inline-flex items-center gap-2 glass-light px-4 py-2 rounded-full text-sm font-semibold text-charcoal mb-8 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
              </span>
              Now live at University of Ghana
            </div>

            {/* Main headline */}
            <h1 className="fade-up fade-up-delay-1 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-charcoal leading-[0.95] tracking-tight mb-6">
              Every skill.<br />
              <span className="gradient-text">One plug.</span>
            </h1>

            <p className="fade-up fade-up-delay-2 text-lg sm:text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10 px-4">
              The premium marketplace where UG students book trusted services from fellow students.
            </p>

            {/* CTA Buttons */}
            <div className="fade-up fade-up-delay-3 flex flex-col sm:flex-row gap-3 justify-center items-center px-4 mb-16">
              <Link
                href="/login"
                className="w-full sm:w-auto group bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl shadow-charcoal/25 flex items-center justify-center gap-2"
              >
                Explore Services
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto glass-light text-charcoal px-8 py-4 rounded-full font-semibold hover:bg-white transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
              >
                Start Selling
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

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-gray-400">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <div className="w-px h-8 bg-gradient-to-b from-gray-400 to-transparent"></div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-24 md:py-32 bg-off-white overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-gold/5 to-transparent rounded-full"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 md:mb-20">
            <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
              How it works
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-charcoal leading-tight">
              Simple as <span className="gradient-text">1, 2, 3</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                number: '01',
                title: 'Discover',
                description: 'Browse services from verified students in your campus. Filter by category, price, or location.',
                icon: '🔍',
                gradient: 'from-blue-500/10 to-purple-500/10',
              },
              {
                number: '02',
                title: 'Book',
                description: 'Pick your preferred date and time. Get instantly connected via WhatsApp for confirmation.',
                icon: '📅',
                gradient: 'from-gold/10 to-orange-500/10',
              },
              {
                number: '03',
                title: 'Enjoy',
                description: 'Meet up, receive your service, and support fellow students. Rate your experience.',
                icon: '✨',
                gradient: 'from-green-500/10 to-teal-500/10',
              },
            ].map((step) => (
              <div
                key={step.number}
                className="group relative bg-white p-8 md:p-10 rounded-3xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${step.gradient} rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-6xl">{step.icon}</span>
                    <span className="text-4xl font-bold text-gray-200 group-hover:text-gold transition-colors">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Services */}
      {featuredServices.length > 0 && (
        <section className="py-24 md:py-32 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-12 md:mb-16">
              <div>
                <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">
                  Featured
                </div>
                <h2 className="text-4xl md:text-6xl font-bold text-charcoal leading-tight">
                  Popular <span className="gradient-text">right now</span>
                </h2>
              </div>
              <Link
                href="/login"
                className="group flex items-center gap-2 text-charcoal font-semibold hover:text-gold transition-colors"
              >
                View all services
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredServices.map((service, idx) => (
                <Link
                  key={service.id}
                  href="/login"
                  className="group relative overflow-hidden rounded-3xl"
                  style={{ animationDelay: `${idx * 0.1}s` }}
                >
                  <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-gray-100">
                    {service.image_url ? (
                      <img
                        src={service.image_url}
                        alt={service.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/20 via-gold/5 to-transparent">
                        <span className="text-7xl opacity-40">💼</span>
                      </div>
                    )}

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                    {/* Content on image */}
                    <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                      <h3 className="text-xl md:text-2xl font-bold mb-2 group-hover:translate-x-1 transition-transform">
                        {service.title}
                      </h3>
                      {service.seller?.full_name && (
                        <p className="text-sm text-white/80 mb-2">
                          by {service.seller.full_name}
                        </p>
                      )}
                      {service.service_location && (
                        <p className="text-sm text-white/80 mb-3 flex items-center gap-1">
                          <span>📍</span> {service.service_location}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">
                          GH₵ {Number(service.price).toLocaleString()}
                        </span>
                        <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center group-hover:bg-gold group-hover:text-charcoal transition-all">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Stats Section */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {[
              { number: '100+', label: 'Verified students' },
              { number: '50+', label: 'Services available' },
              { number: '0%', label: 'Signup fees' },
              { number: '24/7', label: 'Always open' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl md:text-6xl font-bold gradient-text mb-2">
                  {stat.number}
                </div>
                <div className="text-sm md:text-base text-gray-600">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Sellers CTA */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 animated-gradient"></div>

        {/* Decorative blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="blob absolute top-10 left-10 w-96 h-96 bg-gold/20 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-10 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{animationDelay: '7s'}}></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-block glass px-4 py-2 rounded-full text-sm font-semibold text-gold mb-8">
            For sellers
          </div>

          <h2 className="text-5xl md:text-7xl font-bold text-white leading-tight tracking-tight mb-8">
            Turn your skills<br />
            into <span className="gradient-text">income</span>
          </h2>

          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            Whether you braid hair, tutor calculus, or fix laptops — reach hundreds of students
            actively looking for services like yours.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 shine-button text-charcoal px-10 py-5 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-2xl shadow-gold/50"
          >
            Start Selling Today
            <span>→</span>
          </Link>

          <div className="mt-16 grid grid-cols-3 gap-4 md:gap-8 max-w-3xl mx-auto">
            {[
              { number: '0%', label: 'Signup fees' },
              { number: '100%', label: 'Your prices' },
              { number: '24/7', label: 'Availability' },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-6">
                <div className="text-3xl md:text-5xl font-bold text-gold mb-2">
                  {stat.number}
                </div>
                <div className="text-xs md:text-sm text-white/60">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
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
