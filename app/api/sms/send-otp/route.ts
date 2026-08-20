import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Proxy that sends OTP SMS through the Moolre Ghana SMS Gateway.
 * Called by Supabase Auth Hooks when a phone-based OTP is requested.
 *
 * Auth: Flexible — Bearer token, webhook signature, Supabase UA, or no secret.
 * Never return 401 during testing — log warning instead.
 *
 * Supabase expects HTTP 200 with JSON {} on success.
 */

export async function POST(request: Request) {
  // ── 1. Log incoming headers ────────────────────────────────────────────
  console.log('[SMS Proxy] Incoming Headers:', JSON.stringify(Object.fromEntries(request.headers.entries())))

  // ── 2. Authorization check (permissive) ────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const supabaseSig = request.headers.get('x-supabase-signature')
  const svixSig = request.headers.get('svix-signature')
  const webhookSig = request.headers.get('webhook-signature')
  const userAgent = request.headers.get('user-agent') || ''
  const expectedToken = process.env.SUPABASE_SMS_WEBHOOK_SECRET

  const hasBearerAuth = !!authHeader && authHeader === `Bearer ${expectedToken}`
  const hasWebhookSig = !!supabaseSig || !!svixSig || !!webhookSig
  const hasSupabaseUA = /Go-http-client|Supabase/i.test(userAgent)
  const tokenMissing = !expectedToken

  const authPassed = hasBearerAuth || hasWebhookSig || hasSupabaseUA || tokenMissing

  console.log('[SMS Proxy] Auth check —', {
    bearer: hasBearerAuth,
    webhookSig: hasWebhookSig,
    supabaseUA: hasSupabaseUA,
    tokenMissing,
    passed: authPassed,
  })

  if (!authPassed) {
    // Log warning but do NOT reject — Supabase hooks may not send auth headers
    console.warn('[SMS Proxy] Authorization header missing or mismatched — proceeding anyway (no 401)')
  }

  // ── 3. Parse request body ──────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    console.error('[SMS Proxy] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[SMS Proxy] Incoming payload:', JSON.stringify(body))

  // Extract phone number (flat, nested, or alternate field names)
  const rawPhone =
    (body.phone as string) ||
    ((body.user as Record<string, unknown>)?.phone as string) ||
    (body.recipient as string) ||
    ((body.payload as Record<string, unknown>)?.phone as string)

  // Extract OTP code
  const otpCode =
    ((body.sms as Record<string, unknown>)?.otp as string) ||
    (body.otp as string) ||
    (body.code as string)

  // Build message from OTP
  const message = otpCode
    ? `Your Campus Plug verification code is: ${otpCode}`
    : (body.message as string) || null

  if (!rawPhone) {
    console.error('[SMS Proxy] No phone number found in payload')
    return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })
  }

  if (!message) {
    console.error('[SMS Proxy] No message or OTP code found in payload')
    return NextResponse.json({ error: 'Missing message content' }, { status: 400 })
  }

  console.log('[SMS Proxy] Extracted — phone:', rawPhone, '| otp:', otpCode || '(n/a)')

  // ── 4. Format phone to Ghana standard (233XXXXXXXXX) ───────────────────
  const digits = rawPhone.replace(/[^0-9]/g, '')

  let formattedPhone: string
  if (digits.startsWith('233') && digits.length === 12) {
    formattedPhone = digits
  } else if (digits.startsWith('0') && digits.length === 10) {
    formattedPhone = '233' + digits.slice(1)
  } else if (digits.length === 9) {
    formattedPhone = '233' + digits
  } else if (digits.length >= 10 && digits.length <= 12) {
    formattedPhone = digits
  } else {
    console.error('[SMS Proxy] Invalid phone format:', rawPhone, '| digits:', digits)
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  console.log('[SMS Proxy] Formatted phone:', formattedPhone, '(raw:', rawPhone, ')')

  // ── 5. Dispatch to Moolre ──────────────────────────────────────────────
  const moolrePayload = {
    account_no: process.env.MOOLRE_ACCOUNT_NO || '',
    sender_id: process.env.MOOLRE_SENDER_ID || 'CampusPlug',
    recipient: formattedPhone,
    message: message,
    type: 'text',
  }

  console.log('[SMS Proxy] Dispatching to Moolre:', JSON.stringify(moolrePayload))

  try {
    const moolreRes = await fetch('https://api.moolre.com/open/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.MOOLRE_SECRET_KEY || '',
        'Authorization': `Bearer ${process.env.MOOLRE_SECRET_KEY || ''}`,
      },
      body: JSON.stringify(moolrePayload),
    })

    const moolreText = await moolreRes.text()
    console.log('[SMS Proxy] Moolre Response Status:', moolreRes.status, moolreText)

    if (!moolreRes.ok) {
      console.error('[SMS Proxy] Moolre API error —', moolreRes.status, moolreText)
      return NextResponse.json({ error: moolreText }, { status: 400 })
    }

    console.log('[SMS Proxy] SMS sent successfully to', formattedPhone)
    return NextResponse.json({}, { status: 200 })
  } catch (err) {
    console.error('[SMS Proxy] Network error calling Moolre —', err)
    return NextResponse.json({ error: 'SMS gateway unreachable' }, { status: 400 })
  }
}
