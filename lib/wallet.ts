// Seller wallet: balance, ledger and payout requests.
//
// Tables: seller_wallets, wallet_entries, disbursements — created by
// supabase/add_seller_wallets.sql. Every write is a SECURITY DEFINER RPC; this
// module only reads tables the caller's RLS already scopes.

import { supabase } from './supabase'
import type { MomoProvider } from './momo'

export type WalletEntryType =
  | 'escrow_credit'
  | 'payout_debit'
  | 'refund_debit'
  | 'adjustment'

export type DisbursementStatus =
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'

export interface WalletEntry {
  id: string
  order_id: string | null
  entry_type: WalletEntryType
  amount: number
  balance_after: number
  description: string | null
  created_at: string
}

export interface Disbursement {
  id: string
  kind: 'seller_payout' | 'buyer_refund'
  seller_id: string
  buyer_id: string | null
  order_id: string | null
  amount: number
  momo_phone: string
  provider: MomoProvider
  status: DisbursementStatus
  provider_reference: string | null
  failure_reason: string | null
  created_at: string
  processed_at: string | null
}

export interface WalletOverview {
  balance: number
  available: number
  held_in_escrow: number
  pending_payouts: number
  lifetime_released: number
  lifetime_paid_out: number
}

function num(value: unknown): number {
  return Number(value ?? 0)
}

export async function getWalletOverview(sellerId: string): Promise<WalletOverview> {
  const [walletResult, availableResult, pendingResult, heldResult] = await Promise.all([
    supabase
      .from('seller_wallets')
      .select('balance, lifetime_released, lifetime_paid_out')
      .eq('seller_id', sellerId)
      .maybeSingle(),
    supabase.rpc('wallet_available', { p_seller_id: sellerId }),
    supabase
      .from('disbursements')
      .select('amount')
      .eq('seller_id', sellerId)
      .eq('kind', 'seller_payout')
      .in('status', ['requested', 'processing']),
    supabase
      .from('payment_transactions')
      .select('amount, platform_fee')
      .eq('seller_id', sellerId)
      .eq('status', 'paid'),
  ])

  const wallet = walletResult.data as {
    balance: string | number
    lifetime_released: string | number
    lifetime_paid_out: string | number
  } | null

  const pendingRows = (pendingResult.data as { amount: string | number }[] | null) || []
  const heldRows =
    (heldResult.data as { amount: string | number; platform_fee: string | number }[] | null) || []

  return {
    balance: num(wallet?.balance),
    available: num(availableResult.data),
    held_in_escrow: heldRows.reduce(
      (sum, row) => sum + num(row.amount) - num(row.platform_fee),
      0
    ),
    pending_payouts: pendingRows.reduce((sum, row) => sum + num(row.amount), 0),
    lifetime_released: num(wallet?.lifetime_released),
    lifetime_paid_out: num(wallet?.lifetime_paid_out),
  }
}

export async function getWalletEntries(
  sellerId: string,
  limit = 50
): Promise<WalletEntry[]> {
  const { data } = await supabase
    .from('wallet_entries')
    .select('id, order_id, entry_type, amount, balance_after, description, created_at')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data as WalletEntry[] | null) || []).map((row) => ({
    ...row,
    amount: num(row.amount),
    balance_after: num(row.balance_after),
  }))
}

export async function getSellerDisbursements(sellerId: string): Promise<Disbursement[]> {
  const { data } = await supabase
    .from('disbursements')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(50)

  return ((data as Disbursement[] | null) || []).map((row) => ({
    ...row,
    amount: num(row.amount),
  }))
}

/** Admins only (RLS returns every row for is_admin()). */
export async function getOpenDisbursements(): Promise<Disbursement[]> {
  const { data } = await supabase
    .from('disbursements')
    .select('*')
    .in('status', ['requested', 'processing'])
    .order('created_at', { ascending: true })

  return ((data as Disbursement[] | null) || []).map((row) => ({
    ...row,
    amount: num(row.amount),
  }))
}

export async function requestPayout(input: {
  amount: number
  phone: string
  provider: MomoProvider
}): Promise<{ id: string | null; error?: string }> {
  if (!input.amount || input.amount <= 0) {
    return { id: null, error: 'Enter an amount greater than zero.' }
  }

  const { data, error } = await supabase.rpc('request_payout', {
    p_amount: input.amount,
    p_momo_phone: input.phone,
    p_provider: input.provider,
  })

  if (error) return { id: null, error: error.message }
  return { id: data as string }
}

export async function cancelPayout(id: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('cancel_payout', { p_disbursement_id: id })
  return error ? { error: error.message } : {}
}

export async function queueRefund(input: {
  disputeId: string
  phone: string
  provider: MomoProvider
}): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase.rpc('queue_refund_disbursement', {
    p_dispute_id: input.disputeId,
    p_momo_phone: input.phone,
    p_provider: input.provider,
  })

  if (error) return { id: null, error: error.message }
  return { id: data as string }
}
