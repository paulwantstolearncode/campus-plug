// Marketplace payouts: what a seller has earned, what's held in escrow,
// and what's been released to them.
//
// Tables: payment_transactions, order_payments, orders — created by
// add_marketplace_payments.sql and add_orders.sql.

import { supabase } from './supabase'

export interface PayoutSummary {
  total_earned: number        // released to seller
  held_in_escrow: number      // paid but not yet released
  available_to_withdraw: number // total_earned (simplified — no payout ledger yet)
  transaction_count: number
}

export interface PayoutTransaction {
  id: string
  order_id: string
  order_title: string | null
  buyer_name: string | null
  amount: number
  platform_fee: number
  seller_receives: number
  status: 'pending' | 'paid' | 'released' | 'refund_pending' | 'refunded' | 'failed'
  created_at: string
  paid_at: string | null
  released_at: string | null
}

/** Seller's payout summary across all their orders. */
export async function getPayoutSummary(sellerId: string): Promise<PayoutSummary> {
  const { data } = await supabase
    .from('payment_transactions')
    .select('amount, platform_fee, status')
    .eq('seller_id', sellerId)

  const rows = (data as { amount: string; platform_fee: string; status: PayoutTransaction['status'] }[] | null) || []

  let totalEarned = 0
  let heldInEscrow = 0

  for (const r of rows) {
    // Net to the seller is the amount minus the recorded platform fee. The
    // columns come back as strings from NUMERIC, so parse before subtracting.
    const sellerReceives = Number(r.amount) - Number(r.platform_fee)
    if (r.status === 'released') {
      totalEarned += sellerReceives
    } else if (r.status === 'paid') {
      heldInEscrow += sellerReceives
    }
  }

  return {
    total_earned: totalEarned,
    held_in_escrow: heldInEscrow,
    available_to_withdraw: totalEarned,
    transaction_count: rows.length,
  }
}

type RawPayoutRow = {
  id: string
  order_id: string
  amount: string
  platform_fee: string
  status: PayoutTransaction['status']
  created_at: string
  paid_at: string | null
  released_at: string | null
  order_payments: {
    order_id: string
    orders: {
      listing: { title: string | null } | null
      buyer: { full_name: string | null }[] | null
    } | null
  }[] | null
}

/** All payment transactions for a seller, newest first. */
export async function getSellerPayouts(sellerId: string): Promise<PayoutTransaction[]> {
  const { data } = await supabase
    .from('payment_transactions')
    .select(`
      *,
      order_payments (
        order_id,
        orders (
          listing:listings!listing_id (title),
          buyer:profiles!buyer_id (full_name)
        )
      )
    `)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  const rows = (data as RawPayoutRow[] | null) || []

  return rows.map((r) => {
    const order = r.order_payments?.[0]?.orders
    return {
      id: r.id,
      order_id: r.order_id,
      // The orders table has no title column; the item name lives on the
      // listing the order references.
      order_title: order?.listing?.title || null,
      buyer_name: order?.buyer?.[0]?.full_name || null,
      amount: Number(r.amount),
      platform_fee: Number(r.platform_fee),
      seller_receives: Number(r.amount) - Number(r.platform_fee),
      status: r.status,
      created_at: r.created_at,
      paid_at: r.paid_at,
      released_at: r.released_at,
    }
  })
}
