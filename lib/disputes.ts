// Shared helpers for the disputes system.
//
// Tables: disputes, dispute_messages — created by supabase/add_marketplace_disputes.sql.
// Dispute creation uses open_order_dispute() so its order-status transition is
// validated and committed atomically. Messages continue to rely on RLS.

import { supabase } from './supabase'

export interface Dispute {
  id: string
  order_id: string
  opened_by: string
  reason: string
  status: 'open' | 'resolved' | 'closed'
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

/**
 * Open a dispute for an order. Returns the new dispute id (so the caller can
 * route straight to its detail page) or an error message.
 *
 * One dispute per order is enforced by the UNIQUE(order_id) constraint and the
 * order lock in the RPC; an existing case id is returned for recovery navigation.
 */
export async function openDispute(input: {
  orderId: string
  reason: string
}): Promise<{ id: string | null; error?: string }> {
  const reason = input.reason.trim()
  // Mirror the DB CHECK (char_length BETWEEN 5 AND 500) so the user gets a
  // clear message before we hit the trigger.
  if (reason.length < 5) {
    return { id: null, error: 'Please describe the issue in at least a few words.' }
  }
  if (reason.length > 500) {
    return { id: null, error: 'Please keep the description under 500 characters.' }
  }

  // The RPC locks the order and atomically creates the dispute plus the
  // delivered -> disputed transition. Cancelled orders stay cancelled but can
  // still open a recovery case. Direct dispute insertion is revoked.
  const { data, error } = await supabase.rpc('open_order_dispute', {
    p_order_id: input.orderId,
    p_reason: reason,
  })

  if (error) return { id: null, error: error.message }
  return { id: data as string | null }
}
