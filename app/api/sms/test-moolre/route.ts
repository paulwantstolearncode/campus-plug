import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Diagnostic endpoint — tests the confirmed Moolre API body shape.
 * Flat body with senderid + recipient + message + type:1.
 *
 * Previous findings:
 * - type: "text" → ASMS09 (invalid type)
 * - sender_id (underscore) → ASMS02 (senderid required)
 * - type: 1 (integer) → passes validation
 * - flat {senderid, recipient, message, type:1} → was ASMS07 (sender pending)
 * - messages[] array → ASMS03 (Number required at index 0)
 *
 * NOW sender is approved. Flat body should work.
 * DELETE after confirming production flow works.
 */

const Endpoint = 'https://api.moolre.com/open/sms/send'

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderid = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const message = 'Campus Plug diagnostic test'
  const recipient = '0202388411'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] VASKEY: ${vaskey.slice(0, 8)}...`)
  console.log(`[SMS Test] Sender: ${senderid}`)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // The confirmed winning body shape (flat, type:1 integer)
  const body = {
    senderid,
    recipient,
    message,
    type: 1,
  }

  console.log(`[SMS Test] Sending flat body:`, JSON.stringify(body))

  try {
    const res = await fetch(Endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': vaskey,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    console.log(`[SMS Test] ← HTTP ${res.status}:`, text)

    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(text) } catch {}

    const isSuccess =
      parsed.status === 1 ||
      parsed.status === '1' ||
      parsed.code === 200 ||
      parsed.code === '200' ||
      parsed.success === true

    console.log(`[SMS Test] ${isSuccess ? '✓ SUCCESS' : '✗ FAILED'} — code: ${parsed.code} msg: ${parsed.message}`)
    console.log(`[SMS Test] ═══════════════════════════════════════════════`)

    return NextResponse.json({
      config: {
        hasVaskey: !!vaskey,
        vaskeyPrefix: vaskey.slice(0, 8),
        senderid,
        endpoint: Endpoint,
      },
      success: isSuccess,
      response: {
        status: parsed.status,
        code: parsed.code,
        message: parsed.message,
        data: parsed.data,
        raw: text.slice(0, 500),
      },
    })
  } catch (err) {
    console.error(`[SMS Test] ✗ Network error:`, err)
    return NextResponse.json({
      config: { hasVaskey: !!vaskey, senderid, endpoint: Endpoint },
      success: false,
      response: { raw: `Network error: ${err}` },
    })
  }
}
