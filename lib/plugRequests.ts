import { supabase } from '@/lib/supabase'

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

  return { success: true }
}
