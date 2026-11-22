// Server-only Mobile Money transport.
//
// This module must never be imported from a `use client` component: it reads
// secret env vars and signs provider requests. Client code uses `lib/momo.ts`
// for provider detection and URLs only.
//
// Why this file exists (items 2, 3, 4):
//   * The old checkout called momoCheckout() in the browser. Next only inlines
//     NEXT_PUBLIC_* into client bundles, so MOMO_API_KEY was always undefined
//     there — production could never charge a card. Requests now originate in
//     app/api/momo/initiate.
//   * Sandbox URLs were hardcoded. Every provider now resolves its base URL
//     from env and refuses to run production traffic against a sandbox host.
//   * Vodafone and AirtelTigo used to throw "not yet implemented". They now go
//     through a configurable collect/status/payout contract (see the adapter
//     note below) instead of pretending to be MTN.
//
// Adapter note for Vodafone / AirtelTigo:
//   Ghanaian operators do not publish one stable public developer API; most
//   integrations go through an aggregator. This module therefore sends a small,
//   documented JSON contract:
//       POST {MOMO_<PROVIDER>_BASE_URL}/collect
//       GET  {MOMO_<PROVIDER>_BASE_URL}/collect/{reference}
//       POST {MOMO_<PROVIDER>_BASE_URL}/payout
//   with `Authorization: Bearer {MOMO_<PROVIDER>_API_KEY}`. Point the env var
//   at the operator's or aggregator's endpoint; no code change is needed.
//   In production these two providers stay disabled until BOTH the base URL
//   and the API key are set — the UI hides them rather than failing after the
//   buyer has typed their number.

import { randomUUID } from 'node:crypto'

export type MomoProvider = 'mtn' | 'vodafone' | 'airteltigo'

/**
 * Only a definite provider rejection can retire an intent without provider
 * reconciliation. Network failures, unexpected responses, 409/429 and 5xx
 * responses stay pending because the collection may still have been accepted.
 */
export class MomoRequestError extends Error {
  readonly definiteRejection: boolean

  constructor(message: string, definiteRejection = false) {
    super(message)
    this.name = 'MomoRequestError'
    this.definiteRejection = definiteRejection
  }
}

export function isDefiniteMomoRejection(error: unknown): error is MomoRequestError {
  return error instanceof MomoRequestError && error.definiteRejection
}

function isDefiniteRejectionStatus(status: number): boolean {
  // 408/409/429 are deliberately excluded: a new reference could double-charge.
  return [400, 401, 403, 404, 422].includes(status)
}

const MTN_SANDBOX = 'https://sandbox.momodeveloper.mtn.com'
const MTN_PRODUCTION = 'https://proxy.momoapi.mtn.com'

const PROVIDER_LABELS: Record<MomoProvider, string> = {
  mtn: 'MTN Mobile Money',
  vodafone: 'Telecel Cash (Vodafone)',
  airteltigo: 'AT Money (AirtelTigo)',
}

export function momoProviderLabel(provider: MomoProvider): string {
  return PROVIDER_LABELS[provider]
}

/** True when we are pointed at real money. */
export function momoProduction(): boolean {
  return (
    process.env.MOMO_TARGET_ENV === 'production' ||
    process.env.NEXT_PUBLIC_MOMO_ENV === 'production'
  )
}

function hasProviderConfiguration(): boolean {
  // Partial configuration also fails closed. Otherwise a stray MTN endpoint,
  // API user or subscription key could enable simulated settlement against a
  // shared database even though MOMO_API_KEY itself is absent.
  return !!(
    process.env.MOMO_API_KEY ||
    process.env.MOMO_API_USER ||
    process.env.MOMO_SUBSCRIPTION_KEY ||
    process.env.MOMO_MTN_BASE_URL ||
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MOMO_DISBURSEMENT_API_USER ||
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MOMO_VODAFONE_BASE_URL ||
    process.env.MOMO_VODAFONE_API_KEY ||
    process.env.MOMO_AIRTELTIGO_BASE_URL ||
    process.env.MOMO_AIRTELTIGO_API_KEY
  )
}

/**
 * Simulation is an explicit local-only capability, not a fallback for missing
 * production credentials. Any real provider configuration also disables it so
 * an unsigned callback or dev completion can never settle a real intent.
 */
export function momoSimulated(): boolean {
  const localRuntime = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  return localRuntime && !momoProduction() && !hasProviderConfiguration()
}

