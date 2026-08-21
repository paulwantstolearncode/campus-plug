import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Proxy that sends OTP SMS through the Moolre Ghana SMS Gateway.
 * Called by Supabase Auth Hooks when a phone-based OTP is requested.
 *
 * Moolre API: POST https://api.moolre.com/open/sms/send
 * Auth: X-API-VASKEY header with MOOLRE_SECRET_KEY
 * Tries flat payload first; falls back to messages[] array on ASMS08.
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

function needsArrayFallback(parsed: Record<string, unknown>): boolean {
  const code = (parsed.code as string) || ''
  const data = (parsed.data as string) || ''
  return code === 'ASMS08' || data === 'messages'
}

async function sendMoolre(
  vaskey: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; parsed: Record<string, unknown>; raw: string }> {
  const res = await fetch(MoolreEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(text) } catch { /* non-JSON */ }

  return { success: isMoolreSuccess(parsed), parsed, raw: text }
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

  // ── 5. Payload 1 — Flat format ─────────────────────────────────────────
  const flatPayload = {
    senderid: senderId,
    type: 1,
    recipient: formattedPhone,
    message: message,
  }

  console.log('[SMS Proxy] → Attempt 1 (flat):', JSON.stringify(flatPayload))
  const result1 = await sendMoolre(vaskey, flatPayload)
  console.log('[SMS Proxy] ← Response:', result1.raw)

  if (result1.success) {
    console.log('[SMS Proxy] ✓ SMS delivered (flat) to', formattedPhone)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({}, { status: 200 })
  }

  // ── 6. Payload 2 — Array format (fallback for ASMS08 / messages error) ─
  if (needsArrayFallback(result1.parsed)) {
    console.log('[SMS Proxy] ↻ Flat rejected, trying array format')

    const arrayPayload = {
      senderid: senderId,
      type: 1,
      messages: [
        {
          recipient: formattedPhone,
          message: message,
        },
      ],
    }

    console.log('[SMS Proxy] → Attempt 2 (array):', JSON.stringify(arrayPayload))
    const result2 = await sendMoolre(vaskey, arrayPayload)
    console.log('[SMS Proxy] ← Response:', result2.raw)

    if (result2.success) {
      console.log('[SMS Proxy] ✓ SMS delivered (array) to', formattedPhone)
      console.log('[SMS Proxy] ═══════════════════════════════════════════════')
      return NextResponse.json({}, { status: 200 })
    }

    const finalMsg = (result2.parsed.message as string) || 'Moolre send failed'
    console.error('[SMS Proxy] ✗ Both payloads failed. Last error:', finalMsg)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({ error: finalMsg }, { status: 400 })
  }

  // ── 7. Non-phone error (auth, account, etc.) — no retry ────────────────
  const errorMsg = (result1.parsed.message as string) || 'Moolre send failed'
  console.error('[SMS Proxy] ✗ Moolre error:', errorMsg)
  console.log('[SMS Proxy] ═══════════════════════════════════════════════')
  return NextResponse.json({ error: errorMsg }, { status: 400 })
}
