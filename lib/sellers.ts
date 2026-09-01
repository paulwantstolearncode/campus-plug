import { supabase } from './supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export interface SellerProfile {
  id: string
  full_name: string | null
  whatsapp_number: string | null
  campus_location: string | null
  avatar_url: string | null
}

export interface SellerWithListings extends SellerProfile {
  listings: {
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
    sold_at: string | null
    last_activity_at: string | null
    seller_id: string
    listing_images: { id: string; image_url: string; display_order: number }[] | null
    listing_items: { price: number }[] | null
  }[]
  rating: {
    average_rating: number | null
    review_count: number
    is_top_rated: boolean
  } | null
}

/**
 * Fetch seller profile + all approved listings + rating.
 * Looks up strictly by profile id. If no profile row exists but approved
 * listings do, a minimal fallback profile is constructed so the shop page
 * still renders. Server-side only (cookie-based Supabase client).
 */
export async function getSellerWithListings(
  sellerId: string
): Promise<SellerWithListings | null> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      }
    )

    const trimmedId = typeof sellerId === 'string' ? sellerId.trim() : ''
    if (!trimmedId) return null

    // Query strictly by id — no is_seller or seller_status filters.
    // If the user has listings, they are a seller regardless of profile flags.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, whatsapp_number, campus_location, avatar_url')
      .eq('id', trimmedId)
      .maybeSingle()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
    }

    // Fetch approved listings
    const { data: listings } = await supabase
      .from('listings')
      .select('*, listing_images (id, image_url, display_order), listing_items (price)')
      .eq('seller_id', trimmedId)
      .eq('approval_status', 'approved')
      .is('deleted_at', null)
      .is('sold_at', null)
      .order('created_at', { ascending: false })

    const approvedListings = (listings || []) as SellerWithListings['listings']

    // If no profile AND no listings, seller genuinely doesn't exist
    if (!profile && approvedListings.length === 0) return null

    // Fetch rating
    const { data: rating } = await supabase
      .from('seller_ratings')
      .select('average_rating, review_count, is_top_rated')
      .eq('seller_id', trimmedId)
      .maybeSingle()

    // Build a minimal profile if the row is missing (RLS, deleted account, etc.)
    const fallbackProfile: SellerProfile = {
      id: trimmedId,
      full_name: null,
      whatsapp_number: null,
      campus_location: null,
      avatar_url: null,
    }

    return {
      ...(profile ?? fallbackProfile),
      listings: approvedListings,
      rating: rating || null,
    }
  } catch (err) {
    console.error('Failed to fetch seller:', err)
    return null
  }
}
