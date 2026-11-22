import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  availableProviders,
  isDefiniteMomoRejection,
  isProviderAvailable,
  momoProviderLabel,
  momoSimulated,
  normalizeMomoPhone,
  normalizeMomoStatus,
  requestToPay,
  serviceAppointmentPaymentError,
} from '@/lib/momoServer'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('normalizeMomoPhone', () => {
  it('converts local Ghanaian numbers to the 233 form', () => {
    expect(normalizeMomoPhone('0244123456')).toBe('233244123456')
    expect(normalizeMomoPhone('0504123456')).toBe('233504123456')
  })

  it('keeps numbers already in international form', () => {
    expect(normalizeMomoPhone('233244123456')).toBe('233244123456')
    expect(normalizeMomoPhone('+233 24 412 3456')).toBe('233244123456')
  })

  it('strips punctuation before normalizing', () => {
    expect(normalizeMomoPhone('(024) 412-3456')).toBe('233244123456')
  })
})

describe('provider availability', () => {
  it('simulates when no credentials are configured', () => {
    expect(momoSimulated()).toBe(true)
    expect(availableProviders().map((p) => p.id)).toEqual(['mtn', 'vodafone', 'airteltigo'])
  })

  it('hides providers with no base URL or key once MTN is configured', () => {
    vi.stubEnv('MOMO_API_KEY', 'test-key')
    expect(momoSimulated()).toBe(false)
    expect(isProviderAvailable('mtn')).toBe(true)
    // Vodafone / AirtelTigo need both an endpoint and a key.
    expect(isProviderAvailable('vodafone')).toBe(false)
    expect(isProviderAvailable('airteltigo')).toBe(false)
    expect(availableProviders().map((p) => p.id)).toEqual(['mtn'])
  })

  it('enables a provider once its endpoint and key are set', () => {
    vi.stubEnv('MOMO_API_KEY', 'test-key')
    vi.stubEnv('MOMO_VODAFONE_BASE_URL', 'https://aggregator.example/vodafone')
    vi.stubEnv('MOMO_VODAFONE_API_KEY', 'vodafone-key')
    expect(isProviderAvailable('vodafone')).toBe(true)
    expect(availableProviders().map((p) => p.id)).toContain('vodafone')
  })

  it('fails closed in production when no provider credentials exist', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(momoSimulated()).toBe(false)
    expect(availableProviders()).toEqual([])
  })

  it('never simulates a configured generic provider without an MTN key', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MOMO_VODAFONE_BASE_URL', 'https://aggregator.example/vodafone')
    vi.stubEnv('MOMO_VODAFONE_API_KEY', 'vodafone-key')
    expect(momoSimulated()).toBe(false)
    expect(isProviderAvailable('mtn')).toBe(false)
    expect(isProviderAvailable('vodafone')).toBe(true)
    expect(availableProviders().map((p) => p.id)).toEqual(['vodafone'])
  })

  it('does not use generic-provider configuration as a local simulation fallback', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MOMO_AIRTELTIGO_BASE_URL', 'https://aggregator.example/airteltigo')
    vi.stubEnv('MOMO_AIRTELTIGO_API_KEY', 'airteltigo-key')
    expect(momoSimulated()).toBe(false)
    expect(availableProviders().map((p) => p.id)).toEqual(['airteltigo'])
  })

  it.each([
    'MOMO_API_USER',
    'MOMO_SUBSCRIPTION_KEY',
    'MOMO_MTN_BASE_URL',
    'MOMO_DISBURSEMENT_API_KEY',
    'MOMO_DISBURSEMENT_API_USER',
    'MOMO_DISBURSEMENT_SUBSCRIPTION_KEY',
  ])('disables local simulation for partial MTN setting %s', (envName) => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv(envName, envName === 'MOMO_MTN_BASE_URL' ? 'https://mtn.example' : 'partial-config')
    expect(momoSimulated()).toBe(false)
    expect(availableProviders()).toEqual([])
  })
})