function mtnBaseUrl(): string {
  const configured = process.env.MOMO_MTN_BASE_URL?.replace(/\/+$/, '')
  const fallback = momoProduction() ? MTN_PRODUCTION : MTN_SANDBOX
  const base = configured || fallback
  if (momoProduction() && base === MTN_SANDBOX) {
    throw new Error('Refusing to send production MTN traffic to the sandbox host')
  }
  return base
}

function genericProviderBaseUrl(provider: Exclude<MomoProvider, 'mtn'>): string {
  const envName =
    provider === 'vodafone' ? 'MOMO_VODAFONE_BASE_URL' : 'MOMO_AIRTELTIGO_BASE_URL'
  const base = process.env[envName]?.replace(/\/+$/, '')
  if (!base) {
    throw new Error(`${envName} is not configured`)
  }
  return base
}

function genericProviderKey(provider: Exclude<MomoProvider, 'mtn'>): string {
  const envName =
    provider === 'vodafone' ? 'MOMO_VODAFONE_API_KEY' : 'MOMO_AIRTELTIGO_API_KEY'
  const key = process.env[envName]
  if (!key) {
    throw new Error(`${envName} is not configured`)
  }
  return key
}

/** Whether checkout should offer this network at all. */
export function isProviderAvailable(provider: MomoProvider): boolean {
  if (momoSimulated()) return true
  if (provider === 'mtn') return !!process.env.MOMO_API_KEY
  return !!(
    process.env[provider === 'vodafone' ? 'MOMO_VODAFONE_BASE_URL' : 'MOMO_AIRTELTIGO_BASE_URL'] &&
    process.env[provider === 'vodafone' ? 'MOMO_VODAFONE_API_KEY' : 'MOMO_AIRTELTIGO_API_KEY']
  )
}

/** Public capability list for the checkout page. */
export function availableProviders(): { id: MomoProvider; label: string }[] {
  return (Object.keys(PROVIDER_LABELS) as MomoProvider[])
    .filter(isProviderAvailable)
    .map((id) => ({ id, label: PROVIDER_LABELS[id] }))
}

/** Reject invalid service appointments before a provider collection is sent. */
export function serviceAppointmentPaymentError(
  order: { kind: string; scheduled_for: string | null },
  now = Date.now()
): string | null {
  if (order.kind !== 'service') return null
  const scheduledAt = order.scheduled_for ? Date.parse(order.scheduled_for) : NaN
  if (!Number.isFinite(scheduledAt) || scheduledAt <= now) {
    return 'This service appointment is unscheduled or has already passed. Arrange a future appointment before payment.'
  }
  return null
}

/** 0244123456 -> 233244123456, and +233 24 412 3456 -> 233244123456. */
export function normalizeMomoPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.startsWith('233')) return digits
  if (digits.startsWith('0')) return '233' + digits.slice(1)
  return digits
}

// ── MTN access tokens ───────────────────────────────────────────────────────
// Cached until just before expiry; MTN issues ~1h tokens and rejects bursts.

type TokenScope = 'collection' | 'disbursement'

const tokenCache = new Map<TokenScope, { token: string; expiresAt: number }>()

function mtnCredentials(scope: TokenScope) {
  const apiKey = process.env.MOMO_API_KEY
  const apiUser = process.env.MOMO_API_USER
  if (!apiKey || !apiUser) {
    throw new Error('MTN credentials are not configured')
  }
  const subscriptionKey =
    (scope === 'collection'
      ? process.env.MOMO_SUBSCRIPTION_KEY ?? process.env.MOMO_API_KEY
      : process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ??
        process.env.MOMO_SUBSCRIPTION_KEY ??
        process.env.MOMO_API_KEY)!
  const disbursementKey = process.env.MOMO_DISBURSEMENT_API_KEY ?? apiKey
  const disbursementUser = process.env.MOMO_DISBURSEMENT_API_USER ?? apiUser
  return scope === 'collection'
    ? { apiKey, apiUser, subscriptionKey }
    : { apiKey: disbursementKey, apiUser: disbursementUser, subscriptionKey }
}

async function mtnToken(scope: TokenScope): Promise<string> {
  const cached = tokenCache.get(scope)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const { apiKey, apiUser, subscriptionKey } = mtnCredentials(scope)
  const auth = Buffer.from(apiUser + ':' + apiKey).toString('base64')

  const res = await fetch(`${mtnBaseUrl()}/${scope}/token/`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  })

  if (!res.ok) {
    throw new Error(`MTN ${scope} token request failed (${res.status})`)
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error(`MTN ${scope} token response had no access_token`)

  tokenCache.set(scope, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  })
  return data.access_token
}

