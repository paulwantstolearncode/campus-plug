import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests 8 body payload variations
 * against Moolre using the confirmed X-API-VASKEY header.
 * DELETE after confirming which body shape works.
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
  console.log(`[SMS Test] ═══ ${label} ═══`)
  console.log(`[SMS Test] Body:`, JSON.stringify(body))

  try {
    const res = await fetch(Endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-VASKEY': (process.env.MOOLRE_SECRET_KEY || '').trim(),
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

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '10991106074918').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting Moolre body-payload sweep`)
  console.log(`[SMS Test] VASKEY:`, vaskey.slice(0, 8) + '...')
  console.log(`[SMS Test] Account:`, accountNo, '| Sender:', senderId)
  console.log(`[SMS Test] Endpoint:`, Endpoint)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // All 8 body variations — same header, different payloads
  const bodyA = testMoolre('Body A — Standard', {
    account_no: accountNo,
    sender_id: senderId,
    recipient: '0202388411',
    message: 'Test A',
  })

  const bodyB = testMoolre('Body B — Array recipients', {
    account_no: accountNo,
    sender_id: senderId,
    recipients: ['0202388411'],
    message: 'Test B',
  })

  const bodyC = testMoolre('Body C — No account_no', {
    sender_id: senderId,
    recipient: '0202388411',
    message: 'Test C',
  })

  const bodyD = testMoolre('Body D — sender (not sender_id)', {
    account_no: accountNo,
    sender: senderId,
    recipient: '0202388411',
    message: 'Test D',
  })

  const bodyE = testMoolre('Body E — to (not recipient)', {
    account_no: accountNo,
    sender_id: senderId,
    to: '0202388411',
    message: 'Test E',
  })

  const bodyF = testMoolre('Body F — Intl phone + type:1', {
    account_no: accountNo,
    sender_id: senderId,
    recipient: '233202388411',
    message: 'Test F',
    type: 1,
  })

  const bodyG = testMoolre('Body G — CamelCase', {
    accountNo: accountNo,
    senderId: senderId,
    recipient: '0202388411',
    message: 'Test G',
  })

  const bodyH = testMoolre('Body H — Minimal', {
    sender: senderId,
    to: '0202388411',
    msg: 'Test H',
  })

  // Run all 8 in parallel
  const results = await Promise.all([bodyA, bodyB, bodyC, bodyD, bodyE, bodyF, bodyG, bodyH])

  // Parse and summarize
  const summary = results.map((r) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(r.raw) } catch { /* non-JSON */ }
    const mStatus = parsed.status
    const mCode = parsed.code
    const isSuccess = mStatus === 1 || mStatus === '1' || mCode === 200 || mCode === '200' || parsed.success === true
    return {
      label: r.label,
      httpStatus: r.httpStatus,
      moolreStatus: mStatus,
      moolreCode: mCode,
      moolreMessage: parsed.message,
      success: isSuccess,
      rawBody: r.raw.slice(0, 300),
    }
  })

  const winner = summary.find((s) => s.success)

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] RESULTS:`)
  summary.forEach((s) => {
    const icon = s.success ? '✓' : '✗'
    console.log(`[SMS Test] ${icon} ${s.label} — HTTP ${s.httpStatus} — status:${s.moolreStatus} code:${s.moolreCode} msg:${s.moolreMessage}`)
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
      accountNo,
      senderId,
      endpoint: Endpoint,
    },
    results: summary,
  })
}
