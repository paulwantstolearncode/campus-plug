'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getSellerAnalytics, type ListingAnalytics } from '@/lib/analytics'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { formatPrice } from '@/lib/format'
import { StatCardSkeleton, DashboardListingSkeleton } from '@/app/components/Skeleton'
import { formatName } from '@/lib/formatName'
import { isWithinEditWindow, formatDateTime } from '@/lib/sales'
import StarRating from '@/app/StarRating'
import {
  getSellerRating,
  createResponse,
  updateResponse,
  flagReview,
  deleteReview,
  type SellerRating,
  type ReviewWithResponse,
} from '@/lib/reviews'

interface MyListing {
  id: string
  title: string
  price: number
  image_url: string | null
  listing_type: string
  approval_status: string
  created_at: string
}

interface MyBooking {
  id: string
  booking_date: string | null
  booking_time: string | null
  notes: string | null
  status: string | null
  completed_at: string | null
  actual_amount: number | null
  seller_notes: string | null
  created_at: string
  listing: { id: string; title: string; price: number } | null
  buyer: { full_name: string | null } | null
}

interface MySale {
  id: string
  total_amount: number
  status: string
  created_at: string
  buyer_name: string | null
  listing: { id: string; title: string } | null
}

// A completed booking where the current user was the BUYER (review entry).
interface BuyerBooking {
  id: string
  seller_id: string
  listing: { id: string; title: string } | null
}

