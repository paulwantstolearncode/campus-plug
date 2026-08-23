import { supabase } from './supabase'
import { createNotification } from './notifications'

export interface Feedback {
  id: string
  user_id: string | null
  email: string | null
  rating: number | null
  category: 'bug' | 'feature' | 'general' | 'complaint'
  message: string
  is_read: boolean
  created_at: string
}

export interface FeedbackWithProfile extends Feedback {
  profiles?: { full_name: string | null } | null
}

export async function submitFeedback(input: {
  userId?: string | null
  email?: string | null
  rating?: number | null
  category: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('feedback').insert({
    user_id: input.userId || null,
    email: input.email || null,
    rating: input.rating || null,
    category: input.category,
    message: input.message.trim(),
  })
  if (error) return { success: false, error: error.message }

  // Notify admins about new feedback (fire-and-forget)
  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_admin', true)

    if (admins && admins.length > 0) {
      const categoryLabel = input.category.charAt(0).toUpperCase() + input.category.slice(1)
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          title: `New ${categoryLabel} Feedback`,
          message: input.message.slice(0, 120) + (input.message.length > 120 ? '...' : ''),
          link: '/admin/feedback',
        })
      }
    }
  } catch (err) {
    console.error('Failed to notify admins of feedback:', err)
  }

  return { success: true }
}

export async function getAllFeedback(opts?: {
  filterCategory?: string
  filterUnreadOnly?: boolean
}): Promise<FeedbackWithProfile[]> {
  let query = supabase
    .from('feedback')
    .select('*, profiles:user_id (full_name)')
    .order('created_at', { ascending: false })

  if (opts?.filterCategory && opts.filterCategory !== 'all') {
    query = query.eq('category', opts.filterCategory)
  }
  if (opts?.filterUnreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to load feedback:', error)
    return []
  }
  return (data as FeedbackWithProfile[]) || []
}

export async function markFeedbackAsRead(
  feedbackId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('feedback')
    .update({ is_read: true })
    .eq('id', feedbackId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function deleteFeedback(
  feedbackId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('feedback')
    .delete()
    .eq('id', feedbackId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
