import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Temporary diagnostic endpoint — tests Moolre auth variations against
 * the official API spec. DELETE after confirming VASKEY works.
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
  const vaskey = (process.env.MOOLRE_SECRET_KEY || '').trim()
  const publicKey = (process.env.MOOLRE_PUBLIC_KEY || '').trim()
  const accountNo = (process.env.MOOLRE_ACCOUNT_NO || '10991106074918').trim()
  const senderId = (process.env.MOOLRE_SENDER_ID || 'CampusPlug').trim()
  const recipient = '0202388411'
  const message = 'Campus Plug Sweep Test'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)
  console.log(`[SMS Test] Starting Moolre auth sweep`)
  console.log(`[SMS Test] VASKEY (secret):`, vaskey.slice(0, 8) + '...')
  console.log(`[SMS Test] Public key:`, publicKey.slice(0, 8) + '...')
  console.log(`[SMS Test] Account:`, accountNo, '| Sender:', senderId)
  console.log(`[SMS Test] Recipient:`, recipient)
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  const baseBody = { account_no: accountNo, sender_id: senderId, recipient, message }

  // ── V0: OFFICIAL SPEC — X-API-VASKEY header (this is what docs say) ────
  const v0 = testMoolre(
    'V0 — X-API-VASKEY (OFFICIAL)',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    baseBody
  )

  // ── V1: X-API-VASKEY + type:text ───────────────────────────────────────
  const v1 = testMoolre(
    'V1 — X-API-VASKEY + type:text',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    { ...baseBody, type: 'text' }
  )

  // ── V2: X-API-VASKEY + recipient international format ──────────────────
  const v2 = testMoolre(
    'V2 — X-API-VASKEY + 233XXXXXXXXX',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    { ...baseBody, recipient: '233' + recipient.slice(1) }
  )

  // ── V3: X-Api-Key: vaskey (old format) ─────────────────────────────────
  const v3 = testMoolre(
    'V3 — X-Api-Key: vaskey (old)',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-Api-Key': vaskey },
    baseBody
  )

  // ── V4: Bearer vaskey ──────────────────────────────────────────────────
  const v4 = testMoolre(
    'V4 — Bearer vaskey',
    Endpoint,
    { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vaskey}` },
    baseBody
  )

  // ── V5: X-API-VASKEY + public key in body ──────────────────────────────
  const v5 = testMoolre(
    'V5 — X-API-VASKEY + public_key in body',
    Endpoint,
    { 'Content-Type': 'application/json', 'X-API-VASKEY': vaskey },
    { ...baseBody, public_key: publicKey }
  )

  // ── V6: No auth header, key in body ────────────────────────────────────
  const v6 = testMoolre(
    'V6 — No auth header, key in body',
    Endpoint,
    { 'Content-Type': 'application/json' },
    { ...baseBody, key: vaskey, api_key: vaskey }
  )

  // ── V7: Query param ?key=vaskey ────────────────────────────────────────
  const v7 = testMoolre(
    'V7 — ?key=vaskey',
    `${Endpoint}?key=${encodeURIComponent(vaskey)}`,
    { 'Content-Type': 'application/json' },
    baseBody
  )

  // Run all 8 in parallel
  const results = await Promise.all([v0, v1, v2, v3, v4, v5, v6, v7])

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
    console.log(`[SMS Test] ⚠ No variation succeeded`)
  }
  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  return NextResponse.json({
    config: {
      hasVaskey: !!vaskey,
      vaskeyPrefix: vaskey.slice(0, 8),
      hasPublicKey: !!publicKey,
      publicKeyPrefix: publicKey.slice(0, 8),
      accountNo,
      senderId,
      recipient,
    },
    results: summary,
  })
}
