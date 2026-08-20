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

const MoolreEndpoints = [
  'https://api.moolre.com/open/sms/send',
  'https://app.moolre.com/open/sms/send',
  'https://api.moolre.com/v1/sms/send',
]

/** Redact a secret value for safe logging. */
function redact(val: string | undefined): string {
  if (!val) return '(not set)'
  if (val.length <= 6) return '***'
  return val.slice(0, 3) + '...' + val.slice(-3)
}

/** Send one SMS via Moolre on a specific endpoint. Returns { ok, status, body }. */
async function sendMoolre(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  payload: {
    account_no: string
    sender_id: string
    recipient: string
    message: string
    type: string
  }
): Promise<{ ok: boolean; status: number; body: string }> {
  const moolreHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Public-Key': publicKey,
    'X-Private-Key': privateKey,
    'X-Api-Key': privateKey,
    'Authorization': `Bearer ${publicKey || privateKey}`,
  }

  const outgoingPayload = {
    public_key: publicKey,
    private_key: privateKey,
    key: privateKey,
    api_key: privateKey,
    ...payload,
  }

  console.log('[SMS Proxy] → Moolre URL:', endpoint)
  console.log('[SMS Proxy] → Moolre Headers:', JSON.stringify({
    'Content-Type': 'application/json',
    'X-Public-Key': redact(publicKey),
    'X-Private-Key': redact(privateKey),
    'X-Api-Key': redact(privateKey),
    'Authorization': `Bearer ${redact(publicKey || privateKey)}`,
  }))
  console.log('[SMS Proxy] → Moolre Body:', JSON.stringify({
    ...outgoingPayload,
    public_key: redact(publicKey),
    private_key: redact(privateKey),
    key: redact(privateKey),
    api_key: redact(privateKey),
    message: outgoingPayload.message.slice(0, 40) + '...',
  }))

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: moolreHeaders,
    body: JSON.stringify(outgoingPayload),
  })

  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text }
}

/**
 * Check whether Moolre actually accepted the SMS.
 */
function isMoolreSuccess(status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    if (parsed.status === 'success' || parsed.status === 'sent' || parsed.status === 'queued') return true
    if (parsed.success === true || parsed.code === 200 || parsed.code === '200') return true
    if (parsed.error || parsed.message?.toString().toLowerCase().includes('error')) return false
    return true
  } catch {
    if (status === 200 && body.length < 5) return true
    return false
  }
}

export async function POST(request: Request) {
  const timestamp = new Date().toISOString()
  console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
  console.log(`[SMS Proxy] NEW REQUEST at ${timestamp}`)

  // ── 1. Log incoming headers ────────────────────────────────────────────
  const incomingHeaders = Object.fromEntries(request.headers.entries())
  console.log('[SMS Proxy] Incoming Headers:', JSON.stringify(incomingHeaders))

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

  // Extract phone number
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

  let internationalPhone: string
  let localPhone: string

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

  // ── 5. Read Moolre keys ────────────────────────────────────────────────
  const publicKey = (process.env.MOOLRE_PUBLIC_KEY || '').trim()
  const privateKey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log('[SMS Proxy] Keys — public:', redact(publicKey), '| private:', redact(privateKey))

  const basePayload = {
    account_no: accountNo,
    sender_id: senderId,
    message,
    type: 'text' as const,
  }

  // ── 6. Send with endpoint fallback ─────────────────────────────────────
  const phoneFormats = [
    { label: 'international', value: internationalPhone },
    { label: 'local', value: localPhone },
  ]

  let lastResult: { ok: boolean; status: number; body: string } | null = null

  for (const phoneFormat of phoneFormats) {
    for (let i = 0; i < MoolreEndpoints.length; i++) {
      const endpoint = MoolreEndpoints[i]
      const attemptLabel = `${phoneFormat.label}+endpoint[${i}]`

      console.log(`[SMS Proxy] Attempt — ${attemptLabel} — ${phoneFormat.value} via ${endpoint}`)

      try {
        const result = await sendMoolre(endpoint, publicKey, privateKey, {
          ...basePayload,
          recipient: phoneFormat.value,
        })

        console.log(`[SMS Proxy] ← ${attemptLabel} — HTTP ${result.status}:`, result.body)

        if (isMoolreSuccess(result.status, result.body)) {
          console.log(`[SMS Proxy] ✓ SMS delivered via ${attemptLabel}`)
          console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
          return NextResponse.json({}, { status: 200 })
        }

        lastResult = result

        // Parse error — if it's an auth error, try next endpoint; if it's a phone error, try next phone format
        try {
          const parsed = JSON.parse(result.body) as Record<string, unknown>
          const code = (parsed.code as string) || ''
          const msg = (parsed.message as string) || ''

          if (code.startsWith('AIN') || msg.toLowerCase().includes('auth')) {
            console.log(`[SMS Proxy] ✗ Auth error — trying next endpoint`)
            continue
          }
        } catch { /* non-JSON error body — try next endpoint */ }

        // For non-auth errors, skip remaining endpoints for this phone format
        console.log(`[SMS Proxy] ✗ Non-auth error — skipping remaining endpoints for ${phoneFormat.label}`)
        break
      } catch (err) {
        console.error(`[SMS Proxy] ✗ Network error on ${attemptLabel}:`, err)
        lastResult = { ok: false, status: 0, body: String(err) }
      }
    }
  }

  // ── 7. All attempts failed ─────────────────────────────────────────────
  console.error(`[SMS Proxy] ✗ ALL ATTEMPTS FAILED. Last result:`, lastResult)
  console.log(`[SMS Proxy] ═══════════════════════════════════════════════`)
  return NextResponse.json({ error: lastResult?.body || 'SMS delivery failed' }, { status: 400 })
}
