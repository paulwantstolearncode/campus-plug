'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatName } from '@/lib/formatName'
import StarRating from '@/app/StarRating'
import {
  dismissFlag,
  hideReview,
  deleteReview,
  type ReviewWithResponse,
} from '@/lib/reviews'

interface PendingSeller {
  id: string
  full_name: string | null
  whatsapp_number: string | null
  seller_status: string
  created_at: string
}

interface PendingListing {
  id: string
  title: string
  description: string | null
  price: number
  image_url: string | null
  listing_type: string
  service_duration: string | null
  service_location: string | null
  approval_status: string
  created_at: string
  seller: {
    full_name: string | null
    whatsapp_number: string | null
  } | null
  listing_images: { id: string }[] | null
  listing_items: { id: string }[] | null
}

// Approved, image-bearing listings — the picker options for the featured
// slots on the landing page.
interface ApprovedListingOption {
  id: string
  title: string
  price: number
  listing_type: string
  image_url: string | null
  seller: { full_name: string | null } | null
}

export default function AdminPage() {
  const [tab, setTab] = useState<'sellers' | 'listings' | 'reviews' | 'featured'>('sellers')
  const [sellers, setSellers] = useState<PendingSeller[]>([])
  const [listings, setListings] = useState<PendingListing[]>([])
  const [flaggedReviews, setFlaggedReviews] = useState<ReviewWithResponse[]>([])
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approvedListings, setApprovedListings] = useState<ApprovedListingOption[]>([])
  const [featuredSelections, setFeaturedSelections] = useState<(string | null)[]>(Array(6).fill(null))
  const [featuredError, setFeaturedError] = useState<string | null>(null)
  const [featuredSaving, setFeaturedSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      // Load pending sellers
      const { data: sellersData, error: sellersError } = await supabase
        .from('profiles')
        .select('id, full_name, whatsapp_number, seller_status, created_at')
        .eq('seller_status', 'pending')
        .not('whatsapp_number', 'is', null)
        .order('created_at', { ascending: false })

      if (sellersError) {
        setError('Could not load pending sellers: ' + sellersError.message)
      } else if (sellersData) {
        setSellers(sellersData)
      }

      // Load pending listings
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('*, seller:profiles!seller_id (full_name, whatsapp_number), listing_images (id), listing_items (id)')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false })

      if (listingsError) {
        setError('Could not load pending listings: ' + listingsError.message)
      } else if (listingsData) {
        setListings(listingsData as unknown as PendingListing[])
      }

      // Flagged reviews queue (additive — if add_reviews_system.sql hasn't
      // been run, this only shows a hint inside the Reviews tab).
      const { data: reviewsData, error: reviewsErrorData } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviewer_id (full_name), seller:profiles!seller_id (full_name), response:review_responses (id, response_text)')
        .eq('is_flagged', true)
        .order('created_at', { ascending: false })

      if (reviewsErrorData) {
        console.error('Flagged reviews fetch failed:', reviewsErrorData)
        setReviewsError('Could not load flagged reviews: ' + reviewsErrorData.message)
      } else if (reviewsData) {
        setFlaggedReviews(reviewsData as ReviewWithResponse[])
      }

      // Approved listings (with images) — the featured-slot picker options.
      const { data: approvedData, error: approvedError } = await supabase
        .from('listings')
        .select('id, title, price, listing_type, image_url, seller:profiles!seller_id (full_name)')
        .eq('approval_status', 'approved')
        .not('image_url', 'is', null)
        .neq('image_url', '')
        .order('created_at', { ascending: false })

      if (approvedError) {
        console.error('Approved listings fetch failed:', approvedError)
      } else if (approvedData) {
        setApprovedListings(approvedData as unknown as ApprovedListingOption[])
      }

      // Current landing-featured slot assignments.
      const { data: featuredData, error: featuredDataError } = await supabase
        .from('landing_featured_listings')
        .select('slot, listing_id')
        .order('slot', { ascending: true })

      if (featuredDataError) {
        // Table missing until supabase/add_landing_featured_listings.sql runs.
        console.error('Featured slots fetch failed:', featuredDataError)
        setFeaturedError('Run supabase/add_landing_featured_listings.sql, then refresh. (' + featuredDataError.message + ')')
      } else if (featuredData) {
        const selections: (string | null)[] = Array(6).fill(null)
        for (const row of featuredData as { slot: number; listing_id: string | null }[]) {
          if (row.slot >= 1 && row.slot <= 6) selections[row.slot - 1] = row.listing_id
        }
        setFeaturedSelections(selections)
      }
    }

    async function checkAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        // A failed lookup (missing column, RLS, etc.) must not masquerade as
        // "not an admin" — surface the real reason instead.
        if (profileError) {
          console.error('Admin profile lookup failed:', profileError)
          setError('Could not verify admin access: ' + profileError.message)
          return
        }

        if (!profile?.is_admin) {
          alert('Admin access only')
          router.push('/')
          return
        }

        setIsAdmin(true)
        await loadData()
      } catch (err) {
        // A failed lookup must not strand the admin on the spinner forever.
        console.error('Could not load admin data:', err)
        setError('Could not load the review queue. Check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }

    checkAdmin()
  }, [])

  async function approveSeller(id: string) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ seller_status: 'approved', is_seller: true })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setSellers(prev => prev.filter(s => s.id !== id))
      }
    } catch (err) {
      console.error('Approve seller failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function rejectSeller(id: string) {
    if (!confirm('Reject this seller?')) return

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ seller_status: 'rejected', is_seller: false })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setSellers(prev => prev.filter(s => s.id !== id))
      }
    } catch (err) {
      console.error('Reject seller failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function approveListing(id: string) {
    try {
      const { error } = await supabase
        .from('listings')
        .update({ approval_status: 'approved' })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setListings(prev => prev.filter(l => l.id !== id))
      }
    } catch (err) {
      console.error('Approve listing failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  async function rejectListing(id: string, title: string) {
    if (!confirm('Reject "' + title + '"?')) return

    try {
      const { error } = await supabase
        .from('listings')
        .update({ approval_status: 'rejected' })
        .eq('id', id)

      if (error) {
        alert('Failed: ' + error.message)
      } else {
        setListings(prev => prev.filter(l => l.id !== id))
      }
    } catch (err) {
      console.error('Reject listing failed:', err)
      alert('Something went wrong. Please try again.')
    }
  }

  // ── Flagged reviews moderation ──────────────────────────────────────────
  async function reloadFlaggedReviews() {
    const { data, error } = await supabase
      .from('reviews')
      .select('*, reviewer:profiles!reviewer_id (full_name), seller:profiles!seller_id (full_name), response:review_responses (id, response_text)')
      .eq('is_flagged', true)
      .order('created_at', { ascending: false })
    if (error) {
      setReviewsError('Could not load flagged reviews: ' + error.message)
    } else {
      setFlaggedReviews((data as ReviewWithResponse[]) || [])
    }
  }

  async function dismissReviewFlag(id: string) {
    const { error } = await dismissFlag(id)
    if (error) {
      alert('Could not dismiss the flag: ' + error.message)
    } else {
      await reloadFlaggedReviews()
    }
  }

  async function hideFlaggedReview(id: string) {
    if (!confirm('Hide this review from the public? It stays in the database.')) return
    const { error } = await hideReview(id)
    if (error) {
      alert('Could not hide the review: ' + error.message)
    } else {
      await reloadFlaggedReviews()
    }
  }

  async function deleteFlaggedReview(id: string) {
    if (!confirm('Delete this review permanently? This cannot be undone.')) return
    const { error } = await deleteReview(id)
    if (error) {
      alert('Could not delete the review: ' + error.message)
    } else {
      await reloadFlaggedReviews()
    }
  }

  // ── Landing page featured slots ──────────────────────────────────────────
  function clearFeaturedSlot(index: number) {
    setFeaturedSelections(prev => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }

  async function saveFeatured() {
    // Defense in depth: no listing may occupy two slots (the UI also disables
    // already-chosen options — this catches stale state).
    const seen = new Set<string>()
    for (const id of featuredSelections) {
      if (id) {
        if (seen.has(id)) {
          alert('Each listing can only be assigned to one slot. The duplicate selection was not saved.')
          return
        }
        seen.add(id)
      }
    }

    setFeaturedSaving(true)
    try {
      const rows = featuredSelections.map((listingId, i) => ({ slot: i + 1, listing_id: listingId }))
      const { error } = await supabase
        .from('landing_featured_listings')
        .upsert(rows)

      if (error) {
        alert('Could not save: ' + error.message)
      } else {
        alert('✅ Featured listings saved. The landing page will show the new order.')
      }
    } catch (err) {
      console.error('Save featured failed:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setFeaturedSaving(false)
    }
  }

  const reviewDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">🔌</div>
          <p className="text-white/70">Loading admin...</p>
        </div>
      </div>
    )
  }

  if (error && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-xl">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-600 font-semibold">{error}</p>
          <Link href="/" className="inline-block mt-5 text-sm text-white bg-charcoal rounded-full px-5 py-2.5 hover:bg-black transition-colors">← Back to app</Link>
        </div>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug Admin</span>
          </Link>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors">← Back to app</Link>
        </div>
      </nav>

      <section className="pt-32 pb-12 animated-gradient">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Admin Dashboard</div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Review Queue</h1>
            <p className="text-white/70">Approve sellers and listings to keep Campus Plug premium.</p>
          </div>
          <Link
            href="/admin/sales"
            className="inline-flex items-center gap-2 bg-gold text-charcoal px-6 py-3 rounded-full font-bold hover:bg-gold/90 transition-colors shadow-lg shadow-gold/25"
          >
            💰 View Sales Dashboard
          </Link>
          <Link
            href="/admin/feedback"
            className="inline-flex items-center gap-2 bg-white/10 text-white px-6 py-3 rounded-full font-bold hover:bg-white/20 transition-colors"
          >
            💬 View Feedback
          </Link>
          <Link
            href="/admin/locations"
            className="inline-flex items-center gap-2 bg-white/10 text-white px-6 py-3 rounded-full font-bold hover:bg-white/20 transition-colors"
          >
            📍 Location Backfill
          </Link>
        </div>
      </section>

      <section className="bg-off-white -mt-4 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-2 mb-8 overflow-x-auto">
            <button
              onClick={() => setTab('sellers')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'sellers' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              👤 Pending Sellers ({sellers.length})
            </button>
            <button
              onClick={() => setTab('listings')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'listings' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              📦 Pending Listings ({listings.length})
            </button>
            <button
              onClick={() => setTab('reviews')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'reviews' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              🚩 Flagged Reviews ({flaggedReviews.length})
            </button>
            <button
              onClick={() => setTab('featured')}
              className={"px-6 py-3 rounded-full font-semibold whitespace-nowrap transition-all " + (tab === 'featured' ? 'bg-charcoal text-white shadow-lg' : 'bg-white text-charcoal border border-gray-200')}
            >
              ⭐ Featured ({featuredSelections.filter(Boolean).length}/6)
            </button>
          </div>

          {tab === 'sellers' ? (
            sellers.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">✨</div>
                <p className="text-xl font-bold text-charcoal">All caught up!</p>
                <p className="text-gray-500 mt-2">No pending sellers to review.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sellers.map(seller => {
                  const account = seller.full_name || 'No name'
                  const emailPrefix = (seller.full_name?.split('@')[0] || account).trim()
                  const created = new Date(seller.created_at)
                  const appliedDate = created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  const fullTimestamp = created.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  const waMessage = `Hi ${emailPrefix}! 👋\n\nThis is Paul from Campus Plug 🔌\n\nI'm verifying your seller application:\n📧 Account: ${account}\n📅 Applied: ${appliedDate}\n\nQuick check: reply YES to confirm this is really you, and I'll approve your seller account right away.\n\nWhat are you planning to offer on Campus Plug? Would love to know 👀`

                  return (
                    <div key={seller.id} className="bg-white rounded-3xl p-6 shadow-lg border border-gray-100">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-lg font-bold text-gold-dark mb-3">
                        {seller.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <p className="font-bold text-charcoal truncate" title={seller.full_name || 'No name'}>{account}</p>
                      <p className="text-xs text-gray-500 mb-3">Applied {appliedDate}</p>

                      <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
                        <p className="text-xs text-gray-600">
                          📱 <span className="font-mono">{seller.whatsapp_number ? '+' + seller.whatsapp_number : '—'}</span>
                        </p>
                        <p className="text-xs text-gray-600">🕒 {fullTimestamp}</p>
                      </div>

                      {seller.whatsapp_number && (
                        <a
                          href={"https://wa.me/" + seller.whatsapp_number + "?text=" + encodeURIComponent(waMessage)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full text-center py-3 mb-2 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 transition-colors text-sm"
                        >
                          💬 WhatsApp +{seller.whatsapp_number}
                        </a>
                      )}

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => approveSeller(seller.id)}
                          className="flex-1 py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors text-sm"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => rejectSeller(seller.id)}
                          className="py-2.5 px-4 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : tab === 'listings' ? (
            listings.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">✨</div>
                <p className="text-xl font-bold text-charcoal">All caught up!</p>
                <p className="text-gray-500 mt-2">No pending listings to review.</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listings.map(listing => {
                  const sellerName = listing.seller?.full_name || 'Unknown'
                  const namePrefix = (listing.seller?.full_name?.split('@')[0] || sellerName).trim()
                  const created = new Date(listing.created_at)
                  const postedDate = created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  const fullTimestamp = created.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  const price = 'GH₵ ' + Number(listing.price).toLocaleString()
                  const reason = listing.listing_type === 'service'
                    ? (listing.service_duration
                        ? `What's included in the ${listing.service_duration} session? Any special requirements from buyers?`
                        : "What's included in the session? Any special requirements from buyers?")
                    : 'Is this brand new or used? Any additional photos available?'
                  const waMessage = `Hi ${namePrefix}! 👋\n\nThis is Paul from Campus Plug 🔌\n\nReviewing your new listing:\n📦 Title: ${listing.title}\n💰 Price: ${price}\n📅 Posted: ${postedDate}\n\nQuick question before I approve: ${reason}\n\nYour listing was read by the Campus Plug team before going live 🛡️\n\nOnce we chat, I'll approve it right away. Thanks for being one of our first sellers! 🙏`

                  return (
                    <div key={listing.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
                      {listing.image_url ? (
                        <Image src={listing.image_url} alt={listing.title} width={400} height={192} className="w-full h-48 object-cover" />
                      ) : (
                        <div className="w-full h-48 bg-gradient-to-br from-charcoal to-gray-800 flex items-center justify-center">
                          <span className="text-5xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
                        </div>
                      )}

                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={"text-xs font-bold px-2 py-1 rounded-full " + (listing.listing_type === 'service' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                            {listing.listing_type === 'service' ? '💼 Service' : '📦 Product'}
                          </span>
                          <span className="text-xs text-gray-500">{new Date(listing.created_at).toLocaleDateString()}</span>
                        </div>

                        <h3 className="font-bold text-charcoal text-lg mb-1">{listing.title}</h3>
                        <p className="text-2xl font-bold text-gold-dark mb-2">GH₵ {Number(listing.price).toLocaleString()}</p>

                        {listing.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{listing.description}</p>
                        )}

                        {listing.service_duration && (
                          <p className="text-xs text-gray-500">⏱ {listing.service_duration}</p>
                        )}
                        {listing.service_location && (
                          <p className="text-xs text-gray-500">📍 {listing.service_location}</p>
                        )}
                        {(listing.listing_images && listing.listing_images.length > 0) || (listing.listing_items && listing.listing_items.length > 0) ? (
                          <p className="text-xs text-gray-500 mt-1">
                            🖼 {listing.listing_images?.length || 0} photo{listing.listing_images?.length === 1 ? '' : 's'} · 📦 {listing.listing_items?.length || 0} bundle item{listing.listing_items?.length === 1 ? '' : 's'}
                          </p>
                        ) : null}

                        <div className="bg-gray-50 rounded-xl p-3 mt-3 mb-4 space-y-1.5">
                          <p className="text-xs text-gray-600">👤 {sellerName}</p>
                          <p className="text-xs text-gray-600">
                            📱 <span className="font-mono">{listing.seller?.whatsapp_number ? '+' + listing.seller.whatsapp_number : '—'}</span>
                          </p>
                          <p className="text-xs text-gray-600">🕒 {fullTimestamp}</p>
                        </div>

                        {listing.seller?.whatsapp_number && (
                          <a
                            href={"https://wa.me/" + listing.seller.whatsapp_number + "?text=" + encodeURIComponent(waMessage)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center py-3 mb-2 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 transition-colors text-sm"
                          >
                            💬 WhatsApp Seller
                          </a>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => approveListing(listing.id)}
                            className="flex-1 py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors text-sm"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => rejectListing(listing.id, listing.title)}
                            className="py-2.5 px-4 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : tab === 'reviews' ? (
            reviewsError ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">🚩</div>
                <p className="text-xl font-bold text-charcoal">Reviews not available yet</p>
                <p className="text-gray-500 mt-2">Run supabase/add_reviews_system.sql, then refresh. ({reviewsError})</p>
              </div>
            ) : flaggedReviews.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">✨</div>
                <p className="text-xl font-bold text-charcoal">No flagged reviews</p>
                <p className="text-gray-500 mt-2">Reviews sellers have flagged for moderation will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {flaggedReviews.map((review) => {
                  const reviewerName = review.reviewer?.full_name ? formatName(review.reviewer.full_name) : 'Verified Buyer'
                  const sellerName = review.seller?.full_name ? formatName(review.seller.full_name) : 'Unknown seller'
                  return (
                    <div key={review.id} className="bg-white rounded-3xl p-6 shadow-lg border border-amber-200">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          🚩 Flagged
                        </span>
                        <span className="text-[10px] text-gray-400">{reviewDate(review.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500">Reviewing: <span className="font-bold text-charcoal">{sellerName}</span></p>
                      <p className="text-xs text-gray-500 mb-2">By: <span className="font-bold text-charcoal">{reviewerName}</span></p>
                      <div className="flex items-center gap-2 mb-2">
                        <StarRating rating={review.rating} size="sm" />
                        <span className="text-[10px] text-green-600 font-semibold">✅ Verified buyer</span>
                      </div>
                      {review.review_text && (
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">{review.review_text}</p>
                      )}
                      {review.flagged_reason && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2.5 mb-3">
                          <span className="font-bold">Reason:</span> {review.flagged_reason}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={() => dismissReviewFlag(review.id)}
                          className="flex-1 py-2.5 bg-charcoal text-white rounded-full font-semibold hover:bg-black transition-colors text-sm"
                        >
                          ✓ Dismiss Flag
                        </button>
                        <button
                          onClick={() => hideFlaggedReview(review.id)}
                          className="py-2.5 px-4 bg-amber-500 text-white rounded-full font-semibold hover:bg-amber-600 transition-colors text-sm"
                        >
                          🙈 Hide
                        </button>
                        <button
                          onClick={() => deleteFlaggedReview(review.id)}
                          className="py-2.5 px-4 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition-colors text-sm"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            featuredError ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">⭐</div>
                <p className="text-xl font-bold text-charcoal">Featured listings not available yet</p>
                <p className="text-gray-500 mt-2">Run supabase/add_landing_featured_listings.sql, then refresh. ({featuredError})</p>
              </div>
            ) : (
              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-charcoal">Landing Page Featured Listings</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Choose which listings appear in the landing page preview and in what order. Empty slots are filled with the newest approved listings automatically.
                    </p>
                  </div>
                  <button
                    onClick={saveFeatured}
                    disabled={featuredSaving}
                    className="shrink-0 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors disabled:opacity-50"
                  >
                    {featuredSaving ? 'Saving...' : '💾 Save changes'}
                  </button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {featuredSelections.map((sel, i) => {
                    const listing = approvedListings.find(l => l.id === sel)
                    const takenElsewhere = featuredSelections
                      .map((id, j) => (j !== i ? id : null))
                      .filter(Boolean) as string[]
                    return (
                      <div key={i} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Slot {i + 1}</span>
                          {sel && (
                            <button
                              onClick={() => clearFeaturedSlot(i)}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                            >
                              ✕ Clear
                            </button>
                          )}
                        </div>

                        {/* Current selection preview */}
                        {listing ? (
                          <div className="flex items-center gap-3 mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-2.5">
                            {listing.image_url && (                               <Image src={listing.image_url} alt={listing.title} width={56} height={56} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-charcoal text-sm truncate">{listing.title}</p>
                              <p className="text-xs text-gray-500">
                                GH₵ {Number(listing.price).toLocaleString()}
                                {listing.seller?.full_name ? ' · ' + formatName(listing.seller.full_name) : ''}
                              </p>
                            </div>
                          </div>
                        ) : sel ? (
                          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                            This listing is no longer available (it may have been deleted).
                          </div>
                        ) : (
                          <div className="mb-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
                            Empty slot — filled automatically on the landing page
                          </div>
                        )}

                        <select
                          value={sel || ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setFeaturedSelections(prev => {
                              const next = [...prev]
                              next[i] = v ? v : null
                              return next
                            })
                          }}
                          className="w-full px-4 py-2.5 rounded-2xl border-2 border-gray-200 text-sm font-semibold text-charcoal bg-white focus:outline-none focus:border-gold transition-colors"
                        >
                          <option value="">— Empty slot —</option>
                          {approvedListings.map(l => {
                            const taken = takenElsewhere.includes(l.id)
                            return (
                              <option key={l.id} value={l.id} disabled={taken}>
                                {taken ? '⛔ ' : ''}{l.title} — GH₵ {Number(l.price).toLocaleString()}{l.seller?.full_name ? ' (' + formatName(l.seller.full_name) + ')' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </section>
    </main>
  )
}