import { supabase } from '@/lib/supabase'
import { broadcastNotification } from '@/lib/notifications'

export interface PlugRequest {
  id: string
  title: string
  description: string | null
  budget: number | null
  category: string | null
  campus_location: string | null
  whatsapp_number: string | null
  status: 'open' | 'fulfilled'
  user_id: string
  created_at: string
}

/** Fetch open plug requests, newest first. */
export async function getPlugRequests(): Promise<PlugRequest[]> {
  const { data, error } = await supabase
    .from('plug_requests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to load plug requests:', error)
    return []
  }

  return (data || []) as PlugRequest[]
}

/** Create a new plug request. */
export async function createPlugRequest(request: {
  title: string
  description?: string
  budget?: number
  category?: string
  campus_location?: string
  whatsapp_number?: string
}): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'You must be logged in to post a request.' }
  }

  const { error } = await supabase
    .from('plug_requests')
    .insert({
      user_id: user.id,
      title: request.title.trim(),
      description: request.description?.trim() || null,
      budget: request.budget || null,
      category: request.category || null,
      campus_location: request.campus_location || null,
      whatsapp_number: request.whatsapp_number?.trim() || null,
      status: 'open',
    })

  if (error) {
    console.error('Failed to create plug request:', error)
    return { success: false, error: error.message }
  }

  // Notify sellers in the same category (fire-and-forget)
  try {
    const { data: sellers } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_seller', true)
      .neq('id', user.id)

    if (sellers && sellers.length > 0) {
      const sellerIds = sellers.map((s) => s.id)
      await broadcastNotification(
        sellerIds,
        'New Wanted Board Request',
        `Someone is looking for "${request.title.trim()}" on the Wanted Board${request.budget ? ` (GH₵ ${request.budget})` : ''}.`,
        '/requests'
      )
    }
  } catch (err) {
    // Notification failure must never block request creation
    console.error('Failed to send plug request notifications:', err)
  }

  return { success: true }
}

/** Mark a plug request as fulfilled/closed (owner only). */
export async function closePlugRequest(id: string): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'You must be logged in.' }
  }

  const { error } = await supabase
    .from('plug_requests')
    .update({ status: 'fulfilled' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('Failed to close plug request:', error)
    return { success: false, error: error.message }
  }

  // Notify the requester that their request was fulfilled (fire-and-forget)
  try {
    const { createNotification } = await import('@/lib/notifications')
    await createNotification({
      userId: user.id,
      title: 'Request Fulfilled',
      message: 'Your Wanted Board request has been marked as fulfilled.',
      link: '/requests',
    })
  } catch (err) {
    console.error('Failed to send fulfillment notification:', err)
  }

  return { success: true }
}
