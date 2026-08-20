import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Proxy that sends OTP SMS through the Moolre Ghana SMS Gateway.
 * Called by Supabase Auth Hooks when a phone-based OTP is requested.
 *
 * Auth: Dual Public Key (JWT) + Private Key format for Moolre API.
 * Supabase expects HTTP 200 with JSON {} on success.
 */

const MoolreEndpoint = 'https://api.moolre.com/open/sms/send'

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

  // ── 3. Format phone to Ghana local (0XXXXXXXXX) ────────────────────────
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
  const publicKey = (process.env.MOOLRE_PUBLIC_KEY || '').trim()
  const privateKey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log('[SMS Proxy] Keys loaded — public key:', publicKey.slice(0, 5) + '...', '| private key:', privateKey.slice(0, 5) + '...')
  console.log('[SMS Proxy] Account:', accountNo.slice(0, 5) + '...', '| Sender:', senderId)

  // ── 5. Build Moolre request ────────────────────────────────────────────
  const moolreHeaders = {
    'Content-Type': 'application/json',
    'X-Public-Key': publicKey,
    'X-Private-Key': privateKey,
    'X-Api-Key': privateKey,
    'Authorization': `Bearer ${publicKey}`,
  }

  const bodyData = {
    public_key: publicKey,
    private_key: privateKey,
    key: privateKey,
    account_no: accountNo,
    sender_id: senderId,
    recipient: formattedPhone,
    message: message,
    type: 'text',
  }

  console.log('[SMS Proxy] → Dispatching to Moolre:', MoolreEndpoint)
  console.log('[SMS Proxy] → Payload:', JSON.stringify({ ...bodyData, recipient: formattedPhone }))

  // ── 6. Send to Moolre ──────────────────────────────────────────────────
  let moolreRes: Response
  try {
    moolreRes = await fetch(MoolreEndpoint, {
      method: 'POST',
      headers: moolreHeaders,
      body: JSON.stringify(bodyData),
    })
  } catch (err) {
    console.error('[SMS Proxy] ✗ Network error calling Moolre:', err)
    return NextResponse.json({ error: 'SMS gateway unreachable' }, { status: 400 })
  }

  const moolreText = await moolreRes.text()
  console.log('[SMS Proxy] ← Moolre HTTP', moolreRes.status, ':', moolreText)

  // ── 7. Parse Moolre response ───────────────────────────────────────────
  let moolreData: Record<string, unknown> = {}
  try {
    moolreData = JSON.parse(moolreText) as Record<string, unknown>
  } catch {
    // Non-JSON response
  }

  const moolreStatus = moolreData.status
  const moolreCode = moolreData.code

  const isSuccess =
    moolreStatus === 1 ||
    moolreStatus === '1' ||
    moolreStatus === 'success' ||
    moolreCode === 200 ||
    moolreCode === '200' ||
    moolreData.success === true

  if (isSuccess) {
    console.log('[SMS Proxy] ✓ SMS delivered successfully to', formattedPhone)
    console.log('[SMS Proxy] ═══════════════════════════════════════════════')
    return NextResponse.json({}, { status: 200 })
  }

  // ── 8. Error — return to Supabase so UI does NOT say "Code sent" ───────
  const errorMsg = (moolreData.message as string) || moolreText || 'Unknown Moolre error'
  console.error('[SMS Proxy] ✗ Moolre error:', errorMsg)
  console.log('[SMS Proxy] ═══════════════════════════════════════════════')
  return NextResponse.json({ error: errorMsg }, { status: 400 })
}
