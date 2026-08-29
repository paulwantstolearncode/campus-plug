import { supabase } from '@/lib/supabase'

/**
 * Log an analytics event (listing view or WhatsApp click).
 * Fire-and-forget: never blocks the UI. Falls back to console.error on failure.
 */
export async function logAnalyticsEvent(
  eventType: 'listing_view' | 'whatsapp_click',
  listingId: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()

    // Insert the event row (RLS allows anonymous inserts).
    await supabase.from('analytics_events').insert({
      event_type: eventType,
      listing_id: listingId,
      user_id: user?.id || null,
      metadata: metadata || {},
    })

    // Increment the denormalized counter on the listing.
    await supabase.rpc('increment_listing_counter', {
      p_listing_id: listingId,
      p_counter: eventType === 'listing_view' ? 'view_count' : 'whatsapp_click_count',
    })
  } catch (err) {
    console.error('Analytics event failed:', err)
  }
}

/**
 * Fetch analytics summary for a seller's listings.
 * Returns per-listing stats: views, clicks, and conversion rate.
 */
export interface ListingAnalytics {
  id: string
  title: string
  views: number
  clicks: number
  conversion: string
}

export async function getSellerAnalytics(sellerId: string): Promise<ListingAnalytics[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, view_count, whatsapp_click_count, created_at')
    .eq('seller_id', sellerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load seller analytics:', error)
    return []
  }

  return (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    views: row.view_count || 0,
    clicks: row.whatsapp_click_count || 0,
    conversion: row.view_count > 0
      ? ((row.whatsapp_click_count / row.view_count) * 100).toFixed(1)
      : '0.0',
  }))
}
