'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ListingCard, { type ListingCardData } from '@/app/ListingCard'

interface FavoritedListing extends ListingCardData {
  is_favorited: boolean
}

export default function FavoritesPage() {
  const [listings, setListings] = useState<FavoritedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    async function loadFavorites() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          // Redirect to login if not authenticated
          router.push('/login?next=/favorites')
          return
        }
        
        setUser(user)
        
        // Fetch favourite listings
        const { data: favorites, error: favError } = await supabase
          .from('favorites')
          .select('listing_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        
        if (favError) {
          console.error('Failed to load favorites:', favError)
          setLoading(false)
          return
        }
        
        if (!favorites || favorites.length === 0) {
          setLoading(false)
          return
        }
        
        // Fetch the actual listings
        const listingIds = favorites.map(f => f.listing_id)
        const { data: listingsData, error: listError } = await supabase
          .from('listings')
          .select('*, seller:profiles!seller_id (full_name, whatsapp_number), listing_items (price), listing_images (id)')
          .in('id', listingIds)
          .eq('approval_status', 'approved')
        
        if (listError) {
          console.error('Failed to load listings:', listError)
          setLoading(false)
          return
        }
        
        // Mark all as favourited (they are, by definition)
        const favoritedListings = (listingsData || []).map(listing => ({
          ...listing,
          is_favorited: true
        })) as FavoritedListing[]
        
        setListings(favoritedListings)
      } catch (err) {
        console.error('Failed to load favorites:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadFavorites()
  }, [router])

  const handleUnfavorite = (listingId: string) => {
    // Optimistic removal
    setListings(prev => prev.filter(l => l.id !== listingId))
    
    // DB call in background
    async function removeFavorite() {
      try {
        if (!user) return
        
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId)
        
        if (error) throw error
      } catch (err) {
        console.error('Failed to remove favorite:', err)
        // Revert on error - refetch
        window.location.reload()
      }
    }
    
    removeFavorite()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading favourites...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <Link
            href="/services"
            className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to services
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 pb-10 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gold text-charcoal">
              ❤️ Favourites
            </span>
          </div>

          <h1 className="fade-up fade-up-delay-1 text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-3">
            Your favourites
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70">
            Listings you&apos;ve saved for later
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8">
          {listings.length === 0 ? (
            /* Empty state */
            <div className="relative overflow-hidden bg-white rounded-3xl p-12 md:p-20 text-center border border-gray-100 shadow-xl max-w-2xl mx-auto">
              <div className="relative">
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#d4af37"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-6 opacity-50"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-3">No favourites yet</h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Tap the ♥ on any listing to save it here for later.
                </p>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 bg-charcoal text-white px-8 py-4 rounded-full font-semibold hover:bg-black transition-all hover:scale-105 shadow-xl group"
                >
                  Browse services
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </Link>
              </div>
            </div>
          ) : (
            /* Listings grid */
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing, idx) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  index={idx}
                  isFavorited={true}
                  onFavoriteToggle={(id, isFav) => {
                    if (!isFav) {
                      handleUnfavorite(id)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}