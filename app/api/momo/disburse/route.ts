import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  disbursementStatus,
  disburse,
  momoSimulated,
  refundCollection,
  refundStatus,
  type MomoProvider,
} from '@/lib/momoServer'

export const runtime = 'nodejs'

/**
 * POST /api/momo/disburse  { disbursementId }
 *
 * Admin-only. Pays money OUT of the platform:
 *   seller_payout -> MTN disbursement (or configured operator/aggregator payout)
 *   buyer_refund  -> MTN collection refund, falling back to a payout transfer to
 *                    the buyer's wallet for non-MTN networks
 *
 * A 202 from a provider means "accepted", not "paid", so the route re-checks the
 * transfer status once. Anything still in flight stays 'processing' and the
 * admin can press Re-check (same endpoint) until it settles.
 *
 * Money only leaves the ledger inside complete_disbursement() (service-role
 * only), which writes the matching wallet debit in the same transaction.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REFUND_PREFIX = 'refund:'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 503 })
  }

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return NextResponse.json({ error: 'Missing auth token.' }, { status: 401 })
  }

  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await anon.auth.getUser(token)
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  }

  let disbursementId: unknown
  try {
    const body = (await req.json()) as { disbursementId?: unknown }
    disbursementId = body.disbursementId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof disbursementId !== 'string' || !UUID_RE.test(disbursementId)) {
    return NextResponse.json({ error: 'Invalid disbursement reference.' }, { status: 400 })
  }

  const { data: row } = await admin
    .from('disbursements')
    .select('*')
    .eq('id', disbursementId)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'Disbursement not found.' }, { status: 404 })
  }
  if (row.status === 'paid') {
    return NextResponse.json({ status: 'paid', reference: row.provider_reference })
  }
  if (row.status === 'failed' || row.status === 'cancelled') {
    return NextResponse.json({ error: 'This transfer is no longer payable.' }, { status: 409 })
  }

  const provider = (row.provider || 'mtn') as MomoProvider
  const actor = authData.user.id

  // ── Re-check path: we already submitted this transfer once. ──────────────
  if (row.status === 'processing' && row.provider_reference) {
    try {
      const stored = String(row.provider_reference)
      const isRefund = row.kind === 'buyer_refund' && stored.startsWith(REFUND_PREFIX)
      const reference = isRefund ? stored.slice(REFUND_PREFIX.length) : stored
      const state = isRefund
        ? await refundStatus(reference)
        : await disbursementStatus(reference, provider)

      if (state === 'paid') {
        await admin.rpc('complete_disbursement', {
          p_disbursement_id: row.id,
          p_provider_reference: stored,
          p_actor: actor,
        })
        return NextResponse.json({ status: 'paid', reference: stored })
      }
      if (state === 'failed') {
        await admin.rpc('fail_disbursement', {
          p_disbursement_id: row.id,
          p_reason: 'Provider reported the transfer failed',
          p_actor: actor,
        })
        return NextResponse.json({ status: 'failed' })
      }
      return NextResponse.json({ status: 'processing', reference: stored })
    } catch (err) {
      console.error('Disbursement re-check failed:', err)
      return NextResponse.json({ status: 'processing', warning: 'Provider did not respond.' })
    }
  }

  // ── First submission ──────────────────────────────────────────────────────
  if (row.status === 'requested') {
    const { error: markError } = await admin.rpc('mark_disbursement_processing', {
      p_disbursement_id: row.id,
    })
    if (markError) {
      console.error('Could not mark disbursement processing:', markError.message)
      return NextResponse.json({ error: 'Could not start the transfer.' }, { status: 500 })
    }
  }

  let storedReference = ''
  let simulated = false

  try {
    if (row.kind === 'buyer_refund' && provider === 'mtn') {
      const { data: payment } = await admin
        .from('payment_transactions')
        .select('mo_mo_reference')
        .eq('order_id', row.order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (payment?.mo_mo_reference) {
        const result = await refundCollection({
          originalReference: payment.mo_mo_reference,
          amount: Number(row.amount),
          provider,
        })
        simulated = result.simulated
        storedReference = REFUND_PREFIX + result.reference
      } else {
        // No original collection reference (offline/imported order): pay the
        // buyer directly instead of pretending the refund API can find it.
        const result = await disburse({
          amount: Number(row.amount),
          phone: row.momo_phone,
          provider,
          description: 'Refund for order ' + String(row.order_id).slice(-4).toUpperCase(),
        })
        simulated = result.simulated
        storedReference = result.reference
      }
    } else {
      const result = await disburse({
        amount: Number(row.amount),
        phone: row.momo_phone,
        provider,
        description:
          row.kind === 'seller_payout'
            ? 'Campus Plug payout'
            : 'Refund for order ' + String(row.order_id).slice(-4).toUpperCase(),
      })
      simulated = result.simulated
      storedReference = result.reference
    }
  } catch (err) {
    console.error('Disbursement failed:', err)
    await admin.rpc('fail_disbursement', {
      p_disbursement_id: row.id,
      p_reason: err instanceof Error ? err.message.slice(0, 300) : 'Provider rejected the transfer',
      p_actor: actor,
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not send the transfer.' },
      { status: 502 }
    )
  }

  // Dev mode: no real money moved, so settle immediately.
  if (simulated || momoSimulated()) {
    const { error: completeError } = await admin.rpc('complete_disbursement', {
      p_disbursement_id: row.id,
      p_provider_reference: storedReference,
      p_actor: actor,
    })
    if (completeError) {
      console.error('complete_disbursement failed:', completeError.message)
      return NextResponse.json({ error: 'Transfer sent but could not be recorded.' }, { status: 500 })
    }
    return NextResponse.json({ status: 'paid', reference: storedReference, simulated: true })
  }

  // Persist the reference so a re-check can find the transfer.
  await admin
    .from('disbursements')
    .update({ provider_reference: storedReference })
    .eq('id', row.id)

  try {
    const isRefund = storedReference.startsWith(REFUND_PREFIX)
    const reference = isRefund ? storedReference.slice(REFUND_PREFIX.length) : storedReference
    const state = isRefund
      ? await refundStatus(reference)
      : await disbursementStatus(reference, provider)

    if (state === 'paid') {
      await admin.rpc('complete_disbursement', {
        p_disbursement_id: row.id,
        p_provider_reference: storedReference,
        p_actor: actor,
      })
      return NextResponse.json({ status: 'paid', reference: storedReference })
    }
    if (state === 'failed') {
      await admin.rpc('fail_disbursement', {
        p_disbursement_id: row.id,
        p_reason: 'Provider reported the transfer failed',
        p_actor: actor,
      })
      return NextResponse.json({ status: 'failed' })
    }
  } catch (err) {
    // Accepted but not yet confirmed. That is normal for MoMo; do not fail it.
    console.warn('Transfer accepted but status not yet available:', err)
  }

  return NextResponse.json({ status: 'processing', reference: storedReference })
}
