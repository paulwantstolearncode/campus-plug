import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic — Moolre wants "messages" field but rejects all
 * messages[] structures. Testing completely different payloads.
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
  const message = 'Campus Plug OTP test'

  // ── Try completely different structures ────────────────────────────────

  // A: number as top-level field + messages array with just message text
  const bodyA = testMoolre('A — top-level number + messages[].message', {
    senderid,
    number: '0202388411',
    messages: [{ message }],
    type: 1,
  })

  // B: number + to at top-level + messages with just text
  const bodyB = testMoolre('B — top-level to + number + messages', {
    senderid,
    to: '0202388411',
    number: '0202388411',
    messages: [{ message }],
    type: 1,
  })

  // C: messages as flat string, not array
  const bodyC = testMoolre('C — messages: "text" string + number', {
    senderid,
    number: '0202388411',
    messages: message,
    type: 1,
  })

  // D: mobile field inside messages
  const bodyD = testMoolre('D — messages[{mobile, message}]', {
    senderid,
    messages: [{ mobile: '0202388411', message }],
    type: 1,
  })

  // E: msisdn field inside messages
  const bodyE = testMoolre('E — messages[{msisdn, message}]', {
    senderid,
    messages: [{ msisdn: '0202388411', message }],
    type: 1,
  })

  // F: Contact field inside messages
  const bodyF = testMoolre('F — messages[{Contact, message}]', {
    senderid,
    messages: [{ Contact: '0202388411', message }],
    type: 1,
  })

  // G: Recipient field inside messages
  const bodyG = testMoolre('G — messages[{Recipient, message}]', {
    senderid,
    messages: [{ Recipient: '0202388411', message }],
    type: 1,
  })

  // H: number at top level, messages as array of strings
  const bodyH = testMoolre('H — number + messages: ["text"]', {
    senderid,
    number: '0202388411',
    messages: [message],
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
    console.log(`[SMS Test] ${icon} ${s.label} — HTTP ${s.httpStatus} — msg:${s.moolreMessage} data:${s.moolreData}`)
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