function mtnTargetEnvironment(): string {
  return momoProduction() ? 'production' : process.env.MOMO_TARGET_ENV || 'sandbox'
}

export interface CollectRequest {
  amount: number
  phone: string
  provider: MomoProvider
  description: string
  /** Optional client-supplied reference; generated when omitted. */
  reference?: string
}

export interface CollectResult {
  reference: string
  simulated: boolean
}

/** Send the request-to-pay (STK prompt). Returns the provider reference. */
export async function requestToPay(input: CollectRequest): Promise<CollectResult> {
  const reference = input.reference ?? randomUUID()

  if (momoSimulated()) {
    return { reference, simulated: true }
  }

  if (input.provider === 'mtn') {
    const token = await mtnToken('collection')
    const { subscriptionKey } = mtnCredentials('collection')
    const res = await fetch(`${mtnBaseUrl()}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Reference-Id': reference,
        'X-Target-Environment': mtnTargetEnvironment(),
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amount.toFixed(2),
        currency: 'GHS',
        externalId: reference,
        payer: {
          partyIdType: 'MSISDN',
          partyId: normalizeMomoPhone(input.phone),
        },
        payerMessage: 'Campus Plug order',
        payeeNote: input.description.slice(0, 100),
      }),
    })

    if (res.status !== 202) {
      const message = `MTN request-to-pay failed (${res.status})`
      throw new MomoRequestError(
        message,
        !res.ok && isDefiniteRejectionStatus(res.status)
      )
    }
    return { reference, simulated: false }
  }

  // Vodafone / AirtelTigo adapter (see the note at the top of this file).
  const base = genericProviderBaseUrl(input.provider)
  const res = await fetch(`${base}/collect`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + genericProviderKey(input.provider),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amount.toFixed(2),
      currency: 'GHS',
      msisdn: normalizeMomoPhone(input.phone),
      reference,
      description: input.description.slice(0, 100),
      callbackUrl: process.env.MOMO_CALLBACK_URL || undefined,
    }),
  })

  if (!res.ok) {
    throw new MomoRequestError(
      `${momoProviderLabel(input.provider)} request-to-pay failed (${res.status})`,
      isDefiniteRejectionStatus(res.status)
    )
  }
  return { reference, simulated: false }
}

export type ProviderPaymentStatus = 'pending' | 'paid' | 'failed'

export function normalizeMomoStatus(raw: unknown): ProviderPaymentStatus {
  const value = String(raw ?? '').trim().toLowerCase()
  if (['successful', 'success', 'paid', 'completed', 'complete', 'settled'].includes(value)) {
    return 'paid'
  }
  if (
    ['failed', 'failure', 'rejected', 'declined', 'cancelled', 'canceled', 'expired']
      .includes(value)
  ) {
    return 'failed'
  }
  return 'pending'
}

/** Ask the provider what happened to a request-to-pay (item 5). */
export async function paymentStatus(
  reference: string,
  provider: MomoProvider
): Promise<ProviderPaymentStatus> {
  if (momoSimulated()) return 'pending'

  if (provider === 'mtn') {
    const token = await mtnToken('collection')
    const { subscriptionKey } = mtnCredentials('collection')
    const res = await fetch(
      `${mtnBaseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Target-Environment': mtnTargetEnvironment(),
          'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
      }
    )
    if (res.status === 404) return 'pending'
    if (!res.ok) throw new Error(`MTN status check failed (${res.status})`)
    const data = (await res.json()) as { status?: string }
    return normalizeMomoStatus(data.status)
  }

  const base = genericProviderBaseUrl(provider)
  const res = await fetch(`${base}/collect/${encodeURIComponent(reference)}`, {
    headers: { Authorization: 'Bearer ' + genericProviderKey(provider) },
  })
  if (res.status === 404) return 'pending'
  if (!res.ok) throw new Error(`${momoProviderLabel(provider)} status check failed (${res.status})`)
  const data = (await res.json()) as { status?: string }
  return normalizeMomoStatus(data.status)
}

export interface TransferRequest {
  amount: number
  phone: string
  provider: MomoProvider
  description: string
  reference?: string
}

export interface TransferResult {
  reference: string
  simulated: boolean
}

