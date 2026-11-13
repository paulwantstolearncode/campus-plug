// Shared fetch + write helpers for the orders system.
//
// Tables: orders, order_events — created by supabase/add_orders.sql.
// All queries rely on RLS; failures surface as { error } like every other
// data module in this app.

import { supabase } from './supabase'

export interface Order {
  id: string
  buyer_id: string | null
  buyer_whatsapp: string | null
  buyer_name: string | null
  seller_id: string
  listing_id: string | null
  kind: 'product' | 'service'
  amount: number
  status: 'confirmed' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'complete' | 'cancelled'
  payment_method: 'prepaid' | 'pay_on_delivery' | null
  created_at: string
  updated_at: string
  completed_at: string | null
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

/** Create a new order (confirmed by default). Returns the order or an error. */
export async function createOrder(input: {
  buyerId: string | null
  buyerWhatsapp: string | null
  buyerName: string | null
  sellerId: string
  listingId: string | null
  kind: 'product' | 'service'
  amount: number
  paymentMethod: 'prepaid' | 'pay_on_delivery' | null
}): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      buyer_id: input.buyerId,
      buyer_whatsapp: input.buyerWhatsapp,
      buyer_name: input.buyerName,
      seller_id: input.sellerId,
      listing_id: input.listingId,
      kind: input.kind,
      amount: input.amount,
      status: 'confirmed',
      payment_method: input.paymentMethod,
    })
    .select('id')
    .single()

  if (error) {
    return { id: null, error: error.message }
  }
  return { id: (data as { id: string }).id }
}

/**
 * Advance an order's status via the SECURITY DEFINER advance_order() function,
 * which enforces allowed transitions per role (buyer vs seller).
 */
export async function advanceOrderStatus(
  orderId: string,
  toStatus: Order['status'],
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

/** Record an order event manually (e.g. for audit when status changes outside the RPC). */
export async function createOrderEvent(input: {
  orderId: string
  actorId: string
  fromStatus?: string | null
  toStatus: string
  note?: string | null
}): Promise<{ error?: string }> {
  const { error } = await supabase.from('order_events').insert({
    order_id: input.orderId,
    actor_id: input.actorId,
    from_status: input.fromStatus || null,
    to_status: input.toStatus,
    note: input.note || null,
  })
  if (error) return { error: error.message }
  return {}
}

/** Human-readable status label. */
export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: 'Confirmed',
    paid: 'Paid',
    preparing: 'Preparing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    complete: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[status] ?? status
}

/** Whether the given user (buyer or seller) can advance this order to the given status. */
export function canAdvance(order: Order, userId: string, toStatus: Order['status']): boolean {
  const isSeller = order.seller_id === userId
  const isBuyer = order.buyer_id === userId && order.buyer_id !== null
  if (!isSeller && !isBuyer) return false
  if (order.status === 'complete' || order.status === 'cancelled') return false
  if (order.status === toStatus) return false

  if (isSeller) {
    const sellerPaths: Record<Order['status'], Order['status'][]> = {
      confirmed: ['paid', 'cancelled'],
      paid: ['preparing', 'cancelled'],
      preparing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: ['cancelled'],
      complete: [],
      cancelled: [],
    }
    return (sellerPaths[order.status] || []).includes(toStatus)
  }

  if (isBuyer) {
    if (order.status === 'delivered' && toStatus === 'complete') return true
    if (toStatus === 'cancelled') return true
    return false
  }

  return false
}
