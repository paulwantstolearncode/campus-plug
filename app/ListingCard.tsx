'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPriceRange, formatListingPrice } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoryDisplay } from '@/lib/categories'
import { SITE_URL } from '@/lib/site'
import StarRating from '@/app/StarRating'
import type { SellerRating } from '@/lib/reviews'
import { supabase } from '@/lib/supabase'
import { getOrCreateConversation } from '@/lib/chat'

export interface ListingCardData {
  id: string
  title: string
  description: string | null
  price: number
  max_price: number | null
  image_url: string | null
  listing_type: string
  category: string | null
  campus_location: string | null
  service_duration?: string | null
  service_location?: string | null
  approval_status: string
  deleted_at: string | null
  sold_at: string | null
  last_activity_at: string | null
  created_at?: string
  boosted_until?: string | null
  seller_id: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_items: { price: number }[] | null
  listing_images: { id: string }[] | null
}

interface ListingCardProps {
  listing: ListingCardData
  index?: number
  /** 'feed' (default) = light card with message/favourite actions, used by the
      home feed, landing preview, shop and favourites pages. 'board' = dark
      overlay card with seller proof + Book/WhatsApp actions, used by /services. */
  variant?: 'feed' | 'board'
  /** Forwarded to data-tour on the wrapper (onboarding tour anchor). */
  tour?: string
  sellerRatings?: Record<string, SellerRating>
  isOwner?: boolean
  onDelete?: (id: string, title: string) => void
  preview?: boolean
  isFavorited?: boolean
  onFavoriteToggle?: (listingId: string, isFavorited: boolean) => void
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? '#c9a227' : 'none'}
      stroke="#c9a227"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

