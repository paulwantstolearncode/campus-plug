// Shared fetch + write helpers for the chat system.
//
// Tables: conversations, chat_messages — created by supabase/add_chat.sql.
// All queries rely on RLS; failures surface as { error } like every other
// data module in this app. Phone numbers are never returned by these helpers;
// they live on profiles and are only revealed via the contact-reveal flow.

import { supabase } from './supabase'

export interface Conversation {
  id: string
  listing_id: string | null
  buyer_id: string
  seller_id: string
  created_at: string
  last_message_at: string
  updated_at: string
  contact_revealed_at: string | null
  unread_count: number
  buyer?: { id: string; full_name: string | null } | null
  seller?: { id: string; full_name: string | null } | null
  listing?: { id: string; title: string | null } | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

type ProfileLite = { id: string; full_name: string | null }

/**
 * Fetch display profiles for a set of user ids.
 *
 * conversations.buyer_id / seller_id (and chat_messages.sender_id) reference
 * auth.users, not public.profiles, so PostgREST cannot embed profiles in those
 * queries — it rejects them with PGRST200 "Could not find a relationship".
 * Names are fetched in a second, id-filtered query instead.
 */
async function getProfiles(ids: string[]): Promise<Record<string, ProfileLite>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique)

  if (error) {
    console.error('Failed to load conversation profiles:', error)
    return {}
  }

  const map: Record<string, ProfileLite> = {}
  for (const p of (data as ProfileLite[]) || []) {
    map[p.id] = p
  }
  return map
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** All conversations the user participates in, newest last_message first. */
export async function getConversations(userId: string): Promise<Conversation[]> {
  const [convResult, unreadResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('*, listing:listings!listing_id (id, title)')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('last_message_at', { ascending: false }),
    supabase
      .from('chat_messages')
      .select('conversation_id')
      .is('read_at', null)
      .neq('sender_id', userId),
  ])

  const conversations = (convResult.data as Conversation[]) || []

  // Count unread messages per conversation.
  const unreadMap: Record<string, number> = {}
  for (const m of (unreadResult.data as { conversation_id: string }[]) || []) {
    unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1
  }

  const profiles = await getProfiles(
    conversations.flatMap((c) => [c.buyer_id, c.seller_id])
  )

  return conversations.map((c) => ({
    ...c,
    buyer: profiles[c.buyer_id] || null,
    seller: profiles[c.seller_id] || null,
    unread_count: unreadMap[c.id] || 0,
  }))
}

/** All messages in a conversation, oldest first. Returns empty array on error. */
export async function getMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to load messages:', error)
    return []
  }

  return (data as ChatMessage[]) || []
}

/** A single conversation with its participants (for the thread header). */
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*, listing:listings!listing_id (id, title)')
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load conversation:', error)
    return null
  }
  if (!data) return null

  const conv = data as Conversation
  const profiles = await getProfiles([conv.buyer_id, conv.seller_id])
  return {
    ...conv,
    buyer: profiles[conv.buyer_id] || null,
    seller: profiles[conv.seller_id] || null,
  }
}

/**
 * Total unread messages across all of the user's conversations.
 *
 * RLS on chat_messages already restricts rows to conversations the user takes
 * part in, so a single head-count is enough — no conversation-id list needed.
 */
export async function getTotalUnread(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .neq('sender_id', userId)

  if (error) return 0
  return count || 0
}

// ── Writes ────────────────────────────────────────────────────────────────

/** Get an existing conversation between buyer and seller for a listing, or create one. */
export async function getOrCreateConversation(input: {
  buyerId: string
  sellerId: string
  listingId: string | null
}): Promise<{ id: string | null; error?: string }> {
  if (input.buyerId === input.sellerId) {
    return { id: null, error: 'Cannot start a conversation with yourself.' }
  }

  // Try to find an existing conversation.
  const match = input.listingId
    ? await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', input.listingId)
        .eq('buyer_id', input.buyerId)
        .eq('seller_id', input.sellerId)
        .maybeSingle()
    : await supabase
        .from('conversations')
        .select('id')
        .is('listing_id', null)
        .eq('buyer_id', input.buyerId)
        .eq('seller_id', input.sellerId)
        .maybeSingle()

  if (match.error) {
    return { id: null, error: match.error.message }
  }
  if (match.data) {
    return { id: (match.data as { id: string }).id }
  }

  // Also check the reverse direction (buyer/seller swapped) for listing-less
  // conversations — a user might be the seller in one row and buyer in another.
  if (!input.listingId) {
    const reverse = await supabase
      .from('conversations')
      .select('id')
      .is('listing_id', null)
      .eq('buyer_id', input.sellerId)
      .eq('seller_id', input.buyerId)
      .maybeSingle()
    if (!reverse.error && reverse.data) {
      return { id: (reverse.data as { id: string }).id }
    }
  }

  // Create it.
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: input.listingId || null,
      buyer_id: input.buyerId,
      seller_id: input.sellerId,
    })
    .select('id')
    .single()

  if (error) {
    return { id: null, error: error.message }
  }
  return { id: (data as { id: string }).id }
}

/** Send a message. RLS enforces that sender_id = auth.uid() and the sender is
 *  a participant of the conversation. Returns the saved row so the UI can swap
 *  its optimistic bubble for the real one. */
export async function sendMessage(input: {
  conversationId: string
  senderId: string
  content: string
}): Promise<{ message?: ChatMessage; error?: string }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      content: input.content.trim(),
    })
    .select('*')
    .single()

  if (error) return { error: error.message }
  return { message: data as ChatMessage }
}

/** Mark all unread messages in a conversation as read for the given user. */
export async function markMessagesRead(input: {
  conversationId: string
  userId: string
}): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', input.conversationId)
    .neq('sender_id', input.userId)
    .is('read_at', null)
  if (error) return { error: error.message }
  return {}
}

// ── Live updates ──────────────────────────────────────────────────────────

type Unsubscribe = () => void

/**
 * Subscribe to inserts/updates on one conversation's messages.
 * Requires chat_messages in the realtime publication
 * (supabase/enable_chat_realtime.sql); RLS limits delivered rows to
 * participants. Always returns a cleanup function.
 */
export function subscribeToConversationMessages(
  conversationId: string,
  onChange: () => void
): Unsubscribe {
  const channel = supabase
    .channel(`chat_messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onChange()
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Subscribe to new messages in any thread the user participates in (inbox and
 * unread badge). RLS means only the user's own conversations are delivered.
 */
export function subscribeToInbox(
  userId: string,
  onChange: () => void
): Unsubscribe {
  const channel = supabase
    .channel(`chat_inbox:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      () => onChange()
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Touch a conversation's last_message_at (called after a send succeeds). */
export async function touchConversation(conversationId: string): Promise<void> {
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId)
}
