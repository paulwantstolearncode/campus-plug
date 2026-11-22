// Client-safe Mobile Money helpers.
//
// Everything here runs in the browser: provider detection, labels and URLs.
// The actual provider calls (request-to-pay, status, payout, refund) live in
// `lib/momoServer.ts` and are only reachable through app/api/momo/*. That split
// exists because provider keys are not NEXT_PUBLIC_* and therefore never exist
// in a client bundle — the old browser-side momoCheckout() could only ever run
// its simulated branch in production.

export type MomoProvider = 'mtn' | 'vodafone' | 'airteltigo'
export type MomoStatus = 'pending' | 'paid' | 'released' | 'refund_pending' | 'refunded' | 'failed'

export const MOMO_PROVIDER_LABELS: Record<MomoProvider, string> = {
  mtn: 'MTN Mobile Money',
  vodafone: 'Telecel Cash (Vodafone)',
  airteltigo: 'AT Money (AirtelTigo)',
}

/**
 * Guess the network from a Ghanaian number.
 *
 * 020 is shared in practice (originally Vodafone, now also issued by MTN), so
 * the MTN branch intentionally claims it first. lib/momo.test.ts pins this
 * behaviour; changing the order is a deliberate product decision, not a fix.
 */
export function momoProviderForPhone(phone: string): MomoProvider {
  const digits = phone.replace(/[^0-9]/g, '')
  // MTN Ghana: 024, 054, 055, 059, 020
  if (/^(024|054|055|059|020|23324|23354|23355|23359|23320)/.test(digits)) return 'mtn'
  // Telecel / Vodafone: 050
  if (/^(050|23350)/.test(digits)) return 'vodafone'
  // AT Money / AirtelTigo: 027, 057, 056
  if (/^(027|057|056|23327|23357|23356)/.test(digits)) return 'airteltigo'
  // Default to MTN (largest network in Ghana)
  return 'mtn'
}

export function momoCheckoutUrl(orderId: string): string {
  return '/checkout/' + orderId
}

export function momoDevCompleteUrl(orderId: string, status: 'paid' | 'failed'): string {
  return '/checkout/dev/' + orderId + '?status=' + status
}
