// Shared fetch + write helpers for the reviews system.
//
// Tables: reviews, review_responses, seller_ratings (view) — created by
// supabase/add_reviews_system.sql. All queries rely on RLS; failures surface
// as { error } like every other data module in this app. Reviewer identities
// are filtered by RLS for privacy — when a profile row isn't visible the
// caller should fall back to "Verified Buyer" (see the pages that render
// reviews).

import { supabase } from './supabase'

export interface SellerRating {
  seller_id: string
  review_count: number
  average_rating: number | null
  five_star: number
  four_star: number
  three_star: number
  two_star: number
  one_star: number
  is_top_rated: boolean
}

export interface ReviewWithResponse {
  id: string
  seller_id: string
  reviewer_id: string | null
  booking_id: string | null
  sale_id: string | null
  rating: number
  review_text: string | null
  is_flagged: boolean
  flagged_reason: string | null
  is_hidden: boolean
  created_at: string
  updated_at: string
  reviewer?: { full_name: string | null } | null
  seller?: { full_name: string | null } | null
  response?: {
    id: string
    response_text: string
    created_at: string
    updated_at: string
  } | null
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getSellerRating(sellerId: string): Promise<SellerRating | null> {
  const { data } = await supabase
    .from('seller_ratings')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle()
  return (data as SellerRating) || null
}

// Batch ratings for a set of sellers (homepage / services cards).
export async function getSellerRatings(
  sellerIds: string[]
): Promise<Record<string, SellerRating>> {
  const map: Record<string, SellerRating> = {}
  const ids = [...new Set(sellerIds.filter(Boolean))]
  if (ids.length === 0) return map
  const { data } = await supabase.from('seller_ratings').select('*').in('seller_id', ids)
  if (data) {
    for (const row of data as SellerRating[]) map[row.seller_id] = row
  }
  return map
}

export async function getSellerReviews(
  sellerId: string,
  limit = 50
): Promise<ReviewWithResponse[]> {
  const { data } = await supabase
    .from('reviews')
    .select(
      '*, reviewer:profiles!reviewer_id (full_name), response:review_responses (response_text, created_at, updated_at)'
    )
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as ReviewWithResponse[]) || []
}

// The current user's review of a specific seller (newest first, at most one
// returned). Returns null when the user hasn't reviewed this seller.
export async function getMyReviewForSeller(
  sellerId: string,
  userId: string
): Promise<ReviewWithResponse | null> {
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
  return (data && data[0]) as ReviewWithResponse | null
}

// Full review + its transaction's listing, used by the review form for the
// post-submit redirect (falls back to '/' when the anchor is gone).
export async function getReviewById(reviewId: string) {
  return supabase
    .from('reviews')
    .select(
      '*, booking:bookings!booking_id (listing:listings!listing_id (id, title)), sale:sales!sale_id (listing:listings!listing_id (id, title))'
    )
    .eq('id', reviewId)
    .single()
}

// ── Writes ────────────────────────────────────────────────────────────────

export async function createReview(input: {
  sellerId: string
  bookingId?: string | null
  saleId?: string | null
  rating: number
  reviewText: string
}) {
  return supabase
    .from('reviews')
    .insert({
      seller_id: input.sellerId,
      booking_id: input.bookingId || null,
      sale_id: input.saleId || null,
      rating: input.rating,
      review_text: input.reviewText.trim() || null,
    })
    .select()
    .single()
}

export async function updateReview(reviewId: string, rating: number, reviewText: string) {
  return supabase
    .from('reviews')
    .update({ rating, review_text: reviewText.trim() || null })
    .eq('id', reviewId)
    .select()
    .single()
}

export async function deleteReview(reviewId: string) {
  return supabase.from('reviews').delete().eq('id', reviewId)
}

// Sellers: flag a review about them for admin moderation. One-way — only the
// admin can dismiss a flag (enforced by the DB trigger).
export async function flagReview(reviewId: string, reason: string) {
  return supabase
    .from('reviews')
    .update({ is_flagged: true, flagged_reason: reason.trim() || null })
    .eq('id', reviewId)
}

// Admin moderation actions.
export async function dismissFlag(reviewId: string) {
  return supabase.from('reviews').update({ is_flagged: false, flagged_reason: null }).eq('id', reviewId)
}

export async function hideReview(reviewId: string) {
  return supabase.from('reviews').update({ is_hidden: true }).eq('id', reviewId)
}

// Sellers: one public reply per review (UNIQUE review_id on review_responses
// enforces the "one" part at the DB level).
export async function createResponse(reviewId: string, sellerId: string, text: string) {
  return supabase
    .from('review_responses')
    .insert({ review_id: reviewId, seller_id: sellerId, response_text: text.trim() })
    .select()
    .single()
}

export async function updateResponse(responseId: string, text: string) {
  return supabase
    .from('review_responses')
    .update({ response_text: text.trim() })
    .eq('id', responseId)
    .select()
    .single()
}
