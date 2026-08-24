'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatPriceRange } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoryDisplay } from '@/lib/categories'
import type { SellerRating } from '@/lib/reviews'
import { supabase } from '@/lib/supabase'

export interface ListingCardData {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  category: string | null
  campus_location: string | null
  approval_status: string
  deleted_at: string | null
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
  staggerSeconds?: number
  sellerRatings?: Record<string, SellerRating>
  isOwner?: boolean
  onDelete?: (id: string, title: string) => void
  preview?: boolean
  isFavorited?: boolean
  onFavoriteToggle?: (listingId: string, isFavorited: boolean) => void
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? '#d4af37' : 'none'}
      stroke="#d4af37"
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
  staggerSeconds = 0.05,
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
    'GH\u20B5 ' + Number(listing.price || 0).toLocaleString()
  const rating = sellerRatings?.[listing.seller_id]
  const href = preview ? '/login' : '/listing/' + listing.id
  const delay = index !== undefined ? (index * staggerSeconds) + 's' : undefined

  const [localFavorited, setLocalFavorited] = useState(false)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null)
  const router = useRouter()

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

  const whatsappUrl = listing.seller?.whatsapp_number
    ? 'https://wa.me/' + listing.seller.whatsapp_number + '?text=' + encodeURIComponent(
        'Hi! I\'m interested in your "' + listing.title + '" listing on Campus Plug 🔌'
      )
    : null

  return (
    <div className="group relative fade-up" style={delay ? { animationDelay: delay } : undefined}>
      <div className="relative bg-surface rounded-xl overflow-hidden shadow-sm border border-rule hover:shadow-md transition-shadow duration-300">
        <Link href={href} className="relative block aspect-[4/3] md:aspect-[4/3] sm:aspect-square overflow-hidden bg-paper">
          {listing.image_url ? (
            <Image
              src={listing.image_url}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              priority={index !== undefined && index < 6}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-paper">
              <span className="text-6xl opacity-30">{cat.emoji}</span>
            </div>
          )}

          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide text-ink">
            {listing.listing_type === 'service' ? 'SERVICE' : 'PRODUCT'}
          </div>

          <div className="absolute top-3 right-3 bg-gold-soft text-ink font-mono font-bold px-3 py-1 rounded-md text-sm shadow-sm">
            {priceLabel}
          </div>

          {toast && (
            <div className="absolute top-14 right-3 bg-ink text-white px-4 py-3 rounded-xl shadow-xl z-20 flex items-center gap-3 animate-fade-in">
              <span className="text-sm">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick()
                    setToast(null)
                  }}
                  className="text-gold font-semibold text-sm hover:text-gold-dark transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </Link>

        <div className="p-4">
          <Link href={href} className="block mb-2">
            <h3 className="font-bold text-ink text-base md:text-lg line-clamp-2 min-h-[2.75rem] hover:text-gold-dark transition-colors leading-snug">
              {listing.title}
            </h3>
          </Link>

          <p className="text-xs text-ink-muted mb-2">{cat.label}</p>

          {listing.campus_location && (
            <div className="font-mono text-xs text-ink-muted mb-2">
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

          <div className="font-mono text-xs text-ink-muted mb-4">
            {rating?.review_count ? (
              <span>⭐ {Number(rating.average_rating).toFixed(1)} ({rating.review_count} reviews)</span>
            ) : (
              <span>Verified student seller</span>
            )}
          </div>

          {rating?.is_top_rated && (
            <div className="inline-flex items-center gap-1.5 bg-gold/10 border border-gold/30 text-gold-dark px-2.5 py-1 rounded-full text-[11px] font-bold mb-4">
              ⭐ Top Rated
            </div>
          )}

          <div className="flex gap-2 items-center">
            {preview ? (
              <Link
                href="/login"
                className="flex-1 flex items-center justify-center gap-2 bg-whatsapp text-white py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <WhatsAppIcon className="shrink-0" />
                Message on WhatsApp
              </Link>
            ) : isOwner ? (
              <>
                <Link
                  href={'/new?edit=' + listing.id}
                  className="flex-1 flex items-center justify-center gap-2 bg-ink text-white py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Edit
                </Link>
                <button
                  onClick={() => onDelete?.(listing.id, listing.title)}
                  className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shrink-0"
                  title="Delete listing"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </>
            ) : (
              <>
                {whatsappUrl && (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-whatsapp text-white py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
                  >
                    <WhatsAppIcon className="shrink-0" />
                    Message on WhatsApp
                  </a>
                )}
              </>
            )}

            {!preview && !isOwner && (
              <button
                onClick={handleFavoriteClick}
                className="w-10 h-10 flex items-center justify-center border border-rule rounded-lg hover:border-gold transition-colors shrink-0"
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