export default function DashboardPage() {
  const [listings, setListings] = useState<MyListing[]>([])
  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [sales, setSales] = useState<MySale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [salesError, setSalesError] = useState<string | null>(null)
  // "?recorded=1" is set by the record-sale page after a successful insert.
  const [recorded] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('recorded') === '1'
  })
  const [completing, setCompleting] = useState<MyBooking | null>(null)
  const [completeAmount, setCompleteAmount] = useState('')
  const [completeNotes, setCompleteNotes] = useState('')
  // Reviews system state (best-effort — additive, never blocks the dashboard).
  const [reviews, setReviews] = useState<ReviewWithResponse[]>([]) // reviews about me
  const [myRating, setMyRating] = useState<SellerRating | null>(null)
  const [writtenReviews, setWrittenReviews] = useState<ReviewWithResponse[]>([]) // reviews I wrote
  const [reviewableBookings, setReviewableBookings] = useState<BuyerBooking[]>([])
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingResponse, setEditingResponse] = useState<string | null>(null)
  const [editingResponseText, setEditingResponseText] = useState('')
  const [flaggingId, setFlaggingId] = useState<string | null>(null)
  const [flagReason, setFlagReason] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [submittingFlag, setSubmittingFlag] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<ListingAnalytics[]>([])
  const [boostingId, setBoostingId] = useState<string | null>(null)
  const router = useRouter()

  // ── Reviews system ──────────────────────────────────────────────────────
  // Reviews about me + the buyer-side review records. Declared before the
  // load effect that calls it. Best-effort and failure-tolerant: if
  // add_reviews_system.sql hasn't been run yet, the sections below show a
  // hint instead of breaking the dashboard.
  const loadReviewData = async (userId: string) => {
    try {
      const { data: reviewData, error: reviewError } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviewer_id (full_name), response:review_responses (id, response_text, created_at, updated_at)')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (reviewError) {
        console.error('Dashboard reviews fetch failed:', reviewError)
        setReviewsError('Could not load reviews: ' + reviewError.message)
        return
      }
      setReviews((reviewData as ReviewWithResponse[]) || [])
      setReviewsError(null)

      const { data: ratingData } = await supabase
        .from('seller_ratings')
        .select('*')
        .eq('seller_id', userId)
        .maybeSingle()
      setMyRating((ratingData as SellerRating) || null)

      // Buyer side: completed bookings I made as a buyer + reviews I wrote.
      const { data: asBuyer, error: asBuyerError } = await supabase
        .from('bookings')
        .select('id, seller_id, listing:listings!listing_id (id, title)')
        .eq('buyer_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
      if (asBuyerError) {
        console.error('Dashboard buyer-bookings fetch failed:', asBuyerError)
      } else {
        setReviewableBookings((asBuyer as unknown as BuyerBooking[]) || [])
      }

      const { data: written } = await supabase
        .from('reviews')
        .select('*, seller:profiles!seller_id (full_name)')
        .eq('reviewer_id', userId)
        .order('created_at', { ascending: false })
      setWrittenReviews((written as ReviewWithResponse[]) || [])
    } catch (err) {
      console.error('Dashboard review data load failed:', err)
    }
  }

  const submitReply = async (reviewId: string) => {
    if (!replyText.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSubmittingReply(true)
    const { error } = await createResponse(reviewId, user.id, replyText)
    if (error) {
      alert('Could not post your reply: ' + error.message)
    } else {
      setReplyingTo(null)
      setReplyText('')
      await loadReviewData(user.id)
    }
    setSubmittingReply(false)
  }

  const submitResponseEdit = async (reviewId: string) => {
    const review = reviews.find((r) => r.id === reviewId)
    if (!review?.response || !editingResponseText.trim()) return
    setSubmittingReply(true)
    const { error } = await updateResponse(review.response.id, editingResponseText)
    if (error) {
      alert('Could not save your reply: ' + error.message)
    } else {
      setEditingResponse(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await loadReviewData(user.id)
    }
    setSubmittingReply(false)
  }

  const submitFlag = async (reviewId: string) => {
    if (!flagReason.trim()) {
      alert('Please add a short reason for flagging')
      return
    }
    setSubmittingFlag(true)
    const { error } = await flagReview(reviewId, flagReason)
    if (error) {
      alert('Could not flag the review: ' + error.message)
    } else {
      setFlaggingId(null)
      setFlagReason('')
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await loadReviewData(user.id)
    }
    setSubmittingFlag(false)
  }

  const deleteWrittenReview = async (reviewId: string) => {
    if (!confirm('Delete your review? This cannot be undone.')) return
    const { error } = await deleteReview(reviewId)
    if (error) {
      alert('Could not delete the review: ' + error.message)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await loadReviewData(user.id)
  }

  useEffect(() => {
    // Drop the query param so a refresh doesn't re-show the banner.
    if (recorded && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('recorded')
      window.history.replaceState({}, '', url)
    }
  }, [recorded])

  useEffect(() => {
    async function loadDashboard() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        setUserId(user.id)

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_seller')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('Dashboard profile lookup failed:', profileError)
          setError('Could not verify your seller account: ' + profileError.message)
          return
        }

        if (!profile?.is_seller) {
          router.push('/become-seller')
          return
        }

        // My listings, all statuses, newest first.
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('id, title, price, image_url, listing_type, approval_status, created_at')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })

        if (listingError) {
          console.error('Dashboard listings fetch failed:', listingError)
          setError('Could not load your listings: ' + listingError.message)
        } else if (listingData) {
          setListings(listingData as unknown as MyListing[])
        }

        // Recent bookings. The buyer embed needs the seller_dashboard_rls.sql
        // policy; if it hasn't been run, this logs an RLS error and buyer
        // names show as — (listings still render).
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('*, listing:listings!listing_id (id, title, price), buyer:profiles!buyer_id (full_name)')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (bookingError) {
          console.error('Dashboard bookings fetch failed:', bookingError)
          setBookingsError('Could not load bookings: ' + bookingError.message)
        } else if (bookingData) {
          setBookings(bookingData as unknown as MyBooking[])
        }

        // Product sales. Requires add_sales_tracking.sql; if it hasn't been
        // run, this logs an error and the section shows a hint.
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .select('*, listing:listings!listing_id (id, title)')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (saleError) {
          console.error('Dashboard sales fetch failed:', saleError)
          setSalesError('Could not load your sales: ' + saleError.message)
        } else if (saleData) {
          setSales(saleData as unknown as MySale[])
        }

        // Reviews about me + my review records (additive, failure-tolerant).
        await loadReviewData(user.id)

        // Seller analytics (views, clicks, conversion) — additive, failure-tolerant.
        const sellerAnalytics = await getSellerAnalytics(user.id)
        setAnalytics(sellerAnalytics)
      } catch (err) {
        console.error('Dashboard load failed:', err)
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [router])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-charcoal">
        <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <div className="h-4 bg-white/10 rounded-full w-32 mb-4 animate-pulse" />
            <div className="h-12 bg-white/10 rounded-xl w-2/3 mb-3 animate-pulse" />
            <div className="h-5 bg-white/10 rounded-lg w-1/2 animate-pulse" />
          </div>
        </section>
        <section className="relative pb-24 bg-off-white -mt-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <DashboardListingSkeleton key={i} />
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  const approved = listings.filter(l => l.approval_status === 'approved').length
  const pending = listings.filter(l => l.approval_status === 'pending').length

  const statusChip = (status: string) => {
    if (status === 'approved') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">✅ Approved</span>
    }
    if (status === 'pending') {
      return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold">⏳ Pending</span>
    }
    return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">❌ Rejected</span>
  }

  const bookingStatusChip = (status: string | null) => {
    if (status === 'completed') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">✅ Completed</span>
    }
    if (status === 'cancelled') {
      return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">❌ Cancelled</span>
    }
    // Legacy bookings (status NULL before add_sales_tracking.sql) default to pending.
    return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold">⏳ Pending</span>
  }

  const saleStatusChip = (status: string) => {
    if (status === 'completed') {
      return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">✅ Completed</span>
    }
    if (status === 'refunded') {
      return <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-bold">↩️ Refunded</span>
    }
    return <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">❌ Cancelled</span>
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Revenue = completed bookings' actual_amount + completed sales' total_amount.
  // Refunded/cancelled records stay visible in their lists but don't count
  // toward the headline numbers (proper accounting practice).
  const completedBookings = bookings.filter(b => b.status === 'completed')
  const completedSales = sales.filter(s => s.status === 'completed')
  const totalRevenue =
    completedBookings.reduce((sum, b) => sum + Number(b.actual_amount || 0), 0) +
    completedSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)

  const openCompleteModal = (booking: MyBooking) => {
    setCompleting(booking)
    setCompleteAmount(booking.listing?.price != null ? String(booking.listing.price) : '')
    setCompleteNotes('')
  }

  const confirmComplete = async () => {
    if (!completing) return
    const amount = Number(completeAmount)
    if (completeAmount.trim() === '' || Number.isNaN(amount) || amount < 0) {
      alert('Please enter a valid amount received')
      return
    }

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        actual_amount: amount,
        seller_notes: completeNotes.trim() || null,
      })
      .eq('id', completing.id)

    if (error) {
      alert('Could not update booking: ' + error.message)
      return
    }

    setBookings(prev => prev.map(b =>
      b.id === completing.id
        ? { ...b, status: 'completed', completed_at: new Date().toISOString(), actual_amount: amount, seller_notes: completeNotes.trim() || null }
        : b
    ))
    setCompleting(null)
    setCompleteAmount('')
    setCompleteNotes('')
  }

  const cancelBooking = async (id: string) => {
    if (!confirm('Cancel this booking?')) return

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (error) {
      alert('Could not cancel booking: ' + error.message)
      return
    }

    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
  }

  const changeSaleStatus = async (id: string, status: string) => {
    const label = status === 'refunded' ? 'refunded' : 'cancelled'
    if (!confirm('Mark this sale as ' + label + '?')) return

    const { error } = await supabase
      .from('sales')
      .update({ status })
      .eq('id', id)

    if (error) {
      alert('Could not update sale: ' + error.message)
      return
    }

    setSales(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  // Privacy: buyers never consented to sellers seeing their emails, so the
  // buyer name is rendered through the shared formatName() helper (see
  // lib/formatName.ts) which never prints a full email address.
  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group">
              <span className="group-hover:-translate-x-1 transition-transform">←</span>
              Back to app
            </Link>
            <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">Logout</button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-12 md:pt-40 md:pb-16 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="fade-up inline-block text-sm font-semibold text-gold tracking-widest uppercase mb-4">Seller Dashboard</div>
          <h1 className="fade-up fade-up-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-4">
            Your Campus Plug<br />
            <span className="gradient-text">at a glance</span>
          </h1>
          <p className="fade-up fade-up-delay-2 text-lg text-white/70 max-w-xl">
            Track your listings, bookings and sales in one place.
          </p>
        </div>
      </section>

      <section className="relative pb-24 md:pb-32 bg-off-white -mt-4">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10">
          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {recorded && (
            <div className="mb-8 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              ✅ Sale recorded! It&apos;s in your Product Sales list below. You can edit it within 24 hours.
            </div>
          )}

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total listings', value: listings.length, icon: '📦' },
              { label: 'Approved', value: approved, icon: '✅' },
              { label: 'Pending review', value: pending, icon: '⏳' },
              { label: 'Bookings received', value: bookings.length, icon: '📅' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
                <div className="text-2xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-bold text-charcoal">{stat.value}</div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* SALES STATS */}
          <div className="bg-white rounded-3xl p-6 shadow-lg border border-gold/40 mb-12">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">💰</span>
              <h2 className="font-bold text-charcoal">Your Sales Stats</h2>
              <span className="text-xs text-gray-400 font-normal">(private to you)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total Bookings Completed</div>
                <div className="text-2xl font-bold text-charcoal mt-1">{completedBookings.length}</div>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total Product Sales</div>
                <div className="text-2xl font-bold text-charcoal mt-1">{completedSales.length}</div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-gold/15 to-gold/5 p-4 border border-gold/20">
                <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider">Total Revenue</div>
                <div className="text-2xl font-bold text-gold-dark mt-1">{formatPrice(totalRevenue)}</div>
              </div>
            </div>
          </div>

          {/* YOUR PUBLIC STOREFRONT */}
          {userId && (
            <div className="bg-gradient-to-r from-gold/10 to-gold/5 rounded-3xl p-6 border border-gold/30 mb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs font-bold text-gold-dark uppercase tracking-widest mb-1">Your Public Storefront</p>
                  <p className="text-sm text-charcoal font-mono">campuspluggh.com/shop/{userId}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText('https://campuspluggh.com/shop/' + userId)
                      alert('Link copied!')
                    }}
                    className="bg-charcoal text-white px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-colors"
                  >
                    📋 Copy Link
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Check out my student shop on Campus Plug: https://campuspluggh.com/shop/${userId}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-whatsapp text-white px-4 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    📢 Share on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* LISTING ANALYTICS */}
          {analytics.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📊</span>
                <h2 className="text-2xl font-bold text-charcoal">Listing Analytics</h2>
                <span className="text-xs text-gray-400 font-normal">(views & WhatsApp clicks)</span>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total Views</div>
                  <div className="text-2xl font-bold text-charcoal mt-1">{analytics.reduce((s, a) => s + a.views, 0).toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">WhatsApp Clicks</div>
                  <div className="text-2xl font-bold text-whatsapp mt-1">{analytics.reduce((s, a) => s + a.clicks, 0).toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-lg border border-gold/30">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Conversion Rate</div>
                  <div className="text-2xl font-bold text-gold-dark mt-1">
                    {analytics.reduce((s, a) => s + a.views, 0) > 0
                      ? ((analytics.reduce((s, a) => s + a.clicks, 0) / analytics.reduce((s, a) => s + a.views, 0)) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </div>
              </div>

              {/* Per-listing breakdown */}
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 divide-y divide-gray-100">
                {analytics.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-charcoal text-sm truncate">{item.title}</p>
                    </div>
                    <div className="flex items-center gap-5 text-xs">
                      <div className="text-right">
                        <div className="font-bold text-charcoal">{item.views}</div>
                        <div className="text-gray-400">views</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-whatsapp">{item.clicks}</div>
                        <div className="text-gray-400">clicks</div>
                      </div>
                      <div className="text-right w-14">
                        <div className="font-bold text-gold-dark">{item.conversion}%</div>
                        <div className="text-gray-400">CVR</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MY LISTINGS */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-charcoal">My Listings</h2>
            <Link href="/new" className="bg-charcoal text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-colors">＋ New Listing</Link>
          </div>

          {listings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 mb-12">
              <div className="text-5xl mb-4">🏠</div>
              <p className="text-xl font-bold text-charcoal">No listings yet</p>
              <p className="text-gray-500 mt-2 mb-6">Create your first listing and start selling on campus.</p>
              <Link href="/new" className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors">＋ Post a listing</Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-12">
              {listings.map((listing) => (
                <div key={listing.id} className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100">
                  {listing.image_url ? (
                    <Image src={listing.image_url} alt={listing.title} width={400} height={160} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-charcoal to-gray-800 flex items-center justify-center">
                      <span className="text-4xl opacity-40">{listing.listing_type === 'service' ? '💼' : '📦'}</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs text-gray-500">{formatDate(listing.created_at)}</span>
                      {statusChip(listing.approval_status)}
                    </div>
                    <h3 className="font-bold text-charcoal text-lg line-clamp-1">{listing.title}</h3>
                    <p className="text-xl font-bold text-gold-dark mb-4">{formatPrice(listing.price)}</p>
                    <div className="flex gap-2">
                      <Link href={"/new?edit=" + listing.id} className="flex-1 flex items-center justify-center gap-1.5 bg-charcoal text-white py-2.5 rounded-full font-semibold hover:bg-black transition-colors text-sm">✏️ Edit</Link>
                      <Link href={"/listing/" + listing.id} className="flex-1 flex items-center justify-center bg-white text-charcoal py-2.5 rounded-full font-semibold border border-gray-200 hover:border-charcoal transition-colors text-sm">👁 View</Link>
                    </div>
                    {listing.approval_status === 'approved' && (
                      <button
                        onClick={async () => {
                          if (boostingId) return
                          setBoostingId(listing.id)
                          const boostDays = 7
                          const boostedUntil = new Date(Date.now() + boostDays * 86400000).toISOString()
                          const { error } = await supabase
                            .from('listings')
                            .update({ boosted_until: boostedUntil })
                            .eq('id', listing.id)
                          if (error) {
                            alert('Could not boost listing: ' + error.message)
                          } else {
                            alert('🎉 Listing boosted for ' + boostDays + ' days! It will appear higher in search results.')
                          }
                          setBoostingId(null)
                        }}
                        disabled={!!boostingId}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 bg-gold/10 text-gold-dark py-2 rounded-full font-semibold text-xs border border-gold/30 hover:bg-gold/20 transition-colors disabled:opacity-50"
                      >
                        🚀 Boost this listing (7 days)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* RECENT BOOKINGS */}
          <h2 className="text-2xl font-bold text-charcoal mb-1">Recent Bookings</h2>
          <p className="text-xs text-gray-500 mb-4">
            Buyer privacy protected 🔒 Share your WhatsApp on your listings — buyers will reach out to you.
          </p>

          {bookingsError && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
              ⚠️ {bookingsError} — run seller_dashboard_rls.sql (or check the bookings schema) and refresh.
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">📅</div>
              <p className="text-xl font-bold text-charcoal">No bookings yet</p>
              <p className="text-gray-500 mt-2">When buyers book your services, they&apos;ll show up here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 divide-y divide-gray-100">
              {bookings.map((booking) => (
                <div key={booking.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-semibold text-charcoal">{booking.listing?.title || 'Unknown listing'}</p>
                    {booking.listing && (
                      <Link href={"/listing/" + booking.listing.id} className="text-xs text-gold-dark hover:underline">view →</Link>
                    )}
                    {bookingStatusChip(booking.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    📅 {formatDate(booking.booking_date)} · 🕒 {booking.booking_time || '—'} · 👤 Booking from: {formatName(booking.buyer?.full_name)}
                  </p>
                  {booking.notes && <p className="text-xs text-gray-600 mt-1 italic">&quot;{booking.notes}&quot;</p>}
                  {booking.status === 'completed' && booking.actual_amount != null && (
                    <p className="text-xs text-gray-600 mt-1 font-semibold">💰 Received: {formatPrice(booking.actual_amount)}</p>
                  )}

                  {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        onClick={() => openCompleteModal(booking)}
                        className="inline-flex items-center gap-1.5 bg-green-500 text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-green-600 transition-colors"
                      >
                        ✅ Mark Completed
                      </button>
                      <button
                        onClick={() => cancelBooking(booking.id)}
                        className="inline-flex items-center gap-1.5 bg-white text-red-600 px-4 py-2 rounded-full font-semibold text-xs border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* PRODUCT SALES */}
          <div className="flex items-center justify-between mb-4 mt-14">
            <div>
              <h2 className="text-2xl font-bold text-charcoal">Product Sales</h2>
              <p className="text-xs text-gray-500 mt-1">Record your product transactions — you can edit them within 24 hours.</p>
            </div>
            <Link href="/dashboard/record-sale" className="bg-charcoal text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-black transition-colors whitespace-nowrap">➕ Record New Sale</Link>
          </div>

          {salesError && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
              ⚠️ {salesError} — run add_sales_tracking.sql in Supabase and refresh.
            </div>
          )}

          {sales.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
              <div className="text-5xl mb-4">🛍️</div>
              <p className="text-xl font-bold text-charcoal">No product sales recorded yet</p>
              <p className="text-gray-500 mt-2">Sold something? Record it here to build your stats.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-lg border border-gray-100 divide-y divide-gray-100">
              {sales.map((sale) => (
                <div key={sale.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="font-semibold text-charcoal">{sale.listing?.title || 'Unknown listing'}</p>
                    <span className="font-bold text-gold-dark text-sm ml-auto">{formatPrice(sale.total_amount)}</span>
                    {saleStatusChip(sale.status)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    📅 {formatDateTime(sale.created_at)}
                    {sale.buyer_name ? ' · 👤 ' + formatName(sale.buyer_name) : ''}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <Link
                      href={"/dashboard/sales/" + sale.id}
                      className="inline-flex items-center gap-1.5 bg-charcoal text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-black transition-colors"
                    >
                      👁 View Details
                    </Link>
                    {isWithinEditWindow(sale.created_at) ? (
                      <Link
                        href={"/dashboard/sales/" + sale.id}
                        className="inline-flex items-center gap-1.5 bg-white text-charcoal px-4 py-2 rounded-full font-semibold text-xs border border-gray-200 hover:border-charcoal transition-colors"
                      >
                        ✏️ Edit
                      </Link>
                    ) : sale.status === 'completed' ? (
                      <>
                        <button
                          onClick={() => changeSaleStatus(sale.id, 'refunded')}
                          className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-amber-600 transition-colors"
                        >
                          ↩️ Mark Refunded
                        </button>
                        <button
                          onClick={() => changeSaleStatus(sale.id, 'cancelled')}
                          className="inline-flex items-center gap-1.5 bg-white text-red-600 px-4 py-2 rounded-full font-semibold text-xs border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                        >
                          ❌ Mark Cancelled
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* YOUR REVIEWS (buyer side) — completed bookings I made + reviews
              I wrote. Only renders when there is something to show. */}
          {(() => {
            const reviewable = reviewableBookings.filter(
              (b) => !writtenReviews.some((w) => w.booking_id === b.id)
            )
            if (reviewable.length === 0 && writtenReviews.length === 0) return null

            return (
              <div className="mt-14">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-charcoal">Your Reviews</h2>
                    <p className="text-xs text-gray-500 mt-1">Reviews you&apos;ve left and transactions you can review.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {reviewable.map((b) => (
                    <div key={b.id} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
                      <p className="font-semibold text-charcoal truncate">{b.listing?.title || 'Unknown listing'}</p>
                      <p className="text-xs text-gray-500 mt-1 mb-4">
                        ✅ You completed a booking for this — share your experience with the seller.
                      </p>
                      <Link
                        href={'/reviews/new?bookingId=' + b.id + '&sellerId=' + b.seller_id}
                        className="inline-flex items-center gap-1.5 bg-gold text-charcoal px-5 py-2.5 rounded-full font-bold text-sm hover:bg-gold-dark transition-all hover:scale-[1.02] shadow-md"
                      >
                        ⭐ Leave a Review
                      </Link>
                    </div>
                  ))}

                  {writtenReviews.map((w) => (
                    <div key={w.id} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-bold text-charcoal truncate">
                          {w.seller?.full_name ? formatName(w.seller.full_name) : 'Seller'}
                        </p>
                        <span className="text-[10px] text-gray-400">{formatDate(w.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={w.rating} size="sm" />
                        <span className="text-[10px] text-green-600 font-semibold">✅ Verified buyer</span>
                      </div>
                      {w.review_text && (
                        <p className="text-sm text-gray-700 mt-2 leading-relaxed line-clamp-3">{w.review_text}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Link
                          href={'/reviews/new?reviewId=' + w.id}
                          className="inline-flex items-center gap-1.5 bg-charcoal text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-black transition-colors"
                        >
                          ✏️ Edit
                        </Link>
                        <button
                          onClick={() => deleteWrittenReview(w.id)}
                          className="inline-flex items-center gap-1.5 bg-white text-red-600 px-4 py-2 rounded-full font-semibold text-xs border border-red-200 hover:border-red-400 hover:bg-red-50 transition-colors"
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* REVIEWS ABOUT YOU (seller side) — with reply + flag */}
          <div className="mt-14">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold text-charcoal">Reviews About You</h2>
              {myRating && myRating.review_count > 0 && (
                <span className="inline-flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-full text-sm font-bold text-charcoal shadow-sm">
                  <StarRating rating={Number(myRating.average_rating) || 0} size="sm" />
                  {Number(myRating.average_rating).toFixed(1)} ({myRating.review_count})
                </span>
              )}
              {myRating?.is_top_rated && (
                <span className="inline-flex items-center gap-1.5 bg-gold text-charcoal px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                  ⭐ Top Rated
                </span>
              )}
            </div>

            {reviewsError && (
              <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                ⚠️ {reviewsError} — run add_reviews_system.sql in Supabase and refresh.
              </div>
            )}

            {reviews.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-gray-100">
                <div className="text-5xl mb-4">⭐</div>
                <p className="text-xl font-bold text-charcoal">No reviews yet</p>
                <p className="text-gray-500 mt-2">When buyers complete transactions, their verified reviews show up here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 divide-y divide-gray-100">
                {reviews.map((r) => {
                  const reviewerName = r.reviewer?.full_name
                    ? formatName(r.reviewer.full_name)
                    : 'Verified Buyer'
                  return (
                    <div key={r.id} className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-charcoal text-sm">{reviewerName}</p>
                        <span className="inline-flex items-center gap-2">
                          <StarRating rating={r.rating} size="sm" />
                          <span className="text-[10px] text-gray-400">{formatDate(r.created_at)}</span>
                        </span>
                      </div>
                      <p className="text-[10px] text-green-600 font-semibold mt-1">✅ Verified buyer</p>
                      {r.review_text && (
                        <p className="text-sm text-gray-700 mt-2 leading-relaxed">{r.review_text}</p>
                      )}
                      {r.is_flagged && (
                        <p className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          🚩 Flagged for review
                        </p>
                      )}

                      {/* Response */}
                      {r.response ? (
                        <div className="mt-3 pl-3 border-l-2 border-gold/40">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold text-gold-dark uppercase tracking-widest">Your response</p>
                            {isWithinEditWindow(r.response.created_at) && (
                              <button
                                onClick={() => {
                                  setEditingResponse(editingResponse === r.id ? null : r.id)
                                  setEditingResponseText(r.response?.response_text || '')
                                }}
                                className="text-[10px] text-gray-500 hover:text-charcoal underline underline-offset-2"
                              >
                                {editingResponse === r.id ? 'Cancel' : '✏️ Edit'}
                              </button>
                            )}
                          </div>
                          {editingResponse === r.id ? (
                            <div className="mt-2">
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={editingResponseText}
                                onChange={(e) => setEditingResponseText(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm resize-none"
                              />
                              <button
                                onClick={() => submitResponseEdit(r.id)}
                                disabled={submittingReply}
                                className="mt-2 inline-flex items-center gap-1.5 bg-charcoal text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-black transition-colors disabled:opacity-50"
                              >
                                💾 Save
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{r.response.response_text}</p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3">
                          {replyingTo === r.id ? (
                            <div>
                              <textarea
                                rows={2}
                                maxLength={500}
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Thank the buyer and share anything useful..."
                                className="w-full px-3 py-2 rounded-xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-sm resize-none"
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  onClick={() => submitReply(r.id)}
                                  disabled={submittingReply}
                                  className="inline-flex items-center gap-1.5 bg-charcoal text-white px-4 py-2 rounded-full font-semibold text-xs hover:bg-black transition-colors disabled:opacity-50"
                                >
                                  💬 Post Reply
                                </button>
                                <button
                                  onClick={() => { setReplyingTo(null); setReplyText('') }}
                                  className="inline-flex items-center px-4 py-2 rounded-full font-semibold text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setReplyingTo(r.id); setReplyText('') }}
                              className="inline-flex items-center gap-1.5 bg-white text-charcoal px-4 py-2 rounded-full font-semibold text-xs border border-gray-200 hover:border-charcoal transition-colors"
                            >
                              💬 Reply
                            </button>
                          )}
                        </div>
                      )}

                      {/* Flag */}
                      {!r.is_flagged && (
                        <div className="mt-2">
                          {flaggingId === r.id ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={flagReason}
                                onChange={(e) => setFlagReason(e.target.value)}
                                placeholder="Why is this review suspicious?"
                                className="px-3 py-2 rounded-xl border-2 border-amber-300 text-charcoal focus:outline-none focus:border-amber-500 transition-colors text-xs w-56"
                              />
                              <button
                                onClick={() => submitFlag(r.id)}
                                disabled={submittingFlag}
                                className="inline-flex items-center gap-1 bg-amber-500 text-white px-3 py-2 rounded-full font-semibold text-xs hover:bg-amber-600 transition-colors disabled:opacity-50"
                              >
                                🚩 Flag
                              </button>
                              <button
                                onClick={() => { setFlaggingId(null); setFlagReason('') }}
                                className="text-xs text-gray-500 hover:text-charcoal px-2 py-2"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setFlaggingId(r.id); setFlagReason('') }}
                              className="text-[11px] text-gray-400 hover:text-amber-600 transition-colors underline underline-offset-2"
                            >
                              🚩 Flag this review
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MARK COMPLETED MODAL */}
      {completing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Complete booking">
          <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-full">
            <h3 className="text-xl font-bold text-charcoal mb-1">Complete this booking?</h3>
            <p className="text-sm text-gray-500 mb-5">{completing.listing?.title || 'Unknown listing'}</p>

            <label className="block text-sm font-bold text-charcoal mb-2 uppercase tracking-widest">
              Actual amount received (GH₵) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full px-5 py-3 rounded-2xl border-2 border-gray-200 text-charcoal focus:outline-none focus:border-gold transition-colors text-lg font-semibold"
              value={completeAmount}
              onChange={(e) => setCompleteAmount(e.target.value)}
              autoFocus
            />

            <label className="block text-sm font-bold text-charcoal mb-2 mt-4 uppercase tracking-widest">
              Notes <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Anything worth remembering about the session..."
              className="w-full px-5 py-3 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none"
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
            />

            <div className="flex gap-2 mt-6">
              <button
                onClick={confirmComplete}
                className="flex-1 bg-green-500 text-white py-3 rounded-full font-semibold hover:bg-green-600 transition-colors"
              >
                ✓ Confirm
              </button>
              <button
                onClick={() => setCompleting(null)}
                className="flex-1 bg-white text-charcoal py-3 rounded-full font-semibold border border-gray-200 hover:border-charcoal transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
