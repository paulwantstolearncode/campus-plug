import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 * Temporary — raw body string test + V1 endpoint retry.
 * DELETE after confirming production flow works.
 */

const VASKEY_ENDPOINT = 'https://api.moolre.com/open/sms/send'

async function testRaw(
  label: string,
  endpoint: string,
  bodyStr: string,
  contentType: string
): Promise<{
  label: string
  httpStatus: number
  raw: string
}> {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-API-VASKEY': vaskey },
      body: bodyStr,
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

  // Raw JSON strings — bypass any serialization
  const rawBodies = [
    ['A — raw string: number in messages[]', VASKEY_ENDPOINT,
      `{"senderid":"${senderid}","type":1,"messages":[{"number":"0202388411","message":"Campus Plug OTP test"}]}`],

    ['B — raw string: mobile in messages[]', VASKEY_ENDPOINT,
      `{"senderid":"${senderid}","type":1,"messages":[{"mobile":"0202388411","message":"Campus Plug OTP test"}]}`],

    ['C — raw string: phone in messages[]', VASKEY_ENDPOINT,
      `{"senderid":"${senderid}","type":1,"messages":[{"phone":"0202388411","message":"Campus Plug OTP test"}]}`],

    ['D — raw string: flat recipient+message', VASKEY_ENDPOINT,
      `{"senderid":"${senderid}","type":1,"recipient":"0202388411","message":"Campus Plug OTP test"}`],

    ['E — raw: messages[] number+message (V1)', 'https://api.moolre.com/v1/sms/send',
      `{"senderid":"${senderid}","type":1,"messages":[{"number":"0202388411","message":"Campus Plug OTP test"}]}`],

    ['F — raw: flat recipient (V1)', 'https://api.moolre.com/v1/sms/send',
      `{"senderid":"${senderid}","type":1,"recipient":"0202388411","message":"Campus Plug OTP test"}`],

    ['G — raw: to flat (V1)', 'https://api.moolre.com/v1/sms/send',
      `{"senderid":"${senderid}","type":1,"to":"0202388411","message":"Campus Plug OTP test"}`],

    ['H — raw: flat with Bearer auth (V1)', 'https://api.moolre.com/v1/sms/send',
      `{"senderid":"${senderid}","type":1,"recipient":"0202388411","message":"Campus Plug OTP test"}`],
  ]

  const results = await Promise.all(
    rawBodies.map(([label, endpoint, body]) =>
      testRaw(label, endpoint, body, 'application/json')
    )
  )

  const summary = results.map((r) => {
    let p: Record<string, unknown> = {}
    try { p = JSON.parse(r.raw) } catch {}
    return {
      label: r.label,
      success: isSuccess(p),
      moolreMessage: p.message,
      moolreData: p.data,
      rawBody: r.raw.slice(0, 500),
    }
  })

  const winner = summary.find((s) => s.success)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  summary.forEach((s) => {
    console.log(`[SMS Test] ${s.success ? '✓ WINNER' : '✗'} ${s.label}`)
    console.log(`[SMS Test]   msg: ${s.moolreMessage} | data: ${s.moolreData}`)
    console.log(`[SMS Test]   raw: ${s.rawBody}`)
  })
  console.log(`[SMS Test] 🏆 ${winner ? winner.label : 'No winner'}`)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({ config: { hasVaskey: !!vaskey, senderid }, winner: winner?.label || null, results: summary })
}
