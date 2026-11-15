import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST /api/dev/complete-payment  { orderId }
 *
 * Sandbox-only stand-in for a real MoMo callback. It exists so the dev checkout
 * page can walk the full pay -> deliver -> confirm -> escrow-release loop with no
 * provider credentials.
 *
 * Hard rules:
 *   * 404 unless MOMO_API_KEY is unset. With real credentials configured this
 *     route does not exist, so nobody can mark an order paid for free.
 *   * The caller must be signed in AND be the buyer on that order.
 *   * record_payment() is service-role-only (see add_marketplace_payments.sql),
 *     so the browser can never reach it directly.
 */
export async function POST(req: NextRequest) {
  if (process.env.MOMO_API_KEY) {
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

  const { error: rpcError } = await admin.rpc('record_payment', {
    p_order_id: order.id,
    p_mo_mo_reference: 'dev_sim_' + order.id,
    p_amount: Number(order.amount),
  })

  if (rpcError) {
    console.error('Dev payment completion failed:', rpcError.message)
    return NextResponse.json({ error: 'Could not complete payment' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
