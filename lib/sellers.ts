import { supabase } from './supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export interface SellerProfile {
  id: string
  full_name: string | null
  whatsapp_number: string | null
  is_seller: boolean
  campus_location: string | null
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
 * Fetch seller profile + all approved listings + rating by profile ID.
 * Server-side only (uses cookie-based Supabase client).
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, whatsapp_number, is_seller, campus_location')
      .eq('id', sellerId)
      .eq('is_seller', true)
      .single()

    if (profileError || !profile) return null

    // Fetch approved listings
    const { data: listings } = await supabase
      .from('listings')
      .select('*, listing_images (id, image_url, display_order), listing_items (price)')
      .eq('seller_id', sellerId)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })

    // Fetch rating
    const { data: rating } = await supabase
      .from('seller_ratings')
      .select('average_rating, review_count, is_top_rated')
      .eq('seller_id', sellerId)
      .maybeSingle()

    return {
      ...(profile as SellerProfile),
      listings: (listings || []) as SellerWithListings['listings'],
      rating: rating || null,
    }
  } catch (err) {
    console.error('Failed to fetch seller:', err)
    return null
  }
}
