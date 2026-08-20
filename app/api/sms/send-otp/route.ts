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

const MoolreEndpoint = 'https://api.moolre.com/open/sms/send'

/** Redact a secret value for safe logging. */
function redact(val: string | undefined): string {
  if (!val) return '(not set)'
  if (val.length <= 6) return '***'
  return val.slice(0, 3) + '...' + val.slice(-3)
}

/** Send one SMS via Moolre. Returns { ok, status, body }. */
async function sendMoolre(payload: {
  account_no: string
  sender_id: string
  recipient: string
  message: string
  type: string
}): Promise<{ ok: boolean; status: number; body: string }> {
  const secretKey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const authorizationHeader = (secretKey.startsWith('Bearer ') || secretKey.startsWith('EyJ')) ? secretKey : `Bearer ${secretKey}`

  const moolreHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': secretKey,
    'X-Secret-Key': secretKey,
    'Authorization': authorizationHeader,
  }

  // Include key fields in payload for Private API Key auth
  const outgoingPayload = {
    ...payload,
    key: secretKey,
    api_key: secretKey,
  }

  console.log('[SMS Proxy] → Moolre URL:', MoolreEndpoint)
  console.log('[SMS Proxy] → Moolre Body:', JSON.stringify({ ...outgoingPayload, message: outgoingPayload.message.slice(0, 40) + '...' }))
  console.log('[SMS Proxy] → Moolre Headers:', JSON.stringify({
    'Content-Type': 'application/json',
    'X-Api-Key': redact(secretKey),
    'X-Secret-Key': redact(secretKey),
    'Authorization': `Bearer ${redact(secretKey)}`,
  }))

  const res = await fetch(MoolreEndpoint, {
    method: 'POST',
    headers: moolreHeaders,
    body: JSON.stringify(outgoingPayload),
  })

  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text }
}

/**
 * Check whether Moolre actually accepted the SMS.
 * Moolre returns 200 with a JSON body containing a success indicator.
 * We check both HTTP status AND response body for real confirmation.
 */
function isMoolreSuccess(status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    // Moolre success indicators: status field, success field, or code 200
    if (parsed.status === 'success' || parsed.status === 'sent' || parsed.status === 'queued') return true
    if (parsed.success === true || parsed.code === 200 || parsed.code === '200') return true
    // If there's an error field, it failed even if HTTP 200
    if (parsed.error || parsed.message?.toString().toLowerCase().includes('error')) return false
    // If we got a 200 with no clear error, accept it
    return true
  } catch {
    // Non-JSON response — if HTTP 200 and body is empty or short, accept it
    if (status === 200 && body.length < 5) return true
    return false
  }
}

export async function POST(request: Request) {
  const timestamp = new Date().toISOString()
  console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
  console.log(`[SMS Proxy] NEW REQUEST at ${timestamp}`)

  // ── 1. Log incoming headers ────────────────────────────────────────────
  const headers = Object.fromEntries(request.headers.entries())
  console.log('[SMS Proxy] Incoming Headers:', JSON.stringify(headers))

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
    console.warn('[SMS Proxy] ⚠ Authorization header missing or mismatched — proceeding anyway')
  }

  // ── 3. Parse request body ──────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    console.error('[SMS Proxy] ✗ Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[SMS Proxy] Full Supabase Payload:', JSON.stringify(body, null, 2))

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
    console.error('[SMS Proxy] ✗ No phone number found in payload')
    return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })
  }

  if (!message) {
    console.error('[SMS Proxy] ✗ No message or OTP code found in payload')
    return NextResponse.json({ error: 'Missing message content' }, { status: 400 })
  }

  console.log('[SMS Proxy] Extracted — phone:', rawPhone, '| otp:', otpCode || '(n/a)')

  // ── 4. Format phone numbers ────────────────────────────────────────────
  const digits = rawPhone.replace(/[^0-9]/g, '')

  let internationalPhone: string  // 233XXXXXXXXX
  let localPhone: string          // 0XXXXXXXXX

  if (digits.startsWith('233') && digits.length === 12) {
    internationalPhone = digits
    localPhone = '0' + digits.slice(3)
  } else if (digits.startsWith('0') && digits.length === 10) {
    internationalPhone = '233' + digits.slice(1)
    localPhone = digits
  } else if (digits.length === 9) {
    internationalPhone = '233' + digits
    localPhone = '0' + digits
  } else if (digits.length >= 10 && digits.length <= 12) {
    internationalPhone = digits
    localPhone = digits.startsWith('0') ? digits : '0' + digits
  } else {
    console.error('[SMS Proxy] ✗ Invalid phone format:', rawPhone, '| digits:', digits)
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  console.log('[SMS Proxy] Formatted — international:', internationalPhone, '| local:', localPhone, '| raw:', rawPhone)

  // ── 5. Dispatch to Moolre ──────────────────────────────────────────────
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  const moolrePayload = {
    account_no: accountNo,
    sender_id: senderId,
    recipient: internationalPhone,
    message,
    type: 'text',
  }

  // Attempt 1: International format (233XXXXXXXXX)
  console.log('[SMS Proxy] Attempt 1 — sending to international format:', internationalPhone)
  let result = await sendMoolre(moolrePayload)
  console.log('[SMS Proxy] ← Moolre status:', result.status, '| body:', result.body)

  let usedFormat = 'international'

  // Attempt 2: If international fails, retry with local format (0XXXXXXXXX)
  if (!isMoolreSuccess(result.status, result.body)) {
    console.log('[SMS Proxy] ✗ International format failed. Retrying with local format:', localPhone)

    moolrePayload.recipient = localPhone
    result = await sendMoolre(moolrePayload)
    console.log('[SMS Proxy] ← Moolre retry status:', result.status, '| body:', result.body)
    usedFormat = 'local'
  }

  // ── 6. Final result ────────────────────────────────────────────────────
  const success = isMoolreSuccess(result.status, result.body)

  if (success) {
    console.log(`[SMS Proxy] ✓ SMS delivered via ${usedFormat} format to ${usedFormat === 'international' ? internationalPhone : localPhone}`)
    console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
    return NextResponse.json({}, { status: 200 })
  }

  console.error(`[SMS Proxy] ✗ SMS FAILED (${usedFormat} format). Moolre HTTP ${result.status}:`, result.body)
  console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
  return NextResponse.json({ error: result.body }, { status: 400 })
}
