'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatPrice, formatPriceRange, getPriceRange } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoryDisplay } from '@/lib/categories'
import StarRating from '@/app/StarRating'
import {
  getSellerRating,
  getSellerReviews,
  getMyReviewForSeller,
  deleteReview,
  type SellerRating,
  type ReviewWithResponse,
} from '@/lib/reviews'

interface ListingItem {
  id: string
  name: string
  price: number
  description: string | null
  duration: string | null
  display_order: number
}

interface ListingImage {
  id: string
  image_url: string
  display_order: number
}

interface ListingData {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  category: string | null
  campus_location: string | null
  service_duration: string | null
  service_location: string | null
  approval_status: string
  seller_id: string
  seller: {
    id: string
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_images: ListingImage[] | null
  listing_items: ListingItem[] | null
}

export default function ListingDetailPage() {
  const [listing, setListing] = useState<ListingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const [ratingInfo, setRatingInfo] = useState<SellerRating | null>(null)
  const [reviews, setReviews] = useState<ReviewWithResponse[]>([])
  // Buyer review entry: myReview = already reviewed; reviewAnchor = a
  // qualifying completed transaction I haven't reviewed yet.
  const [myReview, setMyReview] = useState<ReviewWithResponse | null>(null)
  const [reviewAnchor, setReviewAnchor] = useState<{ kind: 'booking' | 'sale'; id: string } | null>(null)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [isFavorited, setIsFavorited] = useState(false)
  const [toast, setToast] = useState<{ message: string } | null>(null)
  const router = useRouter()
  const params = useParams()
  const rawId = params.id
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId

  // Carousel sources: listing_images (ordered), falling back to image_url.
  const photos = (() => {
    if (listing && listing.listing_images && listing.listing_images.length > 0) {
      return listing.listing_images.map((i) => i.image_url)
    }
    return listing?.image_url ? [listing.image_url] : []
  })()

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // Check auth status and favourite state on mount
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user && listingId) {
        const { data } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('listing_id', listingId)
          .limit(1)
        
        setIsFavorited(!!(data && data.length > 0))
      }
    }
    
    checkAuth()
  }, [listingId])

  // Reviews for this seller (public) + the current user's review entry point.
  // Declared before the load effect that calls it. Failures here must never
  // block the listing itself — they only mean no reviews render.
  const loadReviews = async (sellerId: string) => {
    try {
      const rating = await getSellerRating(sellerId)
      if (rating) setRatingInfo(rating)
      const reviews = await getSellerReviews(sellerId, 5)
      setReviews(reviews)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const myReview = await getMyReviewForSeller(sellerId, user.id)
      if (myReview) {
        setMyReview(myReview)
        return
      }

      // Which completed transaction qualifies the buyer to review?
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('buyer_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
      if (booking && booking[0]) {
        setReviewAnchor({ kind: 'booking', id: booking[0].id })
        return
      }

      const { data: sale } = await supabase
        .from('sales')
        .select('id')
        .eq('seller_id', sellerId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
      if (sale && sale[0]) {
        setReviewAnchor({ kind: 'sale', id: sale[0].id })
      }
    } catch (err) {
      console.error('Failed to load reviews:', err)
    }
  }

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Delete your review? This cannot be undone.')) return
    const { error } = await deleteReview(reviewId)
    if (error) {
      alert('Could not delete the review: ' + error.message)
      return
    }
    setMyReview(null)
    setReviews((prev) => prev.filter((r) => r.id !== reviewId))
    setRatingInfo(await getSellerRating(listing?.seller_id || ''))
  }

  const reviewDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  useEffect(() => {
    async function loadListing() {
      try {
        if (!listingId) {
          router.push('/')
          return
        }

        const { data } = await supabase
          .from('listings')
          .select('*, seller:profiles!seller_id (id, full_name, whatsapp_number), listing_images (id, image_url, display_order), listing_items (id, name, price, description, duration, display_order)')
          .eq('id', listingId)
          .single()

        if (!data) {
          alert('Listing not found')
          router.push('/')
          return
        }

        const typed = data as unknown as ListingData

        // Only approved listings are public. Owners and admins may preview
        // their own pending/rejected listings.
        if (typed.approval_status !== 'approved') {
          const { data: { user } } = await supabase.auth.getUser()
          let allowed = false
          if (user) {
            if (typed.seller_id === user.id) {
              allowed = true
            } else {
              const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single()
              allowed = !!profile?.is_admin
            }
          }
          if (!allowed) {
            router.push('/')
            return
          }
        }

        // Sort embedded rows deterministically (display_order, then oldest).
        if (typed.listing_images) {
          typed.listing_images.sort((a, b) =>
            a.display_order - b.display_order || a.id.localeCompare(b.id)
          )
        }
        if (typed.listing_items) {
          typed.listing_items.sort((a, b) =>
            a.display_order - b.display_order || a.id.localeCompare(b.id)
          )
        }

        setActive(0)
        setListing(typed)
        // Reviews + the buyer's review entry point load separately — a
        // failure here must never block the listing itself.
        loadReviews(typed.seller_id)
      } catch (err) {
        // A failed lookup must not strand the visitor on the spinner forever.
        console.error('Failed to load listing:', err)
        alert('Could not load the listing. Please try again.')
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    loadListing()
  }, [listingId, router])

  const photoCount = photos.length

  // Arrow-key navigation for the carousel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (photoCount <= 1) return
      if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setActive((i) => Math.min(photoCount - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoCount])

  if (loading || !listing) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading listing...</p>
        </div>
      </div>
    )
  }

  const isService = listing.listing_type === 'service'
  const categoryDisplay = getCategoryDisplay(listing.category)
  const backHref = isService ? '/services' : '/'
  const priceLabel = formatPriceRange(listing.listing_items) || formatPrice(listing.price)
  const itemCount = listing.listing_items?.length || 0
  const priceRange = getPriceRange(listing.listing_items)
  const sellerName = listing.seller?.full_name ? formatName(listing.seller.full_name) : 'Unknown seller'
  const sellerInitial = sellerName.charAt(0).toUpperCase()

  const contactMessage = encodeURIComponent(
    'Hi! I have a question about your "' + listing.title + '" listing on Campus Plug 🔌'
  )

  const itemMessage = (item: ListingItem) => {
    const base =
      'Hi! I\u2019m interested in "' + item.name + '" (GH\u20B5 ' +
      Number(item.price).toLocaleString() + ') from your "' + listing.title +
      '" listing on Campus Plug \uD83D\uDD0C'
    if (isService) {
      return encodeURIComponent(
        base + '\n\n' +
        '\uD83D\uDCB0 Price: GH\u20B5 ' + Number(item.price).toLocaleString() + '\n' +
        (item.duration ? '\u23F1 Duration: ' + item.duration + '\n' : '') +
        'Can we arrange a time?'
      )
    }
    return encodeURIComponent(base)
  }

  const goTo = (delta: number) => {
    setActive((i) => {
      const next = i + delta
      if (next < 0) return photos.length - 1
      if (next >= photos.length) return 0
      return next
    })
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
            href={backHref}
            className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Back to {isService ? 'services' : 'marketplace'}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 pb-10 md:pt-36 md:pb-14 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={"inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full " + (isService ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
              {isService ? '💼 Service' : '📦 Product'}
            </span>
            {listing.category && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gold text-charcoal">
                {categoryDisplay.emoji} {categoryDisplay.label}
              </span>
            )}
            {listing.approval_status !== 'approved' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gold/20 text-gold border border-gold/30">
                ⏳ {listing.approval_status === 'pending' ? 'Pending review' : 'Not approved'}
              </span>
            )}
            {itemCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-white/10 text-white/80 border border-white/20">
                📦 {itemCount} {isService ? 'services' : 'items'}
              </span>
            )}
          </div>

          <h1 className="fade-up fade-up-delay-1 text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight mb-3">
            {listing.title}
          </h1>
          <div className="fade-up fade-up-delay-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <span className="text-3xl md:text-4xl font-bold gradient-text">{priceLabel}</span>
            {itemCount > 0 && priceRange && (
              <span className="text-sm text-white/60 mb-1.5">
                starting from {formatPrice(priceRange.min)}
              </span>
            )}
          </div>
          {listing.campus_location && (
            <div className="fade-up fade-up-delay-3 flex items-center gap-2 text-sm text-white/80 font-medium mt-3">
              <span className="text-gold">📍</span>
              <span>Based at {listing.campus_location}</span>
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="relative pb-24 md:pb-32 bg-off-white -mt-6">
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-8">

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">

            {/* LEFT — Photo carousel + seller */}
            <div>
              <div className="lg:sticky lg:top-24 space-y-6">

                {/* Carousel */}
                <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100">
                  <div
                    className="relative aspect-square overflow-hidden bg-gray-100 select-none"
                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
                    onTouchEnd={(e) => {
                      if (touchStartX.current === null || photos.length <= 1) return
                      const delta = e.changedTouches[0].clientX - touchStartX.current
                      if (Math.abs(delta) > 40) goTo(delta < 0 ? 1 : -1)
                      touchStartX.current = null
                    }}
                  >
                    {photos.length > 0 ? (
                      <Image
                        key={active}
                        src={photos[active]}
                        alt={listing.title + ' photo ' + (active + 1)}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover fade-up"
                        priority
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                        <span className="text-8xl opacity-40">{isService ? '💼' : '📦'}</span>
                      </div>
                    )}

                    {photos.length > 1 && (
                      <>
                        <button
                          onClick={() => goTo(-1)}
                          aria-label="Previous photo"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur text-charcoal flex items-center justify-center shadow-lg hover:bg-gold hover:text-charcoal transition-colors text-lg"
                        >
                          ←
                        </button>
                        <button
                          onClick={() => goTo(1)}
                          aria-label="Next photo"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur text-charcoal flex items-center justify-center shadow-lg hover:bg-gold hover:text-charcoal transition-colors text-lg"
                        >
                          →
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {photos.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setActive(idx)}
                              aria-label={'Go to photo ' + (idx + 1)}
                              className={"w-2 h-2 rounded-full transition-all " + (idx === active ? 'bg-gold w-5' : 'bg-white/70 hover:bg-white')}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Thumbnails */}
                  {photos.length > 1 && (
                    <div className="flex gap-2 p-3 overflow-x-auto">
                      {photos.map((src, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActive(idx)}
                          className={"relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all " + (idx === active ? 'border-gold shadow-lg' : 'border-transparent opacity-70 hover:opacity-100')}
                        >
                          <Image src={src} alt={'Thumbnail ' + (idx + 1)} fill sizes="64px" className="object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seller card */}
                <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
                  <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Seller</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-lg font-bold text-gold-dark shrink-0">
                      {sellerInitial}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-charcoal truncate">{sellerName}</p>
                      {listing.service_location && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          📍 {listing.service_location}
                        </p>
                      )}
                    </div>
                  </div>

                  {listing.seller?.whatsapp_number ? (
                    <a
                      href={"https://wa.me/" + listing.seller.whatsapp_number + "?text=" + contactMessage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 flex items-center justify-center gap-2 w-full bg-green-500 text-white py-3.5 rounded-full font-semibold hover:bg-green-600 transition-colors text-sm"
                    >
                      💬 Contact Seller on WhatsApp
                    </a>
                  ) : (
                    <p className="mt-5 text-xs text-gray-500 text-center">
                      This seller hasn&apos;t added their WhatsApp number yet.
                    </p>
                  )}
                  
                  {/* Save/Favourite button */}
                  <button
                    onClick={() => {
                      if (!user) {
                        setToast({ message: 'Sign in to save favourites' })
                        return
                      }
                      
                      // Optimistic UI update
                      const newState = !isFavorited
                      setIsFavorited(newState)
                      
                      // Call DB in background
                      async function toggleFavorite() {
                        if (!user) return
                        try {
                          if (newState) {
                            const { error } = await supabase
                              .from('favorites')
                              .insert({ user_id: user.id, listing_id: listingId })
                            if (error) throw error
                          } else {
                            const { error } = await supabase
                              .from('favorites')
                              .delete()
                              .eq('user_id', user.id)
                              .eq('listing_id', listingId)
                            if (error) throw error
                          }
                        } catch (err) {
                          // Revert on error
                          console.error('Failed to toggle favorite:', err)
                          setIsFavorited(isFavorited)
                          setToast({ message: 'Failed to save favourite. Please try again.' })
                        }
                      }
                      
                      toggleFavorite()
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-white border-2 border-gold/30 text-charcoal py-3.5 rounded-full font-semibold hover:bg-gold/10 hover:border-gold transition-all text-sm"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill={isFavorited ? '#d4af37' : 'none'}
                      stroke="#d4af37"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {isFavorited ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT — Description + bundle items */}
            <div className="space-y-6">

              {/* Description */}
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-xl border border-gray-100">
                <p className="text-xs font-bold text-charcoal uppercase tracking-widest mb-3">Description</p>
                {listing.description ? (
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">{listing.description}</p>
                ) : (
                  <p className="text-gray-400 text-sm">No description provided.</p>
                )}

                {listing.service_duration && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">⏱</span>
                    <span>{listing.service_duration}</span>
                  </div>
                )}
              </div>

              {/* Bundle items */}
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-xl border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-charcoal uppercase tracking-widest">
                    {isService ? 'Services & Pricing' : 'Items & Pricing'}
                  </p>
                  {itemCount > 0 && (
                    <span className="text-xs text-gray-500">{itemCount} {itemCount === 1 ? 'option' : 'options'}</span>
                  )}
                </div>

                {itemCount === 0 ? (
                  <p className="text-sm text-gray-500 mt-3">
                    {isService
                      ? 'This service is offered at ' + priceLabel + ' per session.'
                      : 'This item is priced at ' + priceLabel + '.'}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {listing.listing_items!.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-charcoal">{item.name}</p>
                            {item.duration && (
                              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">⏱ {item.duration}</p>
                            )}
                            {item.description && (
                              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{item.description}</p>
                            )}
                          </div>
                          <span className="font-bold text-gold-dark whitespace-nowrap">{formatPrice(item.price)}</span>
                        </div>

                        {listing.seller?.whatsapp_number && (
                          <a
                            href={"https://wa.me/" + listing.seller.whatsapp_number + "?text=" + itemMessage(item)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 bg-charcoal text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-black transition-all hover:scale-[1.02]"
                          >
                            {isService ? '📅 Book This' : '💬 Message Seller'}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Trust note */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-green-50 to-transparent border border-green-100">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-lg shrink-0 shadow-lg shadow-green-500/30">
                    💬
                  </div>
                  <div>
                    <p className="font-bold text-charcoal text-sm mb-1">Booking works over WhatsApp</p>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Tap a button to message the seller directly with the item pre-filled — arrange a time and pay them on WhatsApp.
                    </p>
                  </div>
                </div>
              </div>

              {/* Reviews */}
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-xl border border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Reviews</p>
                  {ratingInfo && ratingInfo.review_count > 0 && (
                    <span className="inline-flex items-center gap-2">
                      <StarRating rating={Number(ratingInfo.average_rating) || 0} size="sm" />
                      <span className="text-sm font-bold text-charcoal">
                        {Number(ratingInfo.average_rating).toFixed(1)} ({ratingInfo.review_count})
                      </span>
                    </span>
                  )}
                </div>
                {ratingInfo?.is_top_rated && (
                  <span className="inline-flex items-center gap-1.5 mt-2 bg-gold text-charcoal px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                    ⭐ Top Rated
                  </span>
                )}

                {/* Buyer review entry point */}
                {myReview ? (
                  <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Your review</p>
                      <span className="text-[10px] text-gray-400">{reviewDate(myReview.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating rating={myReview.rating} size="sm" />
                      <span className="text-[10px] text-green-600 font-semibold">✅ Verified buyer</span>
                    </div>
                    {myReview.review_text && (
                      <p className="text-sm text-gray-700 mt-2 leading-relaxed">{myReview.review_text}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Link
                        href={'/reviews/new?reviewId=' + myReview.id}
                        className="inline-flex items-center gap-1.5 bg-charcoal text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-black transition-colors"
                      >
                        ✏️ Edit Review
                      </Link>
                      <button
                        onClick={() => handleDeleteReview(myReview.id)}
                        className="inline-flex items-center gap-1.5 bg-white text-red-600 px-4 py-2 rounded-full font-semibold text-xs border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                ) : reviewAnchor ? (
                  <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-4">
                    <p className="font-bold text-charcoal text-sm mb-1">You bought from this seller</p>
                    <p className="text-xs text-gray-600 mb-3">
                      Share your experience — it helps other buyers on campus trust real sellers. ✅ Your review is verified against your completed transaction.
                    </p>
                    <Link
                      href={'/reviews/new?' + (reviewAnchor.kind === 'booking' ? 'bookingId=' : 'saleId=') + reviewAnchor.id + '&sellerId=' + listing.seller_id}
                      className="inline-flex items-center gap-1.5 bg-gold text-charcoal px-5 py-2.5 rounded-full font-bold text-sm hover:bg-gold-dark transition-all hover:scale-[1.02] shadow-md"
                    >
                      ⭐ Leave a Review
                    </Link>
                  </div>
                ) : null}

                {/* Review list */}
                {reviews.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-4">
                    No reviews yet. Be the first to review this seller after a completed booking! ⭐
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {reviews.map((r) => {
                      const reviewerName = r.reviewer?.full_name
                        ? formatName(r.reviewer.full_name)
                        : 'Verified Buyer'
                      return (
                        <div key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-charcoal">{reviewerName}</p>
                            <span className="inline-flex items-center gap-2">
                              <StarRating rating={r.rating} size="sm" />
                              <span className="text-[10px] text-gray-400">{reviewDate(r.created_at)}</span>
                            </span>
                          </div>
                          <p className="text-[10px] text-green-600 font-semibold mt-1">✅ Verified buyer</p>
                          {r.review_text && (
                            <p className="text-sm text-gray-700 mt-2 leading-relaxed">{r.review_text}</p>
                          )}
                          {r.response && (
                            <div className="mt-3 pl-3 border-l-2 border-gold/40">
                              <p className="text-[10px] font-bold text-gold-dark uppercase tracking-widest">Seller response</p>
                              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{r.response.response_text}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-charcoal text-white px-6 py-4 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-fade-in">
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </main>
  )
}
