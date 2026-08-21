import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary — testing if "number" means message index, not phone.
 * Also trying completely flat with "to" only (no messages field).
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

  // A: number=index, phone=number
  const a = testMoolre('A — number:index + phone + message', {
    senderid, type: 1,
    messages: [{ number: 1, phone: '0202388411', message }],
  })

  // B: number=index, to=number
  const b = testMoolre('B — number:index + to + message', {
    senderid, type: 1,
    messages: [{ number: 1, to: '0202388411', message }],
  })

  // C: number=1, Number=phone (capital N for the actual number)
  const c = testMoolre('C — number:1 + Number:phone + message', {
    senderid, type: 1,
    messages: [{ number: 1, Number: '0202388411', message }],
  })

  // D: single flat message with to (no messages field) — Moolre might accept it now
  const d = testMoolre('D — flat: to + message + type:1', {
    senderid, type: 1,
    to: '0202388411',
    message,
  })

  // E: flat recipient+message+type:1 retest — maybe sender approval changed result
  const e = testMoolre('E — flat: recipient + message + type:1', {
    senderid, type: 1,
    recipient: '0202388411',
    message,
  })

  // F: flat with "number" as phone at top level
  const f = testMoolre('F — flat: number + message + type:1', {
    senderid, type: 1,
    number: '0202388411',
    message,
  })

  // G: flat to+message with type:0 (maybe 0=single, 1=bulk?)
  const g = testMoolre('G — flat: to + message + type:0', {
    senderid, type: 0,
    to: '0202388411',
    message,
  })

  // H: flat to+message with no type at all
  const h = testMoolre('H — flat: to + message (no type)', {
    senderid,
    to: '0202388411',
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
