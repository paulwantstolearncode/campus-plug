import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests body payload variations.
 * Body B shape is confirmed; now testing "messages" vs "message" field.
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
  console.log(`[SMS Test] ═══ ${label} ═══`)
  console.log(`[SMS Test] Body:`, JSON.stringify(body))

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
    console.log(`[SMS Test] ← ${label} — HTTP ${res.status}:`, text)

    return { label, httpStatus: res.status, raw: text }
  } catch (err) {
    const errMsg = `Network error: ${err}`
    console.error(`[SMS Test] ✗ ${label}:`, errMsg)
    return { label, httpStatus: 0, raw: errMsg }
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
  const message = 'Campus Plug OTP body test'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting Moolre body sweep (messages field test)`)
  console.log(`[SMS Test] VASKEY:`, vaskey.slice(0, 8) + '...')
  console.log(`[SMS Test] Sender:`, senderid)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // ── Test "messages" (plural) vs "message" ──────────────────────────────
  const bodyA = testMoolre('A — senderid + messages[] + type:1', {
    senderid,
    messages: [{ phone: '0202388411', message }],
    type: 1,
  })

  const bodyB = testMoolre('B — senderid + recipient + message + type:1', {
    senderid,
    recipient: '0202388411',
    message,
    type: 1,
  })

  const bodyC = testMoolre('C — senderid + messages (string) + type:1', {
    senderid,
    messages: message,
    recipient: '0202388411',
    type: 1,
  })

  const bodyD = testMoolre('D — senderid + message + type:1 (intl)', {
    senderid,
    recipient: '233202388411',
    message,
    type: 1,
  })

  const bodyE = testMoolre('E — senderid + messages[] + type:1 (intl)', {
    senderid,
    messages: [{ phone: '233202388411', message }],
    type: 1,
  })

  const bodyF = testMoolre('F — senderid + messages[] no type', {
    senderid,
    messages: [{ phone: '0202388411', message }],
  })

  const bodyG = testMoolre('G — senderid + msg + type:1', {
    senderid,
    recipient: '0202388411',
    msg: message,
    type: 1,
  })

  const bodyH = testMoolre('H — senderid + text + type:1', {
    senderid,
    recipient: '0202388411',
    text: message,
    type: 1,
  })

  // Run all 8 in parallel
  const results = await Promise.all([bodyA, bodyB, bodyC, bodyD, bodyE, bodyF, bodyG, bodyH])

  // Parse and summarize
  const summary = results.map((r) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(r.raw) } catch { /* non-JSON */ }
    const ok = isSuccess(parsed)
    return {
      label: r.label,
      httpStatus: r.httpStatus,
      moolreStatus: parsed.status,
      moolreCode: parsed.code,
      moolreMessage: parsed.message,
      moolreData: parsed.data,
      success: ok,
      rawBody: r.raw.slice(0, 300),
    }
  })

  const winner = summary.find((s) => s.success)

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] RESULTS:`)
  summary.forEach((s) => {
    const icon = s.success ? '✓ WINNER' : '✗'
    console.log(`[SMS Test] ${icon} ${s.label} — HTTP ${s.httpStatus} — status:${s.moolreStatus} code:${s.moolreCode} msg:${s.moolreMessage} data:${s.moolreData}`)
  })
  if (winner) {
    console.log(`[SMS Test] 🏆 WINNER: ${winner.label}`)
  } else {
    console.log(`[SMS Test] ⚠ No variation succeeded`)
  }
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({
    config: {
      hasVaskey: !!vaskey,
      vaskeyPrefix: vaskey.slice(0, 8),
      senderid,
      endpoint: Endpoint,
    },
    winner: winner ? { label: winner.label, moolreMessage: winner.moolreMessage } : null,
    results: summary,
  })
}
