// Shared fetch + write helpers for the orders system.
//
// Tables: orders, order_events — created by supabase/add_orders.sql.
// All queries rely on RLS; failures surface as { error } like every other
// data module in this app.

import { supabase } from './supabase'

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'collecting'
  | 'out_for_delivery'
  | 'delivered'
  | 'confirmed'
  | 'cancelled'
  | 'disputed'
  | 'refunded'

export interface Order {
  id: string
  buyer_id: string | null
  buyer_whatsapp: string | null
  buyer_name: string | null
  seller_id: string
  listing_id: string | null
  kind: 'product' | 'service'
  amount: number
  // The lockdown migration rewrites legacy rows before this type is used.
  status: OrderStatus
  payment_method: 'prepaid' | 'pay_on_delivery' | null
  created_at: string
  updated_at: string
  completed_at: string | null
  scheduled_for: string | null
  listing?: { id: string; title: string | null } | null
  buyer?: { id: string; full_name: string | null } | null
  seller?: { id: string; full_name: string | null } | null
}

export interface OrderEvent {
  id: string
  order_id: string
  actor_id: string | null
  from_status: string | null
  to_status: string
  note: string | null
  created_at: string
  actor?: { full_name: string | null } | null
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** Orders where the user is buyer or seller, newest first. */
export async function getOrders(userId: string): Promise<Order[]> {
  const { data } = await supabase
    .from('orders')
    .select(
      '*, listing:listings!listing_id (id, title), buyer:profiles!buyer_id (id, full_name), seller:profiles!seller_id (id, full_name)'
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  return (data as Order[]) || []
}

/** A single order with its events, for the order detail page. */
export async function getOrderWithEvents(
  orderId: string,
  userId: string
): Promise<{ order: Order | null; events: OrderEvent[] }> {
  const { data: order } = await supabase
    .from('orders')
    .select(
      '*, listing:listings!listing_id (id, title), buyer:profiles!buyer_id (id, full_name), seller:profiles!seller_id (id, full_name)'
    )
    .eq('id', orderId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .maybeSingle()

  if (!order) return { order: null, events: [] }

  const { data: events } = await supabase
    .from('order_events')
    .select('*, actor:profiles!actor_id (full_name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  return {
    order: order as Order,
    events: (events as OrderEvent[]) || [],
  }
}

// ── Writes ────────────────────────────────────────────────────────────────

/** Create a product order through the locked-down RPC. Services use createServiceOrder. */
export async function createOrder(input: {
  listingId: string
  kind: 'product' | 'service'
  amount: number
  paymentMethod: 'prepaid'
}): Promise<{ id: string | null; error?: string }> {
  if (input.kind === 'service') {
    return { id: null, error: 'Service orders require an appointment and a linked booking.' }
  }

  const { data, error } = await supabase.rpc('create_product_order', {
    p_listing_id: input.listingId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
  })

  if (error) return { id: null, error: error.message }
  return { id: data as string | null }
}

/** Atomically create a service order and its linked booking, then collect MoMo at checkout. */
export async function createServiceOrder(input: {
  listingId: string
  scheduledFor: string
  notes?: string
}): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase.rpc('create_service_order', {
    p_listing_id: input.listingId,
    p_scheduled_for: input.scheduledFor,
    p_notes: input.notes?.trim() || null,
  })

  if (error) return { id: null, error: error.message }
  return { id: data as string | null }
}

/**
 * Advance an order's status via the SECURITY DEFINER advance_order() function,
 * which enforces allowed transitions per role (buyer vs seller).
 */
export async function advanceOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  note?: string
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('advance_order', {
    p_order_id: orderId,
    p_to_status: toStatus,
    p_note: note || null,
  })
  if (error) return { error: error.message }
  return {}
}

/** Human-readable status label, with service-specific fulfillment language. */
export function orderStatusLabel(status: string, kind: Order['kind'] = 'product'): string {
  if (kind === 'service' && status === 'paid') return 'Booking confirmed'
  if (kind === 'service' && status === 'delivered') return 'Service delivered'

  const labels: Record<string, string> = {
    awaiting_payment: 'Awaiting payment',
    paid: 'Paid',
    collecting: 'Collecting',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    disputed: 'Disputed',
    refunded: 'Refunded',
  }
  return labels[status] ?? status
}

/** Action-oriented button label; timeline/chips continue to use orderStatusLabel. */
export function orderActionLabel(status: string, kind: Order['kind'] = 'product'): string {
  if (status === 'confirmed') {
    return kind === 'service' ? 'Confirm service' : 'Confirm delivery'
  }
  if (status === 'cancelled') return kind === 'service' ? 'Cancel booking' : 'Cancel order'
  return orderStatusLabel(status, kind)
}

/** Whether the given user (buyer or seller) can advance this order to the given status.
 *  Set hasOpenDispute to true when a dispute with status = 'open' exists for
 *  this order — all status transitions are then blocked. */
export function canAdvance(
  order: Order,
  userId: string,
  toStatus: OrderStatus,
  hasOpenDispute = false
): boolean {
  if (hasOpenDispute) return false
  const isSeller = order.seller_id === userId
  const isBuyer = order.buyer_id === userId && order.buyer_id !== null
  if (!isSeller && !isBuyer) return false
  if (['confirmed', 'cancelled', 'disputed', 'refunded'].includes(order.status)) return false
  if (order.status === toStatus) return false

  if (isSeller) {
    if (order.status === 'paid') return toStatus === 'collecting' || toStatus === 'cancelled'
    if (order.status === 'collecting') return toStatus === 'out_for_delivery'
    if (order.status === 'out_for_delivery') return toStatus === 'delivered'
    if (order.status === 'delivered') return toStatus === 'disputed'
    return order.status === 'awaiting_payment' && toStatus === 'cancelled'
  }

  if (order.status === 'delivered') {
    return toStatus === 'confirmed' || toStatus === 'disputed'
  }
  return (
    (order.status === 'awaiting_payment' || order.status === 'paid') &&
    toStatus === 'cancelled'
  )
}

/** Check whether an order has an open dispute (client-side guard mirroring the DB). */
export async function hasOpenDispute(orderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('disputes')
    .select('id')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) return false
  return !!data
}
