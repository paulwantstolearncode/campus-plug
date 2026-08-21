import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary — testing messages as object/map, flat strings, etc.
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
      headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return { label, httpStatus: res.status, raw: text }
  } catch (err) {
    return { label, httpStatus: 0, raw: `Network error: ${err}` }
  }
}

function isSuccess(p: Record<string, unknown>): boolean {
  return p.status === 1 || p.status === '1' || p.code === 200 || p.code === '200' || p.success === true
}

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderid = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const message = 'Campus Plug OTP test'

  // A: messages as object { phone: message }
  const a = testMoolre('A — messages: {phone: message}', {
    senderid, type: 1,
    messages: { '0202388411': message },
  })

  // B: messages as flat comma-separated string
  const b = testMoolre('B — messages: "0202388411"', {
    senderid, type: 1, message,
    messages: '0202388411',
  })

  // C: messages as single phone string, message at top level
  const c = testMoolre('C — messages: ["0202388411"]', {
    senderid, type: 1, message,
    messages: ['0202388411'],
  })

  // D: target instead of messages
  const d = testMoolre('D — target: [{number,message}]', {
    senderid, type: 1,
    target: [{ number: '0202388411', message }],
  })

  // E: Maybe we need BOTH recipient AND messages
  const e = testMoolre('E — recipient + messages + type:1', {
    senderid, type: 1,
    recipient: '0202388411',
    messages: [{ number: '0202388411', message }],
  })

  // F: The original body B that got ASMS07 before (approved now) — flat recipient + message + type:1
  const f = testMoolre('F — FLAT: recipient + message + type:1', {
    senderid, type: 1,
    recipient: '0202388411',
    message,
  })

  // G: Same as F but with intl phone
  const g = testMoolre('G — FLAT: recipient + message + type:1 (intl)', {
    senderid, type: 1,
    recipient: '233202388411',
    message,
  })

  // H: Maybe the issue is encoding — try with explicit JSON parse/stringify
  const h = testMoolre('H — FLAT: recipient + message + type:1 (024)', {
    senderid, type: 1,
    recipient: '0241234567',
    message,
  })

  const results = await Promise.all([a, b, c, d, e, f, g, h])

  const summary = results.map((r) => {
    let p: Record<string, unknown> = {}
    try { p = JSON.parse(r.raw) } catch {}
    return {
      label: r.label,
      success: isSuccess(p),
      moolreMessage: p.message,
      moolreData: p.data,
      rawBody: r.raw.slice(0, 400),
    }
  })

  const winner = summary.find((s) => s.success)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  summary.forEach((s) => {
    console.log(`[SMS Test] ${s.success ? '✓ WINNER' : '✗'} ${s.label} — msg:${s.moolreMessage} data:${s.moolreData}`)
    if (!s.success) console.log(`[SMS Test]   raw: ${s.rawBody}`)
  })
  console.log(`[SMS Test] 🏆 ${winner ? winner.label : 'No winner'}`)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({ config: { hasVaskey: !!vaskey, senderid }, winner: winner?.label || null, results: summary })
}