export default function ListingCard({
  listing,
  index,
  variant = 'feed',
  tour,
  sellerRatings,
  isOwner,
  onDelete,
  preview = false,
  isFavorited: isFavoritedProp,
  onFavoriteToggle,
}: ListingCardProps) {
  const cat = getCategoryDisplay(listing.category)
  const priceLabel =
    formatPriceRange(listing.listing_items) ||
    formatListingPrice(listing.price, listing.max_price)
  const rating = sellerRatings?.[listing.seller_id]
  // Listing detail pages are public for approved listings, so preview cards on
  // the logged-out landing link straight through instead of bouncing to /login.
  const href = '/listing/' + listing.id
  // Stagger capped every 10 cards so deep feeds don't fade in late.
  const delay = index !== undefined ? ((index % 10) * 45) + 'ms' : undefined

  const [localFavorited, setLocalFavorited] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null)
  const [isBoosted, setIsBoosted] = useState(false)
  const [isFresh, setIsFresh] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => {
      setIsBoosted(Boolean(listing.boosted_until && new Date(listing.boosted_until) > new Date()))
    }, 0)
    return () => clearTimeout(t)
  }, [listing.boosted_until])

  useEffect(() => {
    const t = setTimeout(() => {
      setIsFresh(Boolean(listing.created_at && new Date(listing.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)))
    }, 0)
    return () => clearTimeout(t)
  }, [listing.created_at])

  // Verified seller — top rated or avg >= 4.0 with at least one review.
  const isVerified = Boolean(
    rating?.is_top_rated ||
      (rating?.review_count && rating?.review_count > 0 &&
        Number(rating.average_rating) >= 4.0)
  )

  const isFavorited = isFavoritedProp !== undefined ? isFavoritedProp : localFavorited

  useEffect(() => {
    if (preview) return

    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (isFavoritedProp === undefined && user) {
        const { data } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('listing_id', listing.id)
          .limit(1)

        setLocalFavorited(!!(data && data.length > 0))
      }
    }

    checkAuth()
  }, [preview, listing.id, isFavoritedProp])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      setToast({
        message: 'Sign in to save favourites',
        action: {
          label: 'Sign in',
          onClick: () => router.push('/login?next=' + encodeURIComponent(window.location.pathname))
        }
      })
      return
    }

    const newState = !isFavorited
    if (onFavoriteToggle) {
      onFavoriteToggle(listing.id, newState)
    } else {
      setLocalFavorited(newState)
    }

    async function toggleFavorite() {
      if (!user) return
      try {
        if (newState) {
          const { error } = await supabase
            .from('favorites')
            .insert({ user_id: user.id, listing_id: listing.id })
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('listing_id', listing.id)
          if (error) throw error
        }
      } catch (err) {
        console.error('Failed to toggle favorite:', err)
        if (onFavoriteToggle) {
          onFavoriteToggle(listing.id, isFavorited)
        } else {
          setLocalFavorited(isFavorited)
        }
        setToast({ message: 'Failed to save favourite. Please try again.' })
      }
    }

    toggleFavorite()
  }

  const handleMessageClick = async () => {
    if (!user) {
      setToast({ message: 'Sign in to message sellers' })
      return
    }
    if (listing.seller_id === user.id) {
      setToast({ message: 'You cannot message yourself' })
      return
    }
    const { id, error } = await getOrCreateConversation({
      buyerId: user.id,
      sellerId: listing.seller_id,
      listingId: listing.id,
    })
    if (error) {
      setToast({ message: error })
      return
    }
    if (id) {
      router.push('/messages/' + id)
    }
  }

  // ── Board variant: dark overlay card for the /services board. Carries the
  //    seller proof (name, rating, duration, location) and Book/WhatsApp
  //    actions that the feed card doesn't need.
  if (variant === 'board') {
    const boardRating = sellerRatings?.[listing.seller_id]
    const waHref = listing.seller?.whatsapp_number
      ? 'https://wa.me/' + listing.seller.whatsapp_number + '?text=' + encodeURIComponent(
          'Hi ' + (listing.seller?.full_name ? formatName(listing.seller.full_name) : 'there') +
          '! I saw your listing for "' + listing.title + '" (' + formatListingPrice(listing.price, listing.max_price) +
          ') on Campus Plug: ' + SITE_URL + '/listing/' + listing.id + '. Is this still available?'
        )
      : null

    return (
      <div className="group relative fade-up" style={delay ? { animationDelay: delay } : undefined} data-tour={tour}>
        <div className="relative bg-white rounded-card overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hairline">
          <Link href={'/listing/' + listing.id} className="relative block aspect-[4/5] overflow-hidden bg-gray-100">
            {listing.image_url ? (
              <Image
                src={listing.image_url}
                alt={listing.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                className="object-cover group-hover:scale-110 transition-transform duration-700"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
                <span className="text-7xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/60 to-transparent"></div>
            <div className="absolute top-4 left-4 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 bg-gold rounded-full"></span>
              {listing.listing_type === 'service' ? 'Service' : 'Product'}
            </div>
            <div className="absolute top-4 right-4 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
              {priceLabel}
            </div>
            {boardRating?.is_top_rated && (
              <div className="absolute top-16 left-4 bg-gold text-charcoal px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Top Rated
              </div>
            )}
            {listing.listing_images && listing.listing_images.length > 1 && (
              <div className="absolute top-16 right-4 glass px-2.5 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> {listing.listing_images.length}
              </div>
            )}
            <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end text-white">
              <h3 className="text-xl md:text-2xl font-bold mb-2 line-clamp-2 group-hover:translate-x-1 hover:text-gold transition-all">{listing.title}</h3>
              {listing.category && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full mb-2 w-fit bg-gold/20 text-gold">
                  {cat.emoji} {cat.label}
                </span>
              )}
              {listing.seller?.full_name && (
                <p className="text-sm text-white/90 mb-2 flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-xs">{formatName(listing.seller.full_name).charAt(0)}</span>
                  {formatName(listing.seller.full_name)}
                  {boardRating?.review_count ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold" title={'Average ' + Number(boardRating.average_rating).toFixed(1) + ' across ' + boardRating.review_count + ' reviews'}>
                      <StarRating rating={Number(boardRating.average_rating) || 0} size="sm" />
                      {Number(boardRating.average_rating).toFixed(1)} ({boardRating.review_count})
                    </span>
                  ) : null}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/80">
                {listing.service_duration && (<span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> {listing.service_duration}</span>)}
                {listing.service_location && (<span className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {listing.service_location}</span>)}
              </div>
            </div>
          </Link>
          <div className="p-4 flex gap-2">
            {listing.listing_type === 'service' ? (
              <Link href={'/services/' + listing.id + '/book'} className="flex-1 flex items-center justify-center gap-2 bg-charcoal text-white py-3 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm group/btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Book Now <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
              </Link>
            ) : (
              <Link href={'/listing/' + listing.id} className="flex-1 flex items-center justify-center gap-2 bg-charcoal text-white py-3 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm group/btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> View details <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
              </Link>
            )}
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="w-12 h-12 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110" title="Message on WhatsApp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative fade-up" style={delay ? { animationDelay: delay } : undefined} data-tour={tour}>
      <div className={`card-lift-strong relative bg-surface rounded-card overflow-hidden hairline ${isBoosted ? 'hairline-glow' : ''}`}>
        <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-paper-deep">
          {listing.image_url ? (
            <Image
              src={listing.image_url}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMjAwIj48cmVjdCBmaWxsPSIjZWZlY2U0IiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZTRlMWQ4IiBmb250LXNpemU9IjQ4Ij7wn5OEPC90ZXh0Pjwvc3ZnPg=="
              className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
              priority={index !== undefined && index < 6}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-paper-deep">
              <span className="text-6xl opacity-25">{cat.emoji}</span>
            </div>
          )}

          {/* Soft gradient scrim for badge legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5 pointer-events-none" />

          {/* Type badge — top-left */}
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-ink shadow-sm">
            {listing.listing_type === 'service' ? 'Service' : 'Product'}
          </div>

          {isFresh && (
            <div className="absolute top-3 left-12 w-2 h-2 rounded-full bg-gold fresh-pulse-dot shadow-sm" />
          )}

          {/* Price pill — top-right, gold signal */}
          <div className="absolute top-3 right-3 bg-gold-signal text-ink font-mono font-bold px-3 py-1 rounded-lg text-sm shadow-md shadow-gold-glow hover:bg-gold-vivid hover:shadow-glow transition-colors transition-shadow duration-300">
            {priceLabel}
          </div>

          {/* Sold badge — small, top-right below price */}
          {listing.sold_at && (
            <div className="absolute top-12 right-3 bg-red-500 text-white px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-md z-10">
              SOLD
            </div>
          )}

          {isVerified && (
            <div className="absolute bottom-3 left-3 bg-gold-signal text-ink px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Verified
            </div>
          )}

          {toast && (
              <div className="absolute top-14 right-3 max-w-[calc(100%-1.5rem)] bg-ink text-white px-4 py-3 rounded-xl shadow-xl z-20 flex items-center gap-3 animate-fade-in">
              <span className="text-sm">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick()
                    setToast(null)
                  }}
                  className="text-gold-vivid font-semibold text-sm hover:text-gold-light transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </Link>

        <div className="p-4">
          <Link href={href} className="block mb-1.5">
            <h3 className="font-semibold text-ink text-base md:text-lg line-clamp-2 min-h-[2.75rem] hover:text-gold-dark transition-colors leading-snug">
              {listing.title}
            </h3>
          </Link>

          <p className="text-xs text-ink-muted mb-1.5">{cat.label}</p>

          {listing.campus_location && (
            <div className="font-mono text-xs text-ink-muted mb-1.5">
              📍 {listing.campus_location}
            </div>
          )}

          {!preview && (
            <Link
              href={'/shop/' + listing.seller_id}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-gold-dark hover:underline font-semibold mb-2"
            >
              🏪 View seller&apos;s shop
            </Link>
          )}

          <div className="font-mono text-xs text-ink-muted mb-3">
            {rating?.review_count ? (
              <span>⭐ {Number(rating.average_rating).toFixed(1)} ({rating.review_count} reviews)</span>
            ) : (
              <span>Verified student seller</span>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {preview ? (
              <>
              </>
            ) : isOwner ? (
              <>
                <Link
                  href={'/new?edit=' + listing.id}
                  className="flex-1 flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-ink-soft transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={() => onDelete?.(listing.id, listing.title)}
                  className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shrink-0"
                  title="Delete listing"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </>
            ) : (
              <>
                {!listing.sold_at && user && (
                  <button
                    onClick={handleMessageClick}
                    className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-rule text-charcoal py-2.5 rounded-xl font-semibold text-sm hover:border-gold hover:bg-gold/5 transition-colors min-h-[44px]"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-4 0.5c-2.1 0-3.8-2.1-3.8-4.3 0-1.1 0.2-2.1 0.5-3H5c-1.1 0-2 0.9-2 2v5c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2v-5c0-1.1-0.9-2-2-2z" />
                      <polyline points="16 17 18 17 15.5 15.5" />
                    </svg>
                    Message
                  </button>
                )}
              </>
            )}

            {!preview && !isOwner && (
              <button
                onClick={handleFavoriteClick}
                className="w-10 h-10 flex items-center justify-center border border-rule rounded-xl hover:border-gold hover:bg-gold-soft/40 transition-colors shrink-0"
                title={isFavorited ? 'Unsave' : 'Save'}
              >
                <HeartIcon filled={isFavorited} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
