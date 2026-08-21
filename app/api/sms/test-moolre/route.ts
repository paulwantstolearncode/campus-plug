import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary — testing form-urlencoded and XML payloads.
 * DELETE after confirming production flow works.
 */

const Endpoint = 'https://api.moolre.com/open/sms/send'

async function testMoolre(
  label: string,
  bodyOrParams: string,
  contentType: string
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
        'Content-Type': contentType,
        'X-API-VASKEY': vaskey,
      },
      body: bodyOrParams,
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

  // A: form-urlencoded flat
  const a = testMoolre('A — form-urlencoded flat',
    `senderid=${senderid}&recipient=0202388411&message=${encodeURIComponent(message)}&type=1`,
    'application/x-www-form-urlencoded')

  // B: form-urlencoded with "number" field
  const b = testMoolre('B — form-urlencoded number',
    `senderid=${senderid}&number=0202388411&message=${encodeURIComponent(message)}&type=1`,
    'application/x-www-form-urlencoded')

  // C: JSON but with the message inside a "data" wrapper
  const c = testMoolre('C — JSON: {data: [{number, message}]}',
    JSON.stringify({ senderid, type: 1, data: [{ number: '0202388411', message }] }),
    'application/json')

  // D: JSON — maybe messages needs "mobile" as a string
  const d = testMoolre('D — JSON: messages[{mobile:String}]',
    JSON.stringify({ senderid, type: 1, messages: [{ mobile: '0202388411', message }] }),
    'application/json')

  // E: JSON — try "recipients" as flat string (not array)
  const e = testMoolre('E — JSON: recipients:"0202388411"',
    JSON.stringify({ senderid, type: 1, recipients: '0202388411', message }),
    'application/json')

  // F: JSON — "message_list" array
  const f = testMoolre('F — JSON: message_list[{number,message}]',
    JSON.stringify({ senderid, type: 1, message_list: [{ number: '0202388411', message }] }),
    'application/json')

  // G: JSON — "sms" wrapper
  const g = testMoolre('G — JSON: sms:{number,message}',
    JSON.stringify({ senderid, type: 1, sms: { number: '0202388411', message } }),
    'application/json')

  // H: form-urlencoded with "to" field
  const h = testMoolre('H — form-urlencoded to',
    `senderid=${senderid}&to=0202388411&message=${encodeURIComponent(message)}&type=1`,
    'application/x-www-form-urlencoded')

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
