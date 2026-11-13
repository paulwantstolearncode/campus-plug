'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPriceRange, formatListingPrice } from '@/lib/format'
import { getCategoryDisplay } from '@/lib/categories'
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
  /** Deprecated — stagger is now fixed at 45ms × (index % 10). Kept for
      backward compatibility with existing callers. */
  staggerSeconds?: number
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
  const href = preview ? '/login' : '/listing/' + listing.id
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

  return (
    <div className="group relative fade-up" style={delay ? { animationDelay: delay } : undefined}>
      <div className={`card-lift-strong relative bg-surface rounded-2xl overflow-hidden hairline ${isBoosted ? 'hairline-glow' : ''}`}>
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
