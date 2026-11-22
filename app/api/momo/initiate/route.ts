import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { commission } from '@/lib/commerceConfig'
import {
  availableProviders,
  isDefiniteMomoRejection,
  isProviderAvailable,
  momoSimulated,
  normalizeMomoPhone,
  requestToPay,
  serviceAppointmentPaymentError,
  type MomoProvider,
} from '@/lib/momoServer'

export const runtime = 'nodejs'

/**
 * POST /api/momo/initiate  { orderId, phone, provider }
 *
 * Starts a real Mobile Money collection. This must run on the server: the
 * provider keys are not NEXT_PUBLIC_*, so the old browser-side call could only
 * ever fall into the simulated branch.
 *
 * Order of operations matters:
 *   1. insert the PENDING payment_transactions row (so a charge can never exist
 *      without a record), then
 *   2. send the STK prompt.
 * If step 2 is inconclusive the pending row is retained for webhook/polling
 * reconciliation; a retry resumes the same reference instead of double-charging.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDERS: MomoProvider[] = ['mtn', 'vodafone', 'airteltigo']

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

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

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const orderId = readString(body.orderId) ?? ''
  const phone = readString(body.phone) ?? ''
  const provider = (readString(body.provider) ?? 'mtn') as MomoProvider

  if (!UUID_RE.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })
  }
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Unsupported MoMo provider.' }, { status: 400 })
  }
  if (normalizeMomoPhone(phone).length < 12) {
    return NextResponse.json({ error: 'Enter a valid MoMo phone number.' }, { status: 400 })
  }
  if (!isProviderAvailable(provider)) {
    return NextResponse.json(
      { error: 'That network is not available yet. Please choose MTN.' },
      { status: 400 }
    )
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, amount, status, buyer_id, seller_id, listing_id, kind, scheduled_for')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (order.buyer_id !== authData.user.id) {
    return NextResponse.json({ error: 'Not your order.' }, { status: 403 })
  }
  if (order.status !== 'awaiting_payment') {
    return NextResponse.json(
      { error: 'This order is no longer awaiting payment.' },
      { status: 409 }
    )
  }

  // Settlement checks this again, but charging first would strand money when
  // the appointment is already past. Refuse before resuming or creating a
  // prompt, and specifically before requestToPay().
  const appointmentError = serviceAppointmentPaymentError(order)
  if (appointmentError) {
    return NextResponse.json({ error: appointmentError }, { status: 409 })
  }

  const amount = Number(order.amount)

  // Never replace a live intent: its prompt may still be approved after an
  // inconclusive network outcome. Resume that reference instead, and refuse to
  // create another charge after any successful collection.
  const { data: attempts, error: attemptsError } = await admin
    .from('payment_transactions')
    .select('status, mo_mo_reference, provider')
    .eq('order_id', orderId)
    .in('status', ['pending', 'paid', 'released', 'refund_pending', 'refunded'])
    .order('created_at', { ascending: false })

  if (attemptsError) {
    console.error('MoMo initiate: could not check existing intents:', attemptsError.message)
    return NextResponse.json({ error: 'Could not start payment.' }, { status: 500 })
  }
  if (attempts?.some((attempt) => attempt.status !== 'pending')) {
    return NextResponse.json(
      { error: 'This order already has a successful payment.' },
      { status: 409 }
    )
  }

  const pending = attempts?.find((attempt) => attempt.status === 'pending')
  if (pending) {
    if (!pending.mo_mo_reference) {
      return NextResponse.json(
        { error: 'A payment is already being verified. Please try again shortly.' },
        { status: 409 }
      )
    }
    return NextResponse.json({
      reference: pending.mo_mo_reference,
      simulated: momoSimulated(),
      provider: pending.provider || provider,
      requiresStk: !momoSimulated(),
      amount,
      resumed: true,
    })
  }

  const reference = randomUUID()
  const { error: insertError } = await admin.from('payment_transactions').insert({
    order_id: orderId,
    buyer_id: order.buyer_id,
    seller_id: order.seller_id,
    amount,
    platform_fee: commission(amount),
    mo_mo_reference: reference,
    status: 'pending',
    payer_phone: normalizeMomoPhone(phone),
    provider,
  })

  if (insertError) {
    console.error('MoMo initiate: could not record payment intent:', insertError.message)
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'A payment is already being verified. Reload checkout to resume it.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Could not start payment.' }, { status: 500 })
  }

  try {
    const result = await requestToPay({
      amount,
      phone,
      provider,
      reference,
      description: 'Campus Plug order #' + orderId.slice(-4).toUpperCase(),
    })

    return NextResponse.json({
      reference: result.reference,
      simulated: result.simulated,
      provider,
      requiresStk: !result.simulated,
      amount,
    })
  } catch (err) {
    console.error('MoMo initiate failed:', err)

    if (isDefiniteMomoRejection(err)) {
      // A small set of provider responses proves that no collection was
      // accepted. Retire only this still-pending row so the next attempt can
      // use a fresh reference; a concurrent settlement cannot be overwritten.
      const { error: failureError } = await admin
        .from('payment_transactions')
        .update({ status: 'failed' })
        .eq('mo_mo_reference', reference)
        .eq('order_id', orderId)
        .eq('status', 'pending')

      if (failureError) {
        console.error('MoMo initiate: could not retire rejected intent:', failureError.message)
        return NextResponse.json(
          { error: 'The provider rejected the payment, but the attempt could not be reset.' },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 502 }
      )
    }

    // Network errors, 409/429, 5xx and unexpected success responses do not
    // prove rejection. Keep the intent pending for webhook/polling
    // reconciliation; a retry resumes this reference instead of double-charging.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach the MoMo network.' },
      { status: 502 }
    )
  }
}

/** Capability probe used by the checkout page to hide unconfigured networks. */
export async function GET() {
  return NextResponse.json({
    providers: availableProviders(),
    simulated: momoSimulated(),
  })
}
