import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// MoMo webhook endpoint. Providers (MTN, Vodafone, AirtelTigo) POST here when
// a payment completes/fails. Authenticates the caller, then calls
// record_payment() which marks the transaction paid and advances the order to
// 'paid' via the existing advance_order() RPC.
//
// SECURITY: this endpoint can move an order into fulfilment, so an
// unauthenticated POST here is effectively a free purchase. Every request is
// authenticated before its body is trusted:
//
//   1. HMAC-SHA256 over the *raw* body, sent as x-momo-signature,
//      x-signature, x-callback-signature or x-hub-signature-256 (hex or
//      base64, optional "sha256=" prefix); or
//   2. a shared token in `Authorization: Bearer <secret>`,
//      `x-webhook-secret: <secret>` or `?token=<secret>`, for providers such
//      as MTN's Collection API that do not sign callbacks at all.
//
// Both are compared in constant time. The secret is MOMO_WEBHOOK_SECRET.
//
// Missing secret: when real credentials are configured (MOMO_API_KEY set) the
// route fails closed with 503, so a misconfigured deploy can never accept
// forged payments. Unsigned calls are only accepted in local sandbox, where no
// real money moves and /checkout/dev completes payments through the RPC
// directly rather than through this route.
//
// Replays are harmless: record_payment() is idempotent on mo_mo_reference.

const SIGNATURE_HEADERS = [
  'x-momo-signature',
  'x-signature',
  'x-callback-signature',
  'x-hub-signature-256',
] as const

const SUCCESS_STATUSES = new Set(['success', 'successful', 'paid', 'completed'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Length-safe constant-time string comparison. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** True when `candidate` is HMAC-SHA256(secret, raw) as hex or base64. */
function hmacMatches(raw: string, secret: string, candidate: string): boolean {
  const digest = createHmac('sha256', secret).update(raw, 'utf8').digest()
  const value = candidate.trim().replace(/^sha256=/i, '')

  if (constantTimeEquals(digest.toString('hex'), value.toLowerCase())) return true
  if (constantTimeEquals(digest.toString('base64'), value)) return true
  return false
}

function isAuthorized(req: NextRequest, raw: string, secret: string): boolean {
  for (const header of SIGNATURE_HEADERS) {
    const signature = req.headers.get(header)
    if (signature && hmacMatches(raw, secret, signature)) return true
  }

  const bearer = req.headers.get('authorization')
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    if (constantTimeEquals(secret, bearer.slice(7).trim())) return true
  }

  const sharedToken = req.headers.get('x-webhook-secret')
  if (sharedToken && constantTimeEquals(secret, sharedToken.trim())) return true

  const queryToken = req.nextUrl.searchParams.get('token')
  if (queryToken && constantTimeEquals(secret, queryToken)) return true

  return false
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const secret = process.env.MOMO_WEBHOOK_SECRET ?? ''

  if (!secret) {
    if (process.env.MOMO_API_KEY) {
      console.error(
        'MoMo webhook: MOMO_WEBHOOK_SECRET is not set — refusing to accept unsigned payment callbacks'
      )
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }
    console.warn('MoMo webhook: unsigned sandbox callback accepted (MOMO_WEBHOOK_SECRET unset)')
  } else if (!isAuthorized(req, raw, secret)) {
    console.warn(
      'MoMo webhook: rejected callback with missing or invalid signature from',
      req.headers.get('x-forwarded-for') ?? 'unknown origin'
    )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
      }
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Provider-specific fields vary; normalize the common ones.
    const orderId =
      readString(body.externalId) ?? readString(body.orderId) ?? readString(body.reference)
    const status = (readString(body.status) ?? readString(body.transactionStatus) ?? '').toLowerCase()
    const reference =
      readString(body.reference) ?? readString(body.transactionId) ?? readString(body.externalRef)

    // MTN nests the amount as { value, currency }; others send a bare number.
    const amountContainer =
      body.amount && typeof body.amount === 'object'
        ? (body.amount as Record<string, unknown>)
        : undefined
    const amount = Number(
      readString(amountContainer?.value ?? body.amount) ?? NaN
    )

    if (!orderId || !UUID_RE.test(orderId)) {
      return NextResponse.json({ error: 'Missing or invalid order reference' }, { status: 400 })
    }

    if (!SUCCESS_STATUSES.has(status)) {
      // Failed/cancelled payment — nothing to record beyond the reference.
      console.log('MoMo payment not successful for order', orderId, 'status:', status || 'unknown')
      return NextResponse.json({ ok: true })
    }

    // A zero/absent amount would record a payment with no value and a zero
    // platform fee, then advance the order anyway. Treat it as malformed.
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('MoMo webhook: successful callback without a usable amount for order', orderId)
      return NextResponse.json({ error: 'Missing or invalid amount' }, { status: 400 })
    }

    // SECURITY DEFINER RPC: records payment + advances the order. It is
    // executable by the service role only, so it must be called with the
    // server-side key — never with the public anon key.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('MoMo webhook: SUPABASE_SERVICE_ROLE_KEY is not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { error } = await admin.rpc('record_payment', {
      p_order_id: orderId,
      p_mo_mo_reference: reference ?? `momo_${orderId}`,
      p_amount: amount,
    })

    if (error) {
      console.error('MoMo webhook: record_payment failed for order', orderId, error.message)
      return NextResponse.json({ error: 'Could not record payment' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Never echo internals to the caller; the provider only needs a status.
    console.error('MoMo webhook error:', err)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
