import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Diagnostic — testing the specific Moolre messages[] format:
 * 1. messages with number as integer (no leading zero)
 * 2. messages with number as integer (with country code)
 * 3. flat recipient + messages array of integers
 * 4. flat to + messages array of objects with Number (capital)
 */

const Endpoint = 'https://api.moolre.com/open/sms/send'

async function testMoolre(
  label: string,
  body: Record<string, unknown>
): Promise<{ label: string; raw: string }> {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  try {
    const res = await fetch(Endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
      body: JSON.stringify(body),
    })
    return { label, raw: await res.text() }
  } catch (err) {
    return { label, raw: `Error: ${err}` }
  }
}

function isSuccess(p: Record<string, unknown>): boolean {
  return p.status === 1 || p.status === '1' || p.code === 200 || p.code === '200' || p.success === true
}

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const senderid = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const message = 'Campus Plug OTP test'

  const a = testMoolre('A — messages[{number:int}] no message in item', {
    senderid, type: 1, message,
    messages: [{ number: 202388411 }],
  })

  const b = testMoolre('B — messages[{number:str}] no message in item', {
    senderid, type: 1, message,
    messages: [{ number: '0202388411' }],
  })

  const c = testMoolre('C — flat: recipient + to + messages[int]', {
    senderid, type: 1, recipient: '0202388411',
    message,
    messages: [202388411],
  })

  const d = testMoolre('D — flat: recipient + messages[str]', {
    senderid, type: 1, recipient: '0202388411',
    message,
    messages: ['0202388411'],
  })

  const e = testMoolre('E — flat: to + message + type:1 (retest)', {
    senderid, type: 1, to: '0202388411', message,
  })

  const f = testMoolre('F — flat: recipient + message + type:1 (retest)', {
    senderid, type: 1, recipient: '0202388411', message,
  })

  const g = testMoolre('G — flat: number + message + type:1', {
    senderid, type: 1, number: '0202388411', message,
  })

  const h = testMoolre('H — flat: mobile + message + type:1', {
    senderid, type: 1, mobile: '0202388411', message,
  })

  const results = await Promise.all([a, b, c, d, e, f, g, h])

  const summary = results.map((r) => {
    let p: Record<string, unknown> = {}
    try { p = JSON.parse(r.raw) } catch {}
    return {
      label: r.label,
      success: isSuccess(p),
      code: p.code,
      message: p.message,
      data: p.data,
      raw: r.raw.slice(0, 400),
    }
  })

  const winner = summary.find((s) => s.success)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  summary.forEach((s) => {
    console.log(`[SMS Test] ${s.success ? '✓ WINNER' : '✗'} ${s.label} — code:${s.code} msg:${s.message} data:${s.data}`)
    if (!s.success) console.log(`[SMS Test]   raw: ${s.raw}`)
  })
  console.log(`[SMS Test] 🏆 ${winner ? winner.label : 'No winner'}`)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({ winner: winner?.label || null, results: summary })
}
