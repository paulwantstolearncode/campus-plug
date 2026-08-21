import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic — testing entirely different top-level structures.
 * Moolre rejects all messages[] phone field names. Trying alternatives.
 * DELETE after confirming production flow works.
 */

const Endpoint = 'https://api.moolre.com/open/sms/send'

async function testMoolre(
  label: string,
  body: Record<string, unknown>
): Promise<{
  label: string
  httpStatus: number
  raw: string
}> {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
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
    return { label, httpStatus: res.status, raw: text }
  } catch (err) {
    return { label, httpStatus: 0, raw: `Network error: ${err}` }
  }
}

function isSuccess(parsed: Record<string, unknown>): boolean {
  return (
    parsed.status === 1 ||
    parsed.status === '1' ||
    parsed.code === 200 ||
    parsed.code === '200' ||
    parsed.success === true
  )
}

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderid = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const msg = 'Campus Plug OTP test'

  // ── Try entirely different top-level structures ────────────────────────

  // A: recipients (plural) instead of messages
  const bodyA = testMoolre('A — recipients[{number,message}] + type:1', {
    senderid,
    recipients: [{ number: '0202388411', message: msg }],
    type: 1,
  })

  // B: destinations
  const bodyB = testMoolre('B — destinations[{number,message}] + type:1', {
    senderid,
    destinations: [{ number: '0202388411', message: msg }],
    type: 1,
  })

  // C: contacts
  const bodyC = testMoolre('C — contacts[{number,message}] + type:1', {
    senderid,
    contacts: [{ number: '0202388411', message: msg }],
    type: 1,
  })

  // D: The Moolre "Compose" pattern: flat recipient + message + type:1 + sender
  //    but with the phone as just "to"
  const bodyD = testMoolre('D — flat: to + message + type:1 + sender', {
    senderid,
    to: '0202388411',
    message: msg,
    type: 1,
  })

  // E: flat with "number" as top-level field
  const bodyE = testMoolre('E — flat: number + message + type:1', {
    senderid,
    number: '0202388411',
    message: msg,
    type: 1,
  })

  // F: flat with "mobile" as top-level field
  const bodyF = testMoolre('F — flat: mobile + message + type:1', {
    senderid,
    mobile: '0202388411',
    message: msg,
    type: 1,
  })

  // G: Try with "dest" or "destinations" as flat string
  const bodyG = testMoolre('G — flat: dest + message + type:1', {
    senderid,
    dest: '0202388411',
    message: msg,
    type: 1,
  })

  // H: Maybe Moolre wants number as integer, messages[{number(int), message}]
  const bodyH = testMoolre('H — flat: phone + message + type:1', {
    senderid,
    phone: '0202388411',
    message: msg,
    type: 1,
  })

  const results = await Promise.all([bodyA, bodyB, bodyC, bodyD, bodyE, bodyF, bodyG, bodyH])

  const summary = results.map((r) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(r.raw) } catch { /* non-JSON */ }
    return {
      label: r.label,
      httpStatus: r.httpStatus,
      moolreStatus: parsed.status,
      moolreCode: parsed.code,
      moolreMessage: parsed.message,
      moolreData: parsed.data,
      success: isSuccess(parsed),
      rawBody: r.raw.slice(0, 300),
    }
  })

  const winner = summary.find((s) => s.success)

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  summary.forEach((s) => {
    const icon = s.success ? '✓ WINNER' : '✗'
    console.log(`[SMS Test] ${icon} ${s.label} — msg:${s.moolreMessage} data:${s.moolreData}`)
  })
  if (winner) {
    console.log(`[SMS Test] 🏆 WINNER: ${winner.label}`)
  } else {
    console.log(`[SMS Test] ⚠ No variation succeeded`)
  }
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({
    config: { hasVaskey: !!vaskey, senderid },
    winner: winner ? { label: winner.label, moolreMessage: winner.moolreMessage } : null,
    results: summary,
  })
}
