'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import StarRating from '@/app/StarRating'
import { createReview, updateReview, deleteReview, getReviewById } from '@/lib/reviews'

const REVIEW_TEXT_MAX = 500
const REVIEW_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function NewReviewInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const bookingId = searchParams.get('bookingId')
  const saleId = searchParams.get('saleId')
  const sellerId = searchParams.get('sellerId')
  const reviewId = searchParams.get('reviewId')

  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [listingHref, setListingHref] = useState<string | null>(null)
  const [anchorLabel, setAnchorLabel] = useState<string>('this transaction')
  const [editing, setEditing] = useState(false)
  const [editWindowExpired, setEditWindowExpired] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        // ── EDIT MODE: load the existing review ──
        if (reviewId) {
          const { data, error } = await getReviewById(reviewId)
          if (error || !data) {
            setError('Review not found')
            setLoading(false)
            return
          }
          setEditing(true)
          setRating(data.rating)
          setText(data.review_text || '')
          const listing =
            (data.booking && data.booking.listing) || (data.sale && data.sale.listing)
          if (listing) setListingHref('/listing/' + listing.id)

          const created = new Date(data.created_at).getTime()
          setEditWindowExpired(Date.now() - created > REVIEW_EDIT_WINDOW_MS)
          setLoading(false)
          return
        }

        // ── CREATE MODE: need a seller + exactly one transaction anchor ──
        if (!sellerId || (!bookingId && !saleId) || (bookingId && saleId)) {
          setError('Missing booking or sale reference. Open this page from your booking or a listing.')
          setLoading(false)
          return
        }

        // Booking path: RLS only exposes the caller's own bookings, so a
        // stranger simply gets no row ("not found").
        if (bookingId) {
          const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*, listing:listings!listing_id (id, title, seller_id)')
            .eq('id', bookingId)
            .single()

          if (bookingError || !booking) {
            setError("We couldn't find this booking for your account.")
            setLoading(false)
            return
          }
          if (booking.listing?.seller_id !== sellerId) {
            setError("This booking doesn't match the seller you're reviewing.")
            setLoading(false)
            return
          }
          if (booking.status !== 'completed') {
            setError("This booking hasn't been completed yet — reviews are for finished transactions.")
            setLoading(false)
            return
          }
          if (booking.listing) setListingHref('/listing/' + booking.listing.id)
          setAnchorLabel(booking.listing?.title ? 'your booking for "' + booking.listing.title + '"' : 'your booking')
          setLoading(false)
          return
        }

        // Sale path: RLS only exposes completed sales recorded against the
        // current user's WhatsApp number.
        if (saleId) {
          const { data: sale, error: saleError } = await supabase
            .from('sales')
            .select('*, listing:listings!listing_id (id, title, seller_id)')
            .eq('id', saleId)
            .single()

          if (saleError || !sale) {
            setError("We couldn't find this purchase for your account.")
            setLoading(false)
            return
          }
          if (sale.listing?.seller_id !== sellerId) {
            setError("This purchase doesn't match the seller you're reviewing.")
            setLoading(false)
            return
          }
          if (sale.status !== 'completed') {
            setError("This purchase hasn't been completed yet — reviews are for finished transactions.")
            setLoading(false)
            return
          }
          if (sale.listing) setListingHref('/listing/' + sale.listing.id)
          setAnchorLabel(sale.listing?.title ? 'your purchase from &quot;' + sale.listing.title + '&quot;' : 'your purchase')
          setLoading(false)
        }
      } catch (err) {
        console.error('Review form load failed:', err)
        setError('Something went wrong. Please try again.')
        setLoading(false)
      }
    }

    load()
  }, [reviewId, bookingId, saleId, sellerId, router])

  const handleSubmit = async () => {
    setFormError(null)
    if (rating < 1) {
      setFormError('Please select a star rating')
      return
    }

    setSubmitting(true)
    try {
      if (editing && reviewId) {
        if (editWindowExpired) {
          setFormError('Your 7-day edit window has expired. You can still delete the review.')
          setSubmitting(false)
          return
        }
        const { error } = await updateReview(reviewId, rating, text)
        if (error) {
          setFormError(error.message)
          setSubmitting(false)
          return
        }
      } else {
        if (!sellerId) {
          setFormError('Missing seller reference')
          setSubmitting(false)
          return
        }
        const { error } = await createReview({
          sellerId,
          bookingId,
          saleId,
          rating,
          reviewText: text,
        })
        if (error) {
          setFormError(error.message)
          setSubmitting(false)
          return
        }
      }
      router.push(listingHref || '/')
    } catch (err) {
      console.error('Review submit failed:', err)
      setFormError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!reviewId) return
    if (!confirm('Delete your review? This cannot be undone.')) return
    setDeleting(true)
    const { error } = await deleteReview(reviewId)
    if (error) {
      alert('Could not delete the review: ' + error.message)
      setDeleting(false)
      return
    }
    router.push(listingHref || '/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">⭐</div>
          <p className="text-white/70">Loading review...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-charcoal">
      <nav className="fixed top-0 w-full z-50 bg-charcoal/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl group-hover:rotate-12 transition-transform">🔌</span>
            <span className="text-lg sm:text-xl font-bold text-white tracking-tight">Campus Plug</span>
          </Link>
          <button
            onClick={() => router.back()}
            className="text-sm text-white/60 hover:text-white transition-colors flex items-center gap-1 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            Cancel
          </button>
        </div>
      </nav>

      <section className="relative pt-28 pb-16 md:pt-36 overflow-hidden animated-gradient">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="blob absolute top-10 -left-20 w-96 h-96 bg-gold/30 rounded-full blur-3xl"></div>
          <div className="blob absolute top-20 right-0 w-96 h-96 bg-ochre/20 rounded-full blur-3xl" style={{ animationDelay: '5s' }}></div>
        </div>
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-4xl mb-3">⭐</div>
          <h1 className="fade-up fade-up-delay-1 text-3xl md:text-5xl font-bold text-white leading-tight tracking-tight">
            {editing ? 'Edit your review' : 'Review this seller'}
          </h1>
          <p className="fade-up fade-up-delay-2 text-white/70 mt-3 max-w-lg">
            {editing
              ? 'You can edit your review within 7 days of posting.'
              : 'You&apos;re reviewing ' + anchorLabel + '. Only verified buyers can leave reviews — every review is checked against a real completed transaction.'}
          </p>
        </div>
      </section>

      <section className="relative pb-24 bg-off-white -mt-6">
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-8">
          {error ? (
            <div className="bg-white rounded-3xl p-10 text-center shadow-xl border border-gray-100">
              <div className="text-5xl mb-4">🤔</div>
              <p className="text-xl font-bold text-charcoal mb-2">Can&apos;t open this review</p>
              <p className="text-gray-500 mb-6">{error}</p>
              <Link href="/" className="inline-flex items-center gap-2 bg-charcoal text-white px-6 py-3 rounded-full font-semibold hover:bg-black transition-colors">
                ← Back to marketplace
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100">
              {editWindowExpired && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
                  ⏰ Your 7-day edit window has expired — this review is locked. You can still delete it.
                </div>
              )}

              <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-3">
                Your rating *
              </label>
              <StarRating rating={rating} interactive onChange={setRating} size="lg" />
              {rating > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {rating === 5 ? 'Excellent!' : rating === 4 ? 'Great' : rating === 3 ? 'Average' : rating === 2 ? 'Poor' : 'Very poor'}
                </p>
              )}

              <label className="block text-xs font-bold text-charcoal uppercase tracking-widest mb-2 mt-7">
                Your review <span className="text-gray-400 font-normal normal-case">(optional)</span>
              </label>
              <div className="relative">
                <textarea
                  rows={5}
                  maxLength={REVIEW_TEXT_MAX}
                  placeholder="How was your experience? Be fair and specific — this helps other buyers on campus..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={editWindowExpired}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-gold transition-colors resize-none disabled:bg-gray-50 disabled:text-gray-500"
                />
                <span className="absolute bottom-3 right-4 text-[10px] text-gray-400 font-semibold">
                  {text.length}/{REVIEW_TEXT_MAX}
                </span>
              </div>

              {formError && (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-red-500 font-medium">
                  <span>⚠️</span> {formError}
                </p>
              )}

              <div className="flex gap-3 mt-7">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || editWindowExpired}
                  className="flex-1 bg-charcoal text-white py-3.5 rounded-full font-bold hover:bg-black transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-charcoal/25"
                >
                  {submitting ? 'Saving...' : editing ? '💾 Save Changes' : '⭐ Submit Review'}
                </button>
                {editing && reviewId && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-6 py-3.5 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {deleting ? '...' : '🗑 Delete'}
                  </button>
                )}
              </div>

              <p className="text-[11px] text-gray-400 mt-4 text-center">
                🔒 All reviews are verified against a completed booking or sale. You can edit within 7 days, delete anytime.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default function NewReviewPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen animated-gradient">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-pulse">⭐</div>
          <p className="text-white/70">Loading review...</p>
        </div>
      </div>
    }>
      <NewReviewInner />
    </Suspense>
  )
}
