// Admin payouts: platform-wide view of all marketplace transactions.
//
// Tables: payment_transactions, orders, profiles — created by
// add_marketplace_payments.sql and add_orders.sql.

import { supabase } from './supabase'

export interface AdminPayoutTransaction {
  id: string
  order_id: string
  order_title: string | null
  buyer_name: string | null
  seller_name: string | null
  seller_id: string
  amount: number
  platform_fee: number
  seller_receives: number
  status: 'pending' | 'paid' | 'released' | 'refund_pending' | 'refunded' | 'failed'
  created_at: string
  paid_at: string | null
  released_at: string | null
}

export interface AdminPayoutSummary {
  total_platform_fees: number
  total_seller_earnings: number
  held_in_escrow: number
  total_transactions: number
  pending_count: number
  released_count: number
}

type RawAdminPayoutRow = {
  id: string
  order_id: string
  amount: string
  platform_fee: string
  status: AdminPayoutTransaction['status']
  created_at: string
  paid_at: string | null
  released_at: string | null
  order_payments: {
    order_id: string
    orders: {
      listing: { title: string | null } | null
      buyer: { full_name: string | null }[] | null
      seller_id: string
    } | null
  }[] | null
}

/** All payment transactions across all sellers, newest first. Admin only. */
export async function getAllPayouts(): Promise<AdminPayoutTransaction[]> {
  const { data } = await supabase
    .from('payment_transactions')
    .select(`
      *,
      order_payments (
        order_id,
        orders (
          listing:listings!listing_id (title),
          buyer:profiles!buyer_id (full_name),
          seller_id
        )
      )
    `)
    .order('created_at', { ascending: false })

  const rows = (data as RawAdminPayoutRow[] | null) || []

  return rows.map((r) => {
    const order = r.order_payments?.[0]?.orders
    return {
      id: r.id,
      order_id: r.order_id,
      // The orders table has no title column; the item name lives on the
      // listing the order references.
      order_title: order?.listing?.title || null,
      buyer_name: order?.buyer?.[0]?.full_name || null,
      seller_id: order?.seller_id || '',
      seller_name: '', // filled below
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

/** Platform-wide payout summary. Admin only. */
export async function getAdminPayoutSummary(): Promise<AdminPayoutSummary> {
  const { data } = await supabase
    .from('payment_transactions')
    .select('amount, platform_fee, status')

  type SummaryRow = { amount: string; platform_fee: string; status: AdminPayoutTransaction['status'] }
  const rows = (data as SummaryRow[] | null) || []

  let totalFees = 0
  let totalSellerEarnings = 0
  let heldInEscrow = 0
  let pending = 0
  let released = 0

  for (const r of rows) {
    totalFees += Number(r.platform_fee)
    const sellerReceives = Number(r.amount) - Number(r.platform_fee)
    if (r.status === 'released') {
      totalSellerEarnings += sellerReceives
      released += 1
    } else if (r.status === 'paid') {
      heldInEscrow += sellerReceives
      pending += 1
    }
  }

  return {
    total_platform_fees: totalFees,
    total_seller_earnings: totalSellerEarnings,
    held_in_escrow: heldInEscrow,
    total_transactions: rows.length,
    pending_count: pending,
    released_count: released,
  }
}
