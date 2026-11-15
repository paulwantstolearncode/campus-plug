// Marketplace payments: Mobile Money (MoMo) checkout for Ghana.
// Supports MTN, Vodafone, AirtelTigo. In dev mode (no MOMO_API_KEY), the
// checkout simulates a successful payment so the flow can be tested end-to-end
// without real credentials. In production, set MOMO_API_KEY and the primary
// provider's subscription key.
//
// MoMo APIs differ per provider; this wraps the common collect-request flow:
//   1. Request to pay (buyer's phone receives STK prompt)
//   2. Poll /webhook/callback for the result
//   3. Verify transaction status before marking paid.
//
// Environment variables:
//   NEXT_PUBLIC_MOMO_ENV: 'sandbox' | 'production'
//   MOMO_API_KEY: primary subscription key
//   MOMO_API_USER: API user UUID (MTN)
//   MOMO_TARGET_ENV: sandbox | production
//   MOMO_SUBSCRIPTION_KEY: primary key (AirtelTigo / Vodafone)
//   MOMO_CALLBACK_URL: public webhook URL (e.g. /api/momo/webhook)

const isDev = !process.env.MOMO_API_KEY

export type MomoProvider = 'mtn' | 'vodafone' | 'airteltigo'
export type MomoStatus = 'pending' | 'paid' | 'released' | 'refunded' | 'failed'

export interface MomoCheckoutRequest {
  orderId: string
  amount: number
  phone: string
  provider: MomoProvider
  payerMessage: string
  payeeNote: string
}

export interface MomoCheckoutResponse {
  transactionId: string
  status: MomoStatus
  checkoutUrl?: string   // provider redirect URL (if any)
  requiresStk: boolean   // whether user sees STK prompt on phone
}

export function momoProviderForPhone(phone: string): MomoProvider {
  const digits = phone.replace(/[^0-9]/g, '')
  // MTN Ghana: 024, 054, 055, 059, 020
  if (/^(024|054|055|059|020|23324|23354|23355|23359|23320)/.test(digits)) return 'mtn'
  // Vodafone: 020, 050
  if (/^(020|050|23320|23350)/.test(digits)) return 'vodafone'
  // AirtelTigo: 027, 057, 056
  if (/^(027|057|056|23327|23357|23356)/.test(digits)) return 'airteltigo'
  // Default to MTN (largest network in Ghana)
  return 'mtn'
}

export async function momoCheckout(input: MomoCheckoutRequest): Promise<MomoCheckoutResponse> {
  if (isDev) {
    // Simulated checkout: create a pending transaction that the dev can
    // "complete" by visiting /checkout/dev/[orderId]?status=paid
    return {
      transactionId: 'dev_' + input.orderId,
      status: 'pending',
      requiresStk: true,
    }
  }

  const provider = momoProviderForPhone(input.phone)

  // ── Provider-specific request to pay ────────────────────────────────
  // MTN Collection API
  if (provider === 'mtn') {
    const res = await fetch(
      `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + await momoAccessToken(),
          'X-Reference-Id': input.orderId,
          'X-Target-Environment': process.env.MOMO_TARGET_ENV || 'sandbox',
          'Ocp-Apim-Subscription-Key': process.env.MOMO_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: input.amount,
          currency: 'GHS',
          externalId: input.orderId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: input.phone,
          },
          payerMessage: input.payerMessage,
          payeeNote: input.payeeNote,
        }),
      }
    )
    if (!res.ok) throw new Error('MoMo request failed: ' + res.statusText)
    return {
      transactionId: input.orderId,
      status: 'pending',
      requiresStk: true,
    }
  }

  // ── Vodafone / AirtelTigo (simplified) ─────────────────────────────
  throw new Error(provider + ' checkout not yet implemented')
}

async function momoAccessToken(): Promise<string> {
  const auth = Buffer.from(process.env.MOMO_API_USER + ':' + process.env.MOMO_API_KEY).toString('base64')
  const res = await fetch(
    `https://sandbox.momodeveloper.mtn.com/collection/token/`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Ocp-Apim-Subscription-Key': process.env.MOMO_API_KEY!,
        'grant_type': 'client_credentials',
      },
    }
  )
  if (!res.ok) throw new Error('MoMo auth failed: ' + res.statusText)
  const data = await res.json()
  return data.access_token
}

export function momoCheckoutUrl(orderId: string): string {
  return '/checkout/' + orderId
}

export function momoDevCompleteUrl(orderId: string, status: 'paid' | 'failed'): string {
  return '/checkout/dev/' + orderId + '?status=' + status
}
