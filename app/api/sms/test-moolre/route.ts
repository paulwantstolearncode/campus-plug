import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests 8 Moolre auth variations against
 * https://api.moolre.com/open/sms/send to find which one works.
 * DELETE after confirming which strategy succeeds.
 */

const Endpoint = 'https://api.moolre.com/open/sms/send'

async function testMoolre(
  label: string,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<{
  label: string
  url: string
  httpStatus: number
  body: string
  sentHeaders: Record<string, string>
}> {
  console.log(`[SMS Test] ═══ ${label} ═══`)
  console.log(`[SMS Test] URL:`, url)
  console.log(`[SMS Test] Headers:`, JSON.stringify(headers))
  console.log(`[SMS Test] Body:`, JSON.stringify(body))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const text = await res.text()
    console.log(`[SMS Test] ← ${label} — HTTP ${res.status}:`, text)

    return { label, url, httpStatus: res.status, body: text, sentHeaders: headers }
  } catch (err) {
    const errMsg = `Network error: ${err}`
    console.error(`[SMS Test] ✗ ${label}:`, errMsg)
    return { label, url, httpStatus: 0, body: errMsg, sentHeaders: headers }
  }
}

export async function GET() {
  const publicKey = (process.env.MOOLRE_PUBLIC_KEY || '').trim()
  const privateKey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const callbackSecret = 'd78a0c19-b04d-4157-a009-248bc464a371'
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '10991106074918').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const recipient = '0202388411'
  const recipientIntl = '233202388411'
  const message = 'Campus Plug Sweep Test'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting 8-variation Moolre sweep`)
  console.log(`[SMS Test] Public key:`, publicKey.slice(0, 8) + '...')
  console.log(`[SMS Test] Private key:`, privateKey.slice(0, 8) + '...')
  console.log(`[SMS Test] Callback secret:`, callbackSecret)
  console.log(`[SMS Test] Account:`, accountNo, '| Sender:', senderId)
  console.log(`[SMS Test] Recipient:`, recipient)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  const baseBody = { account_no: accountNo, sender_id: senderId, recipient, message }

  // ── V1: Public Key Header ──────────────────────────────────────────────
  const v1 = testMoolre(
    'V1 — X-Api-Key: publicKey',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-Api-Key': publicKey },
    baseBody
  )

  // ── V2: Callback Secret Header ─────────────────────────────────────────
  const v2 = testMoolre(
    'V2 — X-Api-Key: callbackSecret + X-Secret-Key: callbackSecret',
    Endpoint,
    {
      'Content-Type': 'application/json',
      'X-Api-Key': callbackSecret,
      'X-Secret-Key': callbackSecret,
    },
    baseBody
  )

  // ── V3: Basic Auth base64(publicKey:privateKey) ────────────────────────
  const basicAuth = Buffer.from(publicKey + ':' + privateKey).toString('base64')
  const v3 = testMoolre(
    'V3 — Basic Auth base64(publicKey:privateKey)',
    Endpoint,
    {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
    baseBody
  )

  // ── V4: Query Parameter ?key=privateKey ────────────────────────────────
  const v4 = testMoolre(
    'V4 — ?key=privateKey',
    `${Endpoint}?key=${encodeURIComponent(privateKey)}`,
    { 'Content-Type': 'application/json' },
    baseBody
  )

  // ── V5: Query Parameter ?key=publicKey ─────────────────────────────────
  const v5 = testMoolre(
    'V5 — ?key=publicKey',
    `${Endpoint}?key=${encodeURIComponent(publicKey)}`,
    { 'Content-Type': 'application/json' },
    baseBody
  )

  // ── V6: Query Parameter ?token=publicKey ───────────────────────────────
  const v6 = testMoolre(
    'V6 — ?token=publicKey',
    `${Endpoint}?token=${encodeURIComponent(publicKey)}`,
    { 'Content-Type': 'application/json' },
    baseBody
  )

  // ── V7: Bearer Token = JWT Public Key ──────────────────────────────────
  const v7 = testMoolre(
    'V7 — Bearer publicKey (JWT)',
    Endpoint,
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicKey}`,
    },
    baseBody
  )

  // ── V8: Both Keys in Header ────────────────────────────────────────────
  const v8 = testMoolre(
    'V8 — X-Public-Key + X-Private-Key',
    Endpoint,
    {
      'Content-Type': 'application/json',
      'X-Public-Key': publicKey,
      'X-Private-Key': privateKey,
    },
    baseBody
  )

  // Run all 8 in parallel
  const results = await Promise.all([v1, v2, v3, v4, v5, v6, v7, v8])

  // Parse and summarize
  const summary = results.map((r) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(r.body) } catch { /* non-JSON */ }
    const mStatus = parsed.status
    const mCode = parsed.code
    const isSuccess = mStatus === 1 || mStatus === '1' || mCode === 200 || mCode === '200' || parsed.success === true
    return {
      label: r.label,
      url: r.url,
      httpStatus: r.httpStatus,
      moolreStatus: mStatus,
      moolreCode: mCode,
      moolreMessage: parsed.message,
      success: isSuccess,
      rawBody: r.body.slice(0, 300),
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
    console.log(`[SMS Test] ⚠ No variation succeeded — check keys in Vercel`)
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
      recipient,
    },
    results: summary,
  })
}