/** Pay money OUT of the platform (seller payout or buyer refund). */
export async function disburse(input: TransferRequest): Promise<TransferResult> {
  const reference = input.reference ?? randomUUID()

  if (momoSimulated()) {
    return { reference, simulated: true }
  }

  if (input.provider === 'mtn') {
    const token = await mtnToken('disbursement')
    const { subscriptionKey } = mtnCredentials('disbursement')
    const res = await fetch(`${mtnBaseUrl()}/disbursement/v1_0/transfer`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Reference-Id': reference,
        'X-Target-Environment': mtnTargetEnvironment(),
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amount.toFixed(2),
        currency: 'GHS',
        externalId: reference,
        payee: {
          partyIdType: 'MSISDN',
          partyId: normalizeMomoPhone(input.phone),
        },
        payerMessage: 'Campus Plug payout',
        payeeNote: input.description.slice(0, 100),
      }),
    })

    if (res.status !== 202 && !res.ok) {
      throw new Error(`MTN disbursement failed (${res.status})`)
    }
    return { reference, simulated: false }
  }

  const base = genericProviderBaseUrl(input.provider)
  const res = await fetch(`${base}/payout`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + genericProviderKey(input.provider),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amount.toFixed(2),
      currency: 'GHS',
      msisdn: normalizeMomoPhone(input.phone),
      reference,
      description: input.description.slice(0, 100),
    }),
  })

  if (!res.ok) {
    throw new Error(`${momoProviderLabel(input.provider)} payout failed (${res.status})`)
  }
  return { reference, simulated: false }
}

/**
 * Confirm a transfer we already submitted. A 202 from the payout endpoint means
 * "accepted", not "paid" — this is how the admin re-checks a processing payout.
 */
export async function disbursementStatus(
  reference: string,
  provider: MomoProvider
): Promise<ProviderPaymentStatus> {
  if (momoSimulated()) return 'paid'

  if (provider === 'mtn') {
    const token = await mtnToken('disbursement')
    const { subscriptionKey } = mtnCredentials('disbursement')
    const res = await fetch(
      `${mtnBaseUrl()}/disbursement/v1_0/transfer/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Target-Environment': mtnTargetEnvironment(),
          'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
      }
    )
    if (res.status === 404) return 'pending'
    if (!res.ok) throw new Error(`MTN transfer status failed (${res.status})`)
    const data = (await res.json()) as { status?: string }
    return normalizeMomoStatus(data.status)
  }

  const base = genericProviderBaseUrl(provider)
  const res = await fetch(`${base}/payout/${encodeURIComponent(reference)}`, {
    headers: { Authorization: 'Bearer ' + genericProviderKey(provider) },
  })
  if (res.status === 404) return 'pending'
  if (!res.ok) throw new Error(`${momoProviderLabel(provider)} payout status failed (${res.status})`)
  const data = (await res.json()) as { status?: string }
  return normalizeMomoStatus(data.status)
}

export interface RefundResult {
  reference: string
  simulated: boolean
}

/** Confirm a refund we already submitted (MTN only). */
export async function refundStatus(reference: string): Promise<ProviderPaymentStatus> {
  if (momoSimulated()) return 'paid'

  const token = await mtnToken('collection')
  const { subscriptionKey } = mtnCredentials('collection')
  const res = await fetch(
    `${mtnBaseUrl()}/collection/v1_0/refund/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Target-Environment': mtnTargetEnvironment(),
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    }
  )
  if (res.status === 404) return 'pending'
  if (!res.ok) throw new Error(`MTN refund status failed (${res.status})`)
  const data = (await res.json()) as { status?: string }
  return normalizeMomoStatus(data.status)
}

/**
 * Refund an MTN collection back to the payer using the original payment
 * reference. Other providers return an explicit "unsupported" so the caller can
 * fall back to disburse() (a transfer to the buyer's wallet).
 */
export async function refundCollection(input: {
  originalReference: string
  amount: number
  provider: MomoProvider
}): Promise<RefundResult> {
  if (momoSimulated()) {
    return { reference: 'dev_refund_' + input.originalReference, simulated: true }
  }

  if (input.provider !== 'mtn') {
    throw new Error('Refund API is only available on MTN; use disburse() instead')
  }

  const reference = randomUUID()
  const token = await mtnToken('collection')
  const { subscriptionKey } = mtnCredentials('collection')

  const res = await fetch(
    `${mtnBaseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(input.originalReference)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Reference-Id': reference,
        'X-Target-Environment': mtnTargetEnvironment(),
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amount.toFixed(2),
        currency: 'GHS',
        externalId: reference,
        payerMessage: 'Campus Plug refund',
        payeeNote: 'Campus Plug order refund',
      }),
    }
  )

  if (res.status !== 202 && !res.ok) {
    throw new Error(`MTN refund failed (${res.status})`)
  }
  return { reference, simulated: false }
}