describe('momoProviderLabel', () => {
  it('has a human label for every provider', () => {
    expect(momoProviderLabel('mtn')).toMatch(/MTN/)
    expect(momoProviderLabel('vodafone')).toMatch(/Telecel|Vodafone/)
    expect(momoProviderLabel('airteltigo')).toMatch(/AirtelTigo|AT Money/)
  })
})

describe('provider payment status normalization', () => {
  it('recognizes successful and explicitly unsuccessful callbacks', () => {
    expect(normalizeMomoStatus('SUCCESSFUL')).toBe('paid')
    expect(normalizeMomoStatus('settled')).toBe('paid')
    expect(normalizeMomoStatus('FAILED')).toBe('failed')
    expect(normalizeMomoStatus('declined')).toBe('failed')
    expect(normalizeMomoStatus('expired')).toBe('failed')
  })

  it('keeps unknown or intermediate states pending', () => {
    expect(normalizeMomoStatus('PENDING')).toBe('pending')
    expect(normalizeMomoStatus('processing')).toBe('pending')
    expect(normalizeMomoStatus('timeout')).toBe('pending')
    expect(normalizeMomoStatus(undefined)).toBe('pending')
  })
})

describe('request-to-pay rejection safety', () => {
  function configureGenericProvider() {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MOMO_TARGET_ENV', 'sandbox')
    vi.stubEnv('MOMO_VODAFONE_BASE_URL', 'https://aggregator.example/vodafone')
    vi.stubEnv('MOMO_VODAFONE_API_KEY', 'vodafone-key')
  }

  async function captureRejection(): Promise<unknown> {
    try {
      await requestToPay({
        amount: 25,
        phone: '0244123456',
        provider: 'vodafone',
        description: 'Test order',
        reference: '7d459f7b-6412-4db3-b98f-3e8f20b70930',
      })
      throw new Error('Expected requestToPay to reject')
    } catch (error) {
      return error
    }
  }

  it.each([400, 401, 403, 404, 422])(
    'treats HTTP %i as a definite provider rejection',
    async (httpStatus) => {
      configureGenericProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rejected', { status: httpStatus })))
      const error = await captureRejection()
      expect(isDefiniteMomoRejection(error)).toBe(true)
    }
  )

  it.each([408, 409, 429, 500, 503])(
    'keeps HTTP %i inconclusive so the pending reference is retained',
    async (httpStatus) => {
      configureGenericProvider()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unknown', { status: httpStatus })))
      const error = await captureRejection()
      expect(isDefiniteMomoRejection(error)).toBe(false)
    }
  )

  it('keeps network failures inconclusive', async () => {
    configureGenericProvider()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket reset')))
    const error = await captureRejection()
    expect(isDefiniteMomoRejection(error)).toBe(false)
  })
})

describe('service appointment pre-charge validation', () => {
  const now = Date.parse('2026-11-20T12:00:00.000Z')

  it('rejects an unscheduled service appointment', () => {
    expect(serviceAppointmentPaymentError(
      { kind: 'service', scheduled_for: null },
      now
    )).toMatch(/unscheduled or has already passed/)
  })

  it('rejects past and exactly-current service appointments', () => {
    expect(serviceAppointmentPaymentError(
      { kind: 'service', scheduled_for: '2026-11-20T11:59:59.000Z' },
      now
    )).toBeTruthy()
    expect(serviceAppointmentPaymentError(
      { kind: 'service', scheduled_for: '2026-11-20T12:00:00.000Z' },
      now
    )).toBeTruthy()
  })

  it('rejects an invalid appointment timestamp instead of charging', () => {
    expect(serviceAppointmentPaymentError(
      { kind: 'service', scheduled_for: 'not-a-date' },
      now
    )).toBeTruthy()
  })

  it('allows a future service appointment', () => {
    expect(serviceAppointmentPaymentError(
      { kind: 'service', scheduled_for: '2026-11-20T12:00:01.000Z' },
      now
    )).toBeNull()
  })

  it('does not apply appointment validation to product orders', () => {
    expect(serviceAppointmentPaymentError(
      { kind: 'product', scheduled_for: null },
      now
    )).toBeNull()
  })
})
