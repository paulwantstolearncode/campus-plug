'use client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import LandingPage from './LandingPage'

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
            .select(`
              *,
              seller:profiles!seller_id (
                full_name,
                whatsapp_number
              )
            `)
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
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="text-3xl mb-2">🔌</div>
          <p className="text-gray-500">Loading Campus Plug...</p>
        </div>
      </div>
    )
  }

  // NOT LOGGED IN → Show Landing Page
  if (!user) {
    return <LandingPage />
  }

  // LOGGED IN → Show Marketplace
  return (
    <main className="min-h-screen bg-off-white">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🔌</span>
              <span className="text-xl font-bold text-charcoal tracking-tight">Campus Plug</span>
            </Link>

            <div className="hidden md:flex gap-6">
              <Link href="/" className="text-sm font-medium text-gray-700 hover:text-gold transition-colors">
                All
              </Link>
              <Link href="/services" className="text-sm font-medium text-gray-700 hover:text-gold transition-colors">
                Services
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              {user.email}
              {isSeller && (
                <span className="ml-2 bg-gold/10 text-gold-dark px-2 py-0.5 rounded-full text-xs font-semibold">
                  ✓ Seller
                </span>
              )}
            </span>

            {isSeller ? (
              <Link
                href="/new"
                className="bg-charcoal text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-black transition-colors"
              >
                + Post
              </Link>
            ) : (
              <Link
                href="/become-seller"
                className="bg-gold text-charcoal px-5 py-2 rounded-full text-sm font-semibold hover:bg-gold-dark transition-colors"
              >
                Start Selling
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-500 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-charcoal">Discover</h1>
          <p className="text-gray-500 mt-1">Products and services from verified students</p>
        </div>

        {listings.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
            <p className="text-5xl mb-4">🛒</p>
            <h2 className="text-xl font-semibold text-charcoal">Nothing here yet</h2>
            <p className="text-gray-500 mt-2 mb-6">Be the first to list something amazing</p>
            {isSeller ? (
              <Link
                href="/new"
                className="inline-block bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors"
              >
                Post Your First Item
              </Link>
            ) : (
              <Link
                href="/become-seller"
                className="inline-block bg-gold text-charcoal px-6 py-3 rounded-full font-semibold hover:bg-gold-dark transition-colors"
              >
                Become a Seller
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((item) => (
              <div key={item.id} className="group cursor-pointer">
                {/* Image */}
                <div className="relative overflow-hidden rounded-2xl aspect-square bg-gray-100 mb-3">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-5xl opacity-30">
                        {item.listing_type === 'service' ? '💼' : '📦'}
                      </span>
                    </div>
                  )}

                  {item.listing_type === 'service' && (
                    <span className="absolute top-3 left-3 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-charcoal">
                      Service
                    </span>
                  )}
                </div>

                {/* Info */}
                <div>
                  <h3 className="font-semibold text-charcoal line-clamp-1">
                    {item.title}
                  </h3>
                  {item.seller?.full_name && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      by {item.seller.full_name}
                    </p>
                  )}
                  <p className="mt-2 font-semibold text-charcoal">
                    GH₵ {Number(item.price || 0).toLocaleString()}
                  </p>

                  {item.seller?.whatsapp_number && (
                    <a
                      href={`https://wa.me/${item.seller.whatsapp_number}?text=${encodeURIComponent(
                        `Hi! I'm interested in your "${item.title}" listing on Campus Plug 🔌`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full flex items-center justify-center gap-2 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-colors text-sm"
                    >
                      💬 Message
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}