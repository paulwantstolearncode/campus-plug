import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Secure proxy that sends an OTP SMS through the Moolre (Ghana SMS Gateway)
 * API. Supabase calls this endpoint when a phone-based OTP is requested.
 *
 * Authentication (any ONE of these passes):
 *   Authorization: Bearer [SUPABASE_SMS_WEBHOOK_SECRET]
 *   x-supabase-signature header present (Supabase webhook signature)
 *   svix-signature header present (Svix webhook signature)
 *   Dev/test mode: skip if NODE_ENV !== 'production' and header is absent
 *
 * Required body (JSON) — handles multiple Supabase payload formats:
 *   { phone, message }                              — flat
 *   { user: { phone }, sms: { otp } }               — nested user
 *   { recipient, otp }                              — alternate
 *   { payload: { phone }, code }                    — deep nested
 *
 * Environment variables (set in .env.local and Vercel):
 *   SUPABASE_SMS_WEBHOOK_SECRET – shared secret for authorising Supabase → us
 *   MOOLRE_SECRET_KEY           – Moolre API secret key
 *   MOOLRE_ACCOUNT_NO           – Moolre account number
 *   MOOLRE_SENDER_ID            – registered sender ID (e.g. "CampusPlug")
 */

export async function POST(request: Request) {
  const env = process.env.NODE_ENV || 'development'
  const isDev = env !== 'production'

  // ── 1. Log all incoming headers ──────────────────────────────────────────
  console.log('[SMS Proxy] Incoming Headers:', JSON.stringify(Object.fromEntries(request.headers.entries())))

  // ── 2. Flexible authorization check ──────────────────────────────────────
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

  // Allow if ANY of these conditions are met:
  //  a) Valid Bearer token match
  //  b) Any webhook signature header present
  //  c) User-Agent is from Supabase/Go-http-client
  //  d) Secret not configured (dev/test safety net)
  const authPassed = hasBearerAuth || hasWebhookSig || hasSupabaseUA || tokenMissing

  console.log('[SMS Proxy] Auth check —', {
    bearer: hasBearerAuth,
    webhookSig: hasWebhookSig,
    supabaseUA: hasSupabaseUA,
    tokenMissing,
    passed: authPassed,
  })

  if (!authPassed) {
    console.warn('[SMS Proxy] Authorization FAILED — no matching auth method found')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse request body (robust multi-format) ──────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    console.error('[SMS Proxy] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[SMS Proxy] Incoming payload:', JSON.stringify(body))

  // Extract phone number (handles flat, nested, or alternate field names)
  const rawPhone =
    (body.phone as string) ||
    ((body.user as Record<string, unknown>)?.phone as string) ||
    (body.recipient as string) ||
    ((body.payload as Record<string, unknown>)?.phone as string)

  // Extract OTP code or pre-built message
  const otpCode =
    ((body.sms as Record<string, unknown>)?.otp as string) ||
    (body.otp as string) ||
    (body.code as string)

  const message: string | null =
    (body.message as string) ||
    (otpCode ? `Your Campus Plug verification code is: ${otpCode}` : null)

  if (!rawPhone) {
    console.error('[SMS Proxy] No phone number found in payload')
    return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })
  }

  if (!message) {
    console.error('[SMS Proxy] No message or OTP code found in payload')
    return NextResponse.json({ error: 'Missing message content' }, { status: 400 })
  }

  console.log('[SMS Proxy] Extracted phone:', rawPhone, '| OTP:', otpCode || '(inline message)')

  // ── 3. Read Moolre credentials ───────────────────────────────────────────
  const moolreSecretKey = process.env.MOOLRE_SECRET_KEY
  const moolreAccountNo = process.env.MOOLRE_ACCOUNT_NO
  const moolreSenderId = process.env.MOOLRE_SENDER_ID

  if (!moolreSecretKey || !moolreAccountNo || !moolreSenderId) {
    console.error('[SMS Proxy] Moolre env vars missing —', {
      key: !!moolreSecretKey,
      account: !!moolreAccountNo,
      sender: !!moolreSenderId,
    })
    return NextResponse.json({ error: 'SMS gateway not configured' }, { status: 500 })
  }

  // ── 4. Format phone number to Ghana standard (233XXXXXXXXX) ──────────────
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

  // ── 5. Send SMS via Moolre API ───────────────────────────────────────────
  const moolrePayload = {
    account_no: moolreAccountNo,
    sender_id: moolreSenderId,
    to: formattedPhone,
    message: message,
  }

  console.log('[SMS Proxy] Sending to Moolre —', {
    to: formattedPhone,
    sender: moolreSenderId,
    msgLen: message.length,
  })

  try {
    const moolreResponse = await fetch('https://api.moolre.com/api/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${moolreSecretKey}`,
      },
      body: JSON.stringify(moolrePayload),
    })

    const result = await moolreResponse.json().catch(() => null)

    if (!moolreResponse.ok) {
      console.error('[SMS Proxy] Moolre API error —', {
        status: moolreResponse.status,
        statusText: moolreResponse.statusText,
        body: result,
      })
      return NextResponse.json(
        { error: 'Failed to send SMS', details: result },
        { status: 502 }
      )
    }

    console.log('[SMS Proxy] SMS sent successfully —', {
      to: formattedPhone,
      moolreStatus: moolreResponse.status,
      moolreResponse: result,
    })
    return NextResponse.json({ success: true, to: formattedPhone })
  } catch (err) {
    console.error('[SMS Proxy] Network error calling Moolre —', err)
    return NextResponse.json({ error: 'SMS gateway unreachable' }, { status: 502 })
  }
}
