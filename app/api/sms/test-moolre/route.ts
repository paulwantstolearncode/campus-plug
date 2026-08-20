import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests 5 Moolre auth strategies in parallel
 * to find the one that works. DELETE after confirming which strategy succeeds.
 */

const TestRecipient = '0593759569'
const TestRecipientIntl = '233593759569'

async function testMoolre(
  label: string,
  endpoint: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{ label: string; endpoint: string; status: number; body: string; headers: Record<string, string> }> {
  console.log(`[SMS Test] ═══ ${label} ═══`)
  console.log(`[SMS Test] URL:`, endpoint)
  console.log(`[SMS Test] Headers:`, JSON.stringify(headers))
  console.log(`[SMS Test] Body:`, JSON.stringify(body))

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const text = await res.text()
    console.log(`[SMS Test] ← ${label} — HTTP ${res.status}:`, text)

    return { label, endpoint, status: res.status, body: text, headers }
  } catch (err) {
    const errMsg = `Network error: ${err}`
    console.error(`[SMS Test] ✗ ${label}:`, errMsg)
    return { label, endpoint, status: 0, body: errMsg, headers }
  }
}

export async function GET() {
  const publicKey = (process.env.MOOLRE_PUBLIC_KEY || '').trim()
  const privateKey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting 5-strategy Moolre test`)
  console.log(`[SMS Test] Public key:`, publicKey.slice(0, 8) + '...')
  console.log(`[SMS Test] Private key:`, privateKey.slice(0, 8) + '...')
  console.log(`[SMS Test] Account:`, accountNo, '| Sender:', senderId)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // ── Strategy 1: Public Bearer + Body Private Key ───────────────────────
  const test1 = testMoolre(
    'Strategy 1 — Public Bearer + Body Private Key',
    'https://api.moolre.com/open/sms/send',
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicKey}`,
    },
    {
      account_no: accountNo,
      sender_id: senderId,
      recipient: TestRecipient,
      message: 'Campus Plug diagnostic test — Strategy 1',
      type: 'text',
      key: privateKey,
    }
  )

  // ── Strategy 2: X-Api-Key + X-Public-Key Headers ───────────────────────
  const test2 = testMoolre(
    'Strategy 2 — X-Api-Key + X-Public-Key Headers',
    'https://api.moolre.com/open/sms/send',
    {
      'Content-Type': 'application/json',
      'X-Api-Key': privateKey,
      'X-Public-Key': publicKey,
    },
    {
      account_no: accountNo,
      sender_id: senderId,
      recipient: TestRecipient,
      message: 'Campus Plug diagnostic test — Strategy 2',
      type: 'text',
    }
  )

  // ── Strategy 3: All Keys in Body (pubkey & privkey) ────────────────────
  const test3 = testMoolre(
    'Strategy 3 — All Keys in Body (pubkey & privkey)',
    'https://api.moolre.com/open/sms/send',
    {
      'Content-Type': 'application/json',
    },
    {
      pubkey: publicKey,
      privkey: privateKey,
      account_no: accountNo,
      sender_id: senderId,
      recipient: TestRecipient,
      message: 'Campus Plug diagnostic test — Strategy 3',
    }
  )

  // ── Strategy 4: V1 Endpoint with Bearer Private Key ────────────────────
  const test4 = testMoolre(
    'Strategy 4 — V1 Endpoint + Bearer Private Key',
    'https://api.moolre.com/v1/sms/send',
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${privateKey}`,
    },
    {
      account_no: accountNo,
      sender_id: senderId,
      recipient: TestRecipientIntl,
      message: 'Campus Plug diagnostic test — Strategy 4',
    }
  )

  // ── Strategy 5: App Endpoint with X-Secret-Key + Body Key ──────────────
  const test5 = testMoolre(
    'Strategy 5 — App Endpoint + X-Secret-Key + Body Key',
    'https://app.moolre.com/open/sms/send',
    {
      'Content-Type': 'application/json',
      'X-Secret-Key': privateKey,
    },
    {
      account_no: accountNo,
      sender_id: senderId,
      recipient: TestRecipient,
      message: 'Campus Plug diagnostic test — Strategy 5',
      key: privateKey,
    }
  )

  // Run all 5 in parallel
  const results = await Promise.all([test1, test2, test3, test4, test5])

  // Summary
  const summary = results.map((r) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(r.body) } catch { /* non-JSON */ }
    const mStatus = parsed.status
    const mCode = parsed.code
    const isSuccess = mStatus === 1 || mStatus === '1' || mCode === 200 || mCode === '200' || parsed.success === true
    return {
      label: r.label,
      endpoint: r.endpoint,
      httpStatus: r.status,
      moolreStatus: mStatus,
      moolreCode: mCode,
      success: isSuccess,
      rawBody: r.body.slice(0, 200),
    }
  })

  const winner = summary.find((s) => s.success)

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] RESULTS:`)
  summary.forEach((s) => {
    const icon = s.success ? '✓' : '✗'
    console.log(`[SMS Test] ${icon} ${s.label} — HTTP ${s.httpStatus} — status:${s.moolreStatus} code:${s.moolreCode}`)
  })
  if (winner) {
    console.log(`[SMS Test] 🏆 WINNER: ${winner.label}`)
  } else {
    console.log(`[SMS Test] ⚠ No strategy succeeded`)
  }
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({
    config: {
      hasPublicKey: !!publicKey,
      publicKeyPrefix: publicKey.slice(0, 8),
      hasPrivateKey: !!privateKey,
      privateKeyPrefix: privateKey.slice(0, 8),
      accountNo,
      senderId,
    },
    results: summary,
  })
}
