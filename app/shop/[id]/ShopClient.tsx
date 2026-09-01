'use client'
import { useState } from 'react'
import NavBar from '@/app/components/NavBar'
import ListingCard from '@/app/ListingCard'
import StarRating from '@/app/StarRating'
import type { SellerWithListings } from '@/lib/sellers'
import { formatName } from '@/lib/formatName'
import { SITE_URL } from '@/lib/site'

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

  const shareText = `Check out my student shop "${displayName}" on Campus Plug: ${shopUrl}`

  const handleShare = async () => {
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
    ? `https://wa.me/${seller.whatsapp_number}?text=${encodeURIComponent(`Hi ${displayName}! I found your shop on Campus Plug 🔌`)}`
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
                onClick={handleShare}
                className="flex items-center justify-center gap-2 glass text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-white/10 transition-colors border border-white/15"
              >
                📢 Share Shop on WhatsApp
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
