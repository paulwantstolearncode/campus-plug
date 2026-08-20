import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests 8 body payload variations
 * with confirmed X-API-VASKEY header and senderid (no underscore).
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

export async function GET() {
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '10991106074918').trim()
  const senderid = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const message = 'Campus Plug OTP body test'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting Moolre body-payload sweep (senderid edition)`)
  console.log(`[SMS Test] VASKEY:`, vaskey.slice(0, 8) + '...')
  console.log(`[SMS Test] Account:`, accountNo, '| Sender:', senderid)
  console.log(`[SMS Test] Endpoint:`, Endpoint)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // All 8 body variations — X-API-VASKEY header, senderid (no underscore), type included
  const bodyA = testMoolre('A — senderid + recipient + type:text', {
    senderid,
    recipient: '0202388411',
    message,
    type: 'text',
  })

  const bodyB = testMoolre('B — senderid + recipient + type:1', {
    senderid,
    recipient: '0202388411',
    message,
    type: 1,
  })

  const bodyC = testMoolre('C — senderid + recipients[] + type:text', {
    senderid,
    recipients: ['0202388411'],
    message,
    type: 'text',
  })

  const bodyD = testMoolre('D — senderid + to + type:text', {
    senderid,
    to: '0202388411',
    message,
    type: 'text',
  })

  const bodyE = testMoolre('E — senderid + intl 233phone + type:text', {
    senderid,
    recipient: '233202388411',
    message,
    type: 'text',
  })

  const bodyF = testMoolre('F — account_no + senderid + recipient + type:text', {
    account_no: accountNo,
    senderid,
    recipient: '0202388411',
    message,
    type: 'text',
  })

  const bodyG = testMoolre('G — accountno + senderid + recipient + type:text', {
    accountno: accountNo,
    senderid,
    recipient: '0202388411',
    message,
    type: 'text',
  })

  const bodyH = testMoolre('H — senderid + recipient + msg + type:text', {
    senderid,
    recipient: '0202388411',
    msg: message,
    type: 'text',
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
      moolreData: parsed.data,
      success: isSuccess,
      rawBody: r.raw.slice(0, 300),
    }
  })

  const winner = summary.find((s) => s.success)

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] RESULTS:`)
  summary.forEach((s) => {
    const icon = s.success ? '✓' : '✗'
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
      accountNo,
      senderid,
      endpoint: Endpoint,
    },
    results: summary,
  })
}
