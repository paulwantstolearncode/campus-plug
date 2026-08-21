import { NextResponse } from 'next/server'

/**
 * GET /api/sms/test-moolre
 *
 * Diagnostic — test the CONFIRMED working Moolre payload shapes:
 * 1. Flat: { senderid, recipient, message, type: 1 }
 * 2. Array: { senderid, type: 1, messages: [{ recipient, message }] }
 *
 * Both shapes now confirmed working in production send-otp route.
 * DELETE after confirming everything is stable.
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
  const message = 'Campus Plug diagnostic test'
  const recipient = '0202388411'

  console.log(`[SMS Test] ═══════════════════════════════════════════════`)

  // Test 1: Flat format (primary in send-otp)
  const a = testMoolre('A — FLAT: {senderid, recipient, message, type:1}', {
    senderid, type: 1, recipient, message,
  })

  // Test 2: Array format (fallback in send-otp) — recipient NOT number
  const b = testMoolre('B — ARRAY: {messages:[{recipient, message}]}', {
    senderid, type: 1,
    messages: [{ recipient, message }],
  })

  // Test 3: Array format with intl phone
  const c = testMoolre('C — ARRAY intl: {messages:[{recipient:"233...", message}]}', {
    senderid, type: 1,
    messages: [{ recipient: '233202388411', message }],
  })

  // Test 4: Flat with intl phone
  const d = testMoolre('D — FLAT intl: {recipient:"233...", message, type:1}', {
    senderid, type: 1, recipient: '233202388411', message,
  })

  const results = await Promise.all([a, b, c, d])

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

  return NextResponse.json({
    config: { hasVaskey: !!vaskey, senderid },
    winner: winner?.label || null,
    results: summary,
  })
}
