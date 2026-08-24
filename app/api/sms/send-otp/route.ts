import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/sms/send-otp
 *
 * Proxy that sends OTP SMS through the Moolre Ghana SMS Gateway.
 * Called by Supabase Auth Hooks when a phone-based OTP is requested.
 *
 * Moolre API: POST https://api.moolre.com/open/sms/send
 * Auth: X-API-VASKEY header with MOOLRE_SECRET_KEY
 * Body: { senderid, type: 1, messages: [{ recipient, message }] }
 *
 * CONFIRMED: flat format (recipient at top level) fails ASMS08.
 * Array format with recipient inside messages[] succeeds (SMS01).
 */

const MoolreEndpoint = 'https://api.moolre.com/open/sms/send'

function isMoolreSuccess(parsed: Record<string, unknown>): boolean {
  return (
    parsed.status === 1 ||
    parsed.status === '1' ||
    parsed.code === 200 ||
    parsed.code === '200' ||
    parsed.success === true
  )
}

export async function POST(request: Request) {
  console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
  console.log(`[SMS Proxy] NEW REQUEST at ${new Date().toISOString()}`)

  // ── 1. Parse incoming payload ──────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    console.error('[SMS Proxy] ✗ Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[SMS Proxy] Supabase payload:', JSON.stringify(body, null, 2))

  // ── 2. Extract phone and OTP ───────────────────────────────────────────
  const rawPhone =
    (body.phone as string) ||
    ((body.user as Record<string, unknown>)?.phone as string) ||
    (body.recipient as string) ||
    ((body.payload as Record<string, unknown>)?.phone as string)

  const otpCode =
    ((body.sms as Record<string, unknown>)?.otp as string) ||
    (body.otp as string) ||
    (body.code as string)

  const message = otpCode
    ? `Your Campus Plug verification code is: ${otpCode}`
    : (body.message as string) || null

  if (!rawPhone) {
    console.error('[SMS Proxy] ✗ No phone number found in payload')
    return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })
  }

  if (!message) {
    console.error('[SMS Proxy] ✗ No message or OTP code found in payload')
    return NextResponse.json({ error: 'Missing message content' }, { status: 400 })
  }

  console.log('[SMS Proxy] Extracted — phone:', rawPhone, '| otp:', otpCode || '(n/a)')

  // ── 3. Format phone to Ghana local 0XXXXXXXXX ──────────────────────────
  const digits = rawPhone.replace(/[^0-9]/g, '')

  let formattedPhone: string
  if (digits.startsWith('233') && digits.length === 12) {
    formattedPhone = '0' + digits.slice(3)
  } else if (digits.startsWith('0') && digits.length === 10) {
    formattedPhone = digits
  } else if (digits.length === 9) {
    formattedPhone = '0' + digits
  } else {
    console.error('[SMS Proxy] ✗ Invalid phone format:', rawPhone, '| digits:', digits)
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  console.log('[SMS Proxy] Formatted phone:', formattedPhone)

  // ── 4. Rate limiting ─────────────────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  try {
    // IP: max 3 requests per 10 minutes
    const ipKey = `ip:${ip}`
    const { data: ipAllowed } = await supabase.rpc('check_sms_rate_limit', {
      limit_key: ipKey,
      max_hits: 3,
      window_seconds: 600,
    })

    if (ipAllowed === false) {
      console.warn(`[SMS Proxy] ⚠ Rate limited by IP: ${ip}`)
      return NextResponse.json(
        { error: 'Too many SMS requests. Try again later.' },
        { status: 429 }
      )
    }

    // Phone: max 5 requests per 10 minutes
    const phoneKey = `phone:${formattedPhone}`
    const { data: phoneAllowed } = await supabase.rpc('check_sms_rate_limit', {
      limit_key: phoneKey,
      max_hits: 5,
      window_seconds: 600,
    })

    if (phoneAllowed === false) {
      console.warn(`[SMS Proxy] ⚠ Rate limited by phone: ${formattedPhone}`)
      return NextResponse.json(
        { error: 'Too many SMS requests. Try again later.' },
        { status: 429 }
      )
    }
  } catch (err) {
    // If rate-limit DB is unavailable, fail closed to prevent wallet drain
    console.error('[SMS Proxy] ⚠ Rate limit check failed, blocking request:', err)
    return NextResponse.json(
      { error: 'SMS service temporarily unavailable. Please try again later.' },
      { status: 503 }
    )
  }

  // ── 5. Read Moolre env vars ────────────────────────────────────────────
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log('[SMS Proxy] VASKEY:', vaskey.slice(0, 5) + '...')
  console.log('[SMS Proxy] Sender:', senderId)

  // ── 6. Build Moolre payload — array format (CONFIRMED WORKING) ────────
  const moolrePayload = {
    senderid: senderId,
    type: 1,
    messages: [
      {
        recipient: formattedPhone,
        message: message,
      },
    ],
  }

  console.log('[SMS Proxy] → Moolre:', MoolreEndpoint)
  console.log('[SMS Proxy] → Payload:', JSON.stringify(moolrePayload))

  // ── 7. Send to Moolre ──────────────────────────────────────────────────
  let moolreRes: Response
  try {
    moolreRes = await fetch(MoolreEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
      body: JSON.stringify(moolrePayload),
    })
  } catch (err) {
    console.error('[SMS Proxy] ✗ Network error:', err)
    return NextResponse.json({ error: 'SMS gateway unreachable' }, { status: 400 })
  }

  const moolreText = await moolreRes.text()
  console.log('[SMS Proxy] ← HTTP', moolreRes.status, ':', moolreText)

  // ── 8. Parse response ──────────────────────────────────────────────────
  let moolreData: Record<string, unknown> = {}
  try { moolreData = JSON.parse(moolreText) } catch { /* non-JSON */ }

  if (isMoolreSuccess(moolreData)) {
    console.log('[SMS Proxy] ✓ SMS delivered to', formattedPhone)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({}, { status: 200 })
  }

  // ── 9. Error — return to Supabase ──────────────────────────────────────
  const errorMsg = (moolreData.message as string) || moolreText || 'Moolre send failed'
  console.error('[SMS Proxy] ✗ Moolre error:', errorMsg)
  console.log('[SMS Proxy] ═══════════════════════════════════════════════')
  return NextResponse.json({ error: errorMsg }, { status: 400 })
}
