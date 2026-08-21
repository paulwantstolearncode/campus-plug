import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary diagnostic — testing capitalized field names.
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
  const phone = '0202388411'

  // A: Number (capital N)
  const a = testMoolre('A — Number (capital N)', {
    senderid, type: 1,
    messages: [{ Number: phone, message }],
  })

  // B: NUMBER (all caps)
  const b = testMoolre('B — NUMBER (all caps)', {
    senderid, type: 1,
    messages: [{ NUMBER: phone, message }],
  })

  // C: Number + Message (both capitalized)
  const c = testMoolre('C — Number + Message', {
    senderid, type: 1,
    messages: [{ Number: phone, Message: message }],
  })

  // D: number + Number both
  const d = testMoolre('D — number + Number both', {
    senderid, type: 1,
    messages: [{ number: phone, Number: phone, message }],
  })

  // E: try with account_no field included
  const e = testMoolre('E — number + account_no in array item', {
    senderid, type: 1,
    messages: [{ number: phone, message, account_no: (process.env.MOOLRE_ACCOUNT_NO || '').trim() }],
  })

  // F: try with senderid inside array item too
  const f = testMoolre('F — number + senderid in array item', {
    senderid, type: 1,
    messages: [{ number: phone, message, senderid }],
  })

  // G: messages with just the number as the only key (no message field)
  const g = testMoolre('G — messages: [{number}] only', {
    senderid, type: 1, message,
    messages: [{ number: phone }],
  })

  // H: maybe Moolre wants sender_id (underscore) inside messages, not at top level
  const h = testMoolre('H — sender_id (underscore) top-level', {
    sender_id: senderid, type: 1,
    messages: [{ number: phone, message }],
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
