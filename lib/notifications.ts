import { supabase } from '@/lib/supabase'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  link: string | null
  is_read: boolean
  created_at: string
}

/**
 * Fetch recent notifications for the logged-in user, newest first.
 */
export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Failed to load notifications:', error)
    return []
  }

  return (data || []) as Notification[]
}

/**
 * Return count of unread notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    console.error('Failed to count notifications:', error)
    return 0
  }

  return count || 0
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Mark all notifications for a user as read.
 */
export async function markAllAsRead(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Create a notification row for a user.
 * Used by system events (new request posted, feedback response, etc.)
 */
export async function createNotification(input: {
  userId: string
  title: string
  message: string
  link?: string
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    title: input.title.trim(),
    message: input.message.trim(),
    link: input.link || null,
  })

  if (error) {
    console.error('Failed to create notification:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Broadcast a notification to multiple users at once.
 * Used for system-wide events (e.g. new Wanted Board request in a category).
 */
export async function broadcastNotification(
  userIds: string[],
  title: string,
  message: string,
  link?: string
): Promise<{ success: boolean; error?: string }> {
  if (userIds.length === 0) return { success: true }

  const rows = userIds.map((userId) => ({
    user_id: userId,
    title: title.trim(),
    message: message.trim(),
    link: link || null,
  }))

  const { error } = await supabase.from('notifications').insert(rows)

  if (error) {
    console.error('Failed to broadcast notifications:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
