'use client'
import { useState } from 'react'
import NavBar from '@/app/components/NavBar'
import ListingCard from '@/app/ListingCard'
import StarRating from '@/app/StarRating'
import type { SellerWithListings } from '@/lib/sellers'
import { formatName } from '@/lib/formatName'
import { SITE_URL } from '@/lib/site'
import { logWhatsappShare } from '@/lib/analytics'

interface ShopClientProps {
  seller: SellerWithListings
}

export default function ShopClient({ seller }: ShopClientProps) {
  const [filter, setFilter] = useState<'all' | 'service' | 'product'>('all')

  const displayName = seller.full_name ? formatName(seller.full_name) : 'Student Seller'
  const shopUrl = `${SITE_URL}/shop/${seller.id}`

  const filteredListings =
    filter === 'all'
      ? seller.listings
      : seller.listings.filter((l) => l.listing_type === filter)

  const serviceCount = seller.listings.filter((l) => l.listing_type === 'service').length
  const productCount = seller.listings.filter((l) => l.listing_type === 'product').length

  const shareText = `Check out ${displayName}'s shop on Campus Plug — ${seller.listings.length} items available 👉 ${shopUrl}`

  const handleWhatsAppShare = async () => {
    logWhatsappShare(seller.id)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${displayName}'s Shop`, text: shareText, url: shopUrl })
      } catch {
        // user cancelled
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
    }
  }

  const whatsappUrl = seller.whatsapp_number
    ? `https://wa.me/${seller.whatsapp_number}?text=${encodeURIComponent(`Hi ${displayName}! I found you on Campus Plug (https://campuspluggh.com/shop/${seller.id}). I'm interested in your services!`)}`
    : null

  return (
    <main className="min-h-screen bg-off-white">
      {/* Nav */}
<NavBar variant="light" back={{ href: '/services', label: 'Browse all listings' }} />

      {/* Seller Banner — premium storefront header */}
      <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute -top-20 right-0 w-96 h-96 bg-gold/15 rounded-full blur-3xl"></div>
          <div className="blob absolute bottom-0 left-1/4 w-72 h-72 bg-gold/10 rounded-full blur-3xl" style={{ animationDelay: '6s' }}></div>
        </div>
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '56px 56px' }}
        ></div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gold-vivid/30 to-gold/5 flex items-center justify-center text-3xl font-bold text-gold-vivid shrink-0 border border-gold/30 shadow-glow">
              {displayName.charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold text-white">{displayName}</h1>
                <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-300 px-2.5 py-1 rounded-full text-xs font-bold border border-green-500/30">
                  ✓ Verified Student Seller
                </span>
              </div>

              {/* Rating */}
              {seller.rating && seller.rating.review_count > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <StarRating rating={Number(seller.rating.average_rating) || 0} size="sm" />
                  <span className="text-sm font-bold text-white">
                    {Number(seller.rating.average_rating).toFixed(1)} ({seller.rating.review_count} reviews)
                  </span>
                  {seller.rating.is_top_rated && (
                    <span className="inline-flex items-center gap-1 bg-gold/15 border border-gold/40 text-gold-vivid px-2.5 py-1 rounded-full text-xs font-bold">
                      ⭐ Top Rated
                    </span>
                  )}
                </div>
              )}

              {/* Location */}
              {seller.campus_location && (
                <p className="text-sm text-white/60 mt-2">📍 {seller.campus_location}</p>
              )}

              {/* Stats */}
              <p className="text-xs text-white/40 font-mono mt-2">
                {seller.listings.length} approved listing{seller.listings.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-whatsapp text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-whatsapp-bright transition-colors"
                >
                  💬 Message {displayName} on WhatsApp
                </a>
              )}
              <button
                onClick={handleWhatsAppShare}
                className="flex items-center justify-center gap-2 bg-gold text-charcoal px-6 py-3 rounded-full font-semibold text-sm hover:bg-gold-dark transition-colors min-h-[44px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Share This Shop
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="relative pb-24 md:pb-32">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-6">
            {[
              { key: 'all' as const, label: `All Items (${seller.listings.length})` },
              { key: 'service' as const, label: `Services (${serviceCount})` },
              { key: 'product' as const, label: `Products (${productCount})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  filter === tab.key
                    ? 'bg-charcoal text-white shadow-lg'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-charcoal'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Listing grid */}
          {filteredListings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4 opacity-50">📋</div>
              <p className="text-xl font-bold text-charcoal mb-2">No listings yet</p>
              <p className="text-gray-500">
                {filter === 'all'
                  ? "This seller hasn't published any listings yet."
                  : `No ${filter === 'service' ? 'services' : 'products'} listed yet.`}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredListings.map((listing, idx) => (
                <ListingCard
                  key={listing.id}
                  listing={{
                    ...listing,
                    seller: {
                      full_name: seller.full_name,
                      whatsapp_number: seller.whatsapp_number,
                    },
                  }}
                  index={idx}
                  sellerRatings={
                    seller.rating
                      ? { [seller.id]: { ...seller.rating, seller_id: seller.id, five_star: 0, four_star: 0, three_star: 0, two_star: 0, one_star: 0 } }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
