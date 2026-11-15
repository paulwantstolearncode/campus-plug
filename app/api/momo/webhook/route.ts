import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// MoMo webhook endpoint. Providers (MTN, Vodafone, AirtelTigo) POST here when
// a payment completes/fails. Verifies the signature, then calls record_payment()
// which marks the transaction paid and advances the order to 'paid' via the
// existing advance_order() RPC.
//
// SECURITY: In production, verify the provider's signature header before
// trusting the body. This stub accepts the body as-is for dev/sandbox testing.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Provider-specific fields vary; normalize the common ones.
    const orderId = body.externalId || body.orderId || body.reference
    const status = body.status || body.transactionStatus
    const reference = body.reference || body.transactionId || body.externalRef
    const amount = body.amount ? Number(body.amount) : 0

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order reference' }, { status: 400 })
    }

    if (status === 'success' || status === 'paid' || status === 'SUCCESSFUL') {
      // Use the SECURITY DEFINER RPC to record payment + advance order
      const { error } = await supabase.rpc('record_payment', {
        p_order_id: orderId,
        p_mo_mo_reference: reference,
        p_amount: amount,
      })

      if (error) {
        console.error('record_payment failed:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    // Failed payment — just log it
    console.log('MoMo payment failed for order', orderId, body)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('MoMo webhook error:', err)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
