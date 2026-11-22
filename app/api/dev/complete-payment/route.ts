import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { momoSimulated } from '@/lib/momoServer'

export const runtime = 'nodejs'

/**
 * POST /api/dev/complete-payment  { orderId }
 *
 * Sandbox-only stand-in for a real MoMo callback. It exists so the dev checkout
 * page can walk the full pay -> deliver -> confirm -> escrow-release loop with no
 * provider credentials.
 *
 * Hard rules:
 *   * 404 unless the shared local-only simulation guard allows it. Production
 *     and every configured real provider disable this route, even without an
 *     MTN MOMO_API_KEY.
 *   * The caller must be signed in AND be the buyer on that order.
 *   * record_payment() is service-role-only (see add_marketplace_payments.sql),
 *     so the browser can never reach it directly.
 */
export async function POST(req: NextRequest) {
  if (!momoSimulated()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
  if (typeof orderId !== 'string' || !orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, amount, buyer_id, status')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (order.buyer_id !== authData.user.id) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  }
  if (order.status !== 'awaiting_payment') {
    return NextResponse.json({ error: 'Order is not awaiting payment' }, { status: 409 })
  }

  // Sandbox settlement must use the same pending intent created by
  // /api/momo/initiate. It cannot invent a reference and bypass reference
  // ownership, terminal-state, or one-successful-payment checks.
  const { data: payment, error: paymentError } = await admin
    .from('payment_transactions')
    .select('id, mo_mo_reference, amount')
    .eq('order_id', order.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (paymentError) {
    return NextResponse.json({ error: 'Could not load payment intent' }, { status: 500 })
  }
  if (!payment?.mo_mo_reference) {
    return NextResponse.json(
      { error: 'Start MoMo checkout before completing this sandbox payment' },
      { status: 409 }
    )
  }
  if (Number(payment.amount) !== Number(order.amount)) {
    return NextResponse.json({ error: 'Payment intent amount does not match order' }, { status: 409 })
  }

  const { error: rpcError } = await admin.rpc('record_payment', {
    p_order_id: order.id,
    p_mo_mo_reference: payment.mo_mo_reference,
    p_amount: Number(payment.amount),
  })

  if (rpcError) {
    console.error('Dev payment completion failed:', rpcError.message)
    return NextResponse.json({ error: 'Could not complete payment' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
