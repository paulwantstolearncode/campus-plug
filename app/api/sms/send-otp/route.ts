import { NextResponse } from 'next/server'

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

  // ── 4. Read Moolre environment variables ───────────────────────────────
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log('[SMS Proxy] VASKEY:', vaskey.slice(0, 5) + '...')
  console.log('[SMS Proxy] Sender:', senderId)

  // ── 5. Build Moolre payload — array format (CONFIRMED WORKING) ────────
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

  // ── 6. Send to Moolre ──────────────────────────────────────────────────
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

  // ── 7. Parse response ──────────────────────────────────────────────────
  let moolreData: Record<string, unknown> = {}
  try { moolreData = JSON.parse(moolreText) } catch { /* non-JSON */ }

  if (isMoolreSuccess(moolreData)) {
    console.log('[SMS Proxy] ✓ SMS delivered to', formattedPhone)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({}, { status: 200 })
  }

  // ── 8. Error — return to Supabase ──────────────────────────────────────
  const errorMsg = (moolreData.message as string) || moolreText || 'Moolre send failed'
  console.error('[SMS Proxy] ✗ Moolre error:', errorMsg)
  console.log('[SMS Proxy] ═══════════════════════════════════════════════')
  return NextResponse.json({ error: errorMsg }, { status: 400 })
}
