import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Proxy that sends OTP SMS through the Moolre Ghana SMS Gateway.
 * Called by Supabase Auth Hooks when a phone-based OTP is requested.
 *
 * Official Moolre API: POST https://api.moolre.com/open/sms/send
 * Auth: X-API-VASKEY header with MOOLRE_SECRET_KEY
 * Body: { senderid, recipient, message, type: 1 }
 * Supabase expects HTTP 200 with JSON {} on success.
 */

const MoolreEndpoint = 'https://api.moolre.com/open/sms/send'

async function sendToMoolre(
  vaskey: string,
  senderId: string,
  recipient: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string; parsed: Record<string, unknown> }> {
  const bodyData = { senderid: senderId, recipient, message, type: 1 }

  console.log('[SMS Proxy] → Moolre:', MoolreEndpoint)
  console.log('[SMS Proxy] → Body:', JSON.stringify(bodyData))

  const res = await fetch(MoolreEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    body: JSON.stringify(bodyData),
  })

  const text = await res.text()
  console.log('[SMS Proxy] ← HTTP', res.status, ':', text)

  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(text) } catch { /* non-JSON */ }

  return { ok: res.ok, status: res.status, body: text, parsed }
}

function isMoolreSuccess(parsed: Record<string, unknown>): boolean {
  return (
    parsed.status === 1 ||
    parsed.status === '1' ||
    parsed.code === 200 ||
    parsed.code === '200' ||
    parsed.success === true
  )
}

function isPhoneError(parsed: Record<string, unknown>): boolean {
  const code = (parsed.code as string) || ''
  return code.startsWith('ASMS0') || code === 'ASMS07' || code === 'ASMS08'
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

  // ── 3. Format phone — primary: Ghana local 0XXXXXXXXX ──────────────────
  const digits = rawPhone.replace(/[^0-9]/g, '')

  let localPhone: string   // 0XXXXXXXXX (primary)
  let intlPhone: string    // 233XXXXXXXXX (retry fallback)

  if (digits.startsWith('233') && digits.length === 12) {
    localPhone = '0' + digits.slice(3)
    intlPhone = digits
  } else if (digits.startsWith('0') && digits.length === 10) {
    localPhone = digits
    intlPhone = '233' + digits.slice(1)
  } else if (digits.length === 9) {
    localPhone = '0' + digits
    intlPhone = '233' + digits
  } else if (rawPhone.startsWith('+')) {
    const d = rawPhone.replace('+', '')
    localPhone = d.startsWith('233') && d.length === 12 ? '0' + d.slice(3) : d
    intlPhone = d.startsWith('233') && d.length === 12 ? d : '233' + d
  } else {
    console.error('[SMS Proxy] ✗ Invalid phone format:', rawPhone, '| digits:', digits)
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  console.log('[SMS Proxy] Phones — local:', localPhone, '| intl:', intlPhone)

  // ── 4. Read Moolre environment variables ───────────────────────────────
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log('[SMS Proxy] VASKEY:', vaskey.slice(0, 5) + '...')
  console.log('[SMS Proxy] Sender:', senderId)

  // ── 5. Send to Moolre — primary: local 0XXXXXXXXX ─────────────────────
  let result = await sendToMoolre(vaskey, senderId, localPhone, message)

  if (isMoolreSuccess(result.parsed)) {
    console.log('[SMS Proxy] ✓ SMS delivered to', localPhone)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({}, { status: 200 })
  }

  // ── 6. If phone-related error, retry with international 233XXXXXXXXX ──
  const errMsg = (result.parsed.message as string) || result.body || 'Unknown error'
  console.log('[SMS Proxy] ✗ Failed with local format:', errMsg)

  if (isPhoneError(result.parsed) && localPhone !== intlPhone) {
    console.log('[SMS Proxy] ↻ Retrying with international format:', intlPhone)
    result = await sendToMoolre(vaskey, senderId, intlPhone, message)

    if (isMoolreSuccess(result.parsed)) {
      console.log('[SMS Proxy] ✓ SMS delivered to', intlPhone, '(international retry)')
      console.log('[SMS Proxy] ═══════════════════════════════════════════════')
      return NextResponse.json({}, { status: 200 })
    }
  }

  // ── 7. All attempts failed — return error to Supabase ──────────────────
  const finalMsg = (result.parsed.message as string) || result.body || 'Unknown Moolre error'
  console.error('[SMS Proxy] ✗ Moolre error:', finalMsg)
  console.log('[SMS Proxy] ═══════════════════════════════════════════════')
  return NextResponse.json({ error: finalMsg }, { status: 400 })
}
