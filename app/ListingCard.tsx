'use client'
import Link from 'next/link'
import { formatPriceRange } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoryDisplay } from '@/lib/categories'
import StarRating from '@/app/StarRating'
import type { SellerRating } from '@/lib/reviews'

// Shape of a listing as consumed by the card. Every fetch that feeds a card
// (homepage marketplace, landing "Live on Campus" preview) must select at
// least these fields.
export interface ListingCardData {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  category: string | null
  approval_status: string
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
  /** index in the grid — drives the fade-up stagger */
  index?: number
  /** seconds between stagger steps (homepage 0.05, landing preview 0.1) */
  staggerSeconds?: number
  /** Authenticated homepage mode: star ratings + Top Rated badges */
  sellerRatings?: Record<string, SellerRating>
  /** Authenticated homepage mode: owner actions (Edit / Delete) */
  isOwner?: boolean
  onDelete?: (id: string, title: string) => void
  /** Logged-out landing mode: every tap funnels to /login */
  preview?: boolean
}

export default function ListingCard({
  listing,
  index,
  staggerSeconds = 0.05,
  sellerRatings,
  isOwner,
  onDelete,
  preview = false,
}: ListingCardProps) {
  const cat = getCategoryDisplay(listing.category)
  const priceLabel =
    formatPriceRange(listing.listing_items) ||
    'GH₵ ' + Number(listing.price || 0).toLocaleString()
  const rating = sellerRatings?.[listing.seller_id]
  // Preview cards deep-link to signup; real cards deep-link to the listing.
  const href = preview ? '/login' : '/listing/' + listing.id
  const delay = index !== undefined ? (index * staggerSeconds) + 's' : undefined

  return (
    <div className="group relative fade-up" style={delay ? { animationDelay: delay } : undefined}>
      <div className="relative bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-gray-100">
        <Link href={href} className="relative block aspect-square overflow-hidden bg-gray-100">
          {listing.image_url ? (
            <img src={listing.image_url} alt={listing.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-charcoal via-gray-800 to-charcoal">
              <span className="text-7xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
            </div>
          )}
          <div className="absolute top-3 left-3 glass px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 bg-gold rounded-full"></span>
            {listing.listing_type === 'service' ? 'Service' : 'Product'}
          </div>
          <div className="absolute top-3 right-3 bg-gold text-charcoal px-3 py-1.5 rounded-full text-sm font-bold shadow-lg">
            {priceLabel}
          </div>
          {rating?.is_top_rated && (
            <div className="absolute top-14 left-3 bg-gold text-charcoal px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1">
              ⭐ Top Rated
            </div>
          )}
          {listing.listing_images && listing.listing_images.length > 1 && (
            <div className="absolute bottom-3 left-3 glass px-2.5 py-1 rounded-full text-xs font-bold text-white flex items-center gap-1.5">
              🖼 {listing.listing_images.length}
            </div>
          )}
          {isOwner && (
            <div className="absolute bottom-3 right-3 bg-blue-500/90 backdrop-blur text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-lg">
              Your listing
            </div>
          )}
        </Link>
        <div className="p-5">
          <Link href={href} className="block">
            <h3 className="font-bold text-charcoal text-lg line-clamp-2 min-h-[3.5rem] mb-1 hover:text-gold-dark transition-colors">{listing.title}</h3>
          </Link>
          {listing.category && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full mb-3 bg-gold/10 text-gold-dark">
              {cat.emoji} {cat.label}
            </span>
          )}
          {listing.seller?.full_name && (
            <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-gold/10 text-gold-dark flex items-center justify-center text-xs font-semibold">{formatName(listing.seller.full_name).charAt(0)}</span>
              {formatName(listing.seller.full_name)}
              {rating?.review_count ? (
                <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-dark" title={'Average ' + Number(rating.average_rating).toFixed(1) + ' across ' + rating.review_count + ' reviews'}>
                  <StarRating rating={Number(rating.average_rating) || 0} size="sm" />
                  {Number(rating.average_rating).toFixed(1)} ({rating.review_count})
                </span>
              ) : null}
            </p>
          )}
          <div className="flex gap-2">
            {preview ? (
              <Link href="/login" className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                {listing.listing_type === 'service' ? '📅 Book' : '💬 Message'}
              </Link>
            ) : isOwner ? (
              <>
                <Link href={"/new?edit=" + listing.id} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                  ✏️ Edit
                </Link>
                <button
                  onClick={() => onDelete?.(listing.id, listing.title)}
                  className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-full hover:bg-red-600 transition-all hover:scale-110 shrink-0"
                  title="Delete listing"
                >
                  🗑️
                </button>
              </>
            ) : (
              <>
                {listing.listing_type === 'service' ? (
                  <Link href={"/services/" + listing.id + "/book"} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                    📅 Book
                  </Link>
                ) : (
                  listing.seller?.whatsapp_number && (
                    <a href={"https://wa.me/" + listing.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I'm interested in your \"" + listing.title + "\" listing on Campus Plug 🔌")} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-all hover:scale-[1.02] text-sm">
                      💬 Message
                    </a>
                  )
                )}
                {listing.listing_type === 'service' && listing.seller?.whatsapp_number && (
                  <a href={"https://wa.me/" + listing.seller.whatsapp_number + "?text=" + encodeURIComponent("Hi! I have a question about your \"" + listing.title + "\" service on Campus Plug 🔌")} target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-full hover:bg-green-600 transition-all hover:scale-110 shrink-0" title="Message on WhatsApp">💬</a>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
