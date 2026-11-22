import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { momoSimulated, paymentStatus, type MomoProvider } from '@/lib/momoServer'

export const runtime = 'nodejs'

/**
 * POST /api/momo/status  { orderId }
 *
 * Item 5: authoritative payment polling. The checkout page calls this after the
 * STK prompt instead of trusting the webhook alone (callbacks get lost, arrive
 * late, or are blocked by a deploy). Each poll asks the provider directly and,
 * on a confirmed success, records the payment through the same SECURITY DEFINER
 * RPC the webhook uses — so record_payment()'s idempotency is the single
 * arbiter and a webhook + poll race cannot double-charge or double-advance.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TERMINAL = new Set(['paid', 'released', 'refund_pending', 'refunded', 'failed'])

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

  const { data: authData, error: authError } = await createClient(url, anonKey, {
    auth: { persistSession: false },
  }).auth.getUser(token)

  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 })
  }

  let orderId: unknown
  try {
    const body = (await req.json()) as { orderId?: unknown }
    orderId = body.orderId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof orderId !== 'string' || !UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const { data: order } = await admin
    .from('orders')
    .select('id, amount, status, buyer_id, seller_id')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (order.buyer_id !== authData.user.id && order.seller_id !== authData.user.id) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }

  const { data: payment } = await admin
    .from('payment_transactions')
    .select('id, status, mo_mo_reference, provider, amount')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!payment) {
    return NextResponse.json({ status: 'none', orderStatus: order.status })
  }

  if (TERMINAL.has(payment.status)) {
    return NextResponse.json({ status: payment.status, orderStatus: order.status })
  }

  // Nothing to verify against: either dev mode or the request-to-pay never
  // produced a reference. Both stay pending until the dev route completes them.
  if (momoSimulated() || !payment.mo_mo_reference) {
    return NextResponse.json({
      status: payment.status,
      orderStatus: order.status,
      simulated: momoSimulated(),
    })
  }

  const provider = (payment.provider || 'mtn') as MomoProvider

  let providerState: 'pending' | 'paid' | 'failed'
  try {
    providerState = await paymentStatus(payment.mo_mo_reference, provider)
  } catch (err) {
    // A transient provider outage must not fail the buyer's payment locally.
    console.error('MoMo status check failed:', err)
    return NextResponse.json({
      status: payment.status,
      orderStatus: order.status,
      warning: 'Could not reach the MoMo network yet.',
    })
  }

  if (providerState === 'failed') {
    // A provider failure must never overwrite a payment that a webhook has
    // already settled. Only a still-pending intent may transition to failed.
    const { data: failed, error: failError } = await admin
      .from('payment_transactions')
      .update({ status: 'failed' })
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (failError) {
      console.error('MoMo status: could not mark pending intent failed:', failError.message)
      return NextResponse.json({ error: 'Could not update payment status.' }, { status: 500 })
    }
    if (!failed) {
      const { data: current } = await admin
        .from('payment_transactions')
        .select('status')
        .eq('id', payment.id)
        .single()
      return NextResponse.json({ status: current?.status ?? payment.status, orderStatus: order.status })
    }
    return NextResponse.json({ status: 'failed', orderStatus: order.status })
  }

  if (providerState === 'paid') {
    const { error: rpcError } = await admin.rpc('record_payment', {
      p_order_id: orderId,
      p_mo_mo_reference: payment.mo_mo_reference,
      p_amount: Number(order.amount),
    })

    if (rpcError) {
      console.error('MoMo status: record_payment failed:', rpcError.message)
      return NextResponse.json({ error: 'Could not confirm payment.' }, { status: 500 })
    }

    return NextResponse.json({ status: 'paid', orderStatus: 'paid' })
  }

  return NextResponse.json({ status: 'pending', orderStatus: order.status })
}
