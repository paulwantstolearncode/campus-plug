import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary — final desperate sweep before contacting Moolre support.
 * DELETE after confirming production flow works.
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

  // A: "message" (singular) array instead of "messages" (plural)
  const a = testMoolre('A — message[] (singular) array', {
    senderid, type: 1,
    message: [{ number: '0202388411', message }],
  })

  // B: "message" (singular) with just one message object (not array)
  const b = testMoolre('B — message: {} object (not array)', {
    senderid, type: 1,
    message: { number: '0202388411', message },
  })

  // C: "sms" wrapper with "messages" inside
  const c = testMoolre('C — sms.messages[]', {
    senderid, type: 1,
    sms: {
      messages: [{ number: '0202388411', message }],
    },
  })

  // D: "body" wrapper
  const d = testMoolre('D — body.messages[]', {
    senderid, type: 1,
    body: {
      messages: [{ number: '0202388411', message }],
    },
  })

  // E: completely flat with "msg" instead of "message"
  const e = testMoolre('E — flat: recipient + msg (not message)', {
    senderid, type: 1,
    recipient: '0202388411',
    msg: message,
  })

  // F: flat with "text" instead of "message"
  const f = testMoolre('F — flat: recipient + text', {
    senderid, type: 1,
    recipient: '0202388411',
    text: message,
  })

  // G: flat with "content"
  const g = testMoolre('G — flat: recipient + content', {
    senderid, type: 1,
    recipient: '0202388411',
    content: message,
  })

  // H: flat with "sms" as the message content key
  const h = testMoolre('H — flat: recipient + sms', {
    senderid, type: 1,
    recipient: '0202388411',
    sms: message,
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
  })
  console.log(`[SMS Test] 🏆 ${winner ? winner.label : 'No winner'}`)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({ winner: winner?.label || null, results: summary })
}
