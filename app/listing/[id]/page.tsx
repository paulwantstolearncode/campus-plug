'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatPrice, formatPriceRange, getPriceRange } from '@/lib/format'
import { formatName } from '@/lib/formatName'
import { getCategoryDisplay } from '@/lib/categories'

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
            <span className={"inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full " + (listing.category ? 'bg-gold text-charcoal' : 'bg-white/10 text-white/70 border border-white/20')}>
              {categoryDisplay.emoji} {categoryDisplay.label}
            </span>
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
                      <img
                        key={active}
                        src={photos[active]}
                        alt={listing.title + ' photo ' + (active + 1)}
                        className="w-full h-full object-cover fade-up"
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
                          <img src={src} alt={'Thumbnail ' + (idx + 1)} className="w-full h-full object-cover" />
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
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
