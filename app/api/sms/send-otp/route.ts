import { NextResponse } from 'next/server'

/**
 * POST /api/sms/send-otp
 *
 * Secure proxy that sends an OTP SMS through the Moolre (Ghana SMS Gateway)
 * API. Supabase calls this endpoint when a phone-based OTP is requested.
 *
 * Required headers:
 *   Authorization: Bearer [SUPABASE_SMS_WEBHOOK_SECRET]
 *
 * Required body (JSON):
 *   phone   – the recipient's phone number (any format)
 *   message – the message body (contains the 6-digit OTP)
 *
 * Environment variables (set in .env.local):
 *   SUPABASE_SMS_WEBHOOK_SECRET – shared secret for authorising Supabase → us
 *   MOOLRE_SECRET_KEY           – Moolre API secret key
 *   MOOLRE_ACCOUNT_NO           – Moolre account number
 *   MOOLRE_SENDER_ID            – registered sender ID (e.g. "CampusPlug")
 */

export async function POST(request: Request) {
  // ── 1. Verify authorization ────────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.SUPABASE_SMS_WEBHOOK_SECRET

  if (!expectedToken) {
    console.error('[SMS Proxy] SUPABASE_SMS_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'SMS proxy not configured' }, { status: 500 })
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse request body ──────────────────────────────────────────────
  let phone: string
  let message: string

  try {
    const body = await request.json()
    phone = body.phone
    message = body.message
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!phone || !message) {
    return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
  }

  // ── 3. Read Moolre credentials ─────────────────────────────────────────
  const moolreSecretKey = process.env.MOOLRE_SECRET_KEY
  const moolreAccountNo = process.env.MOOLRE_ACCOUNT_NO
  const moolreSenderId = process.env.MOOLRE_SENDER_ID

  if (!moolreSecretKey || !moolreAccountNo || !moolreSenderId) {
    console.error('[SMS Proxy] Moolre env vars are missing')
    return NextResponse.json({ error: 'SMS gateway not configured' }, { status: 500 })
  }

  // ── 4. Format phone number to Ghana standard (233XXXXXXXXX) ────────────
  // Strip all non-digit characters first.
  const digits = phone.replace(/[^0-9]/g, '')

  let formattedPhone: string
  if (digits.startsWith('233') && digits.length === 12) {
    // Already in international format: 233XXXXXXXXX
    formattedPhone = digits
  } else if (digits.startsWith('0') && digits.length === 10) {
    // Local format: 0XXXXXXXXX → 233XXXXXXXXX
    formattedPhone = '233' + digits.slice(1)
  } else if (digits.length === 9) {
    // Missing leading zero: XXXXXXXXX → 233XXXXXXXXX
    formattedPhone = '233' + digits
  } else if (digits.length >= 10 && digits.length <= 12) {
    // Already plausible international — use as-is
    formattedPhone = digits
  } else {
    return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
  }

  // ── 5. Send SMS via Moolre API ─────────────────────────────────────────
  try {
    const moolreResponse = await fetch('https://api.moolre.com/api/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${moolreSecretKey}`,
      },
      body: JSON.stringify({
        account_no: moolreAccountNo,
        sender_id: moolreSenderId,
        to: formattedPhone,
        message: message,
      }),
    })

    const result = await moolreResponse.json().catch(() => null)

    if (!moolreResponse.ok) {
      console.error('[SMS Proxy] Moolre API error:', moolreResponse.status, result)
      return NextResponse.json(
        { error: 'Failed to send SMS', details: result },
        { status: 502 }
      )
    }

    console.log('[SMS Proxy] SMS sent successfully to', formattedPhone)
    return NextResponse.json({ success: true, to: formattedPhone })
  } catch (err) {
    console.error('[SMS Proxy] Network error calling Moolre:', err)
    return NextResponse.json({ error: 'SMS gateway unreachable' }, { status: 502 })
  }
}
