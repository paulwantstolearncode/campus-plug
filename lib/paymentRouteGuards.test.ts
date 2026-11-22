import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as completeSimulatedPayment } from '@/app/api/dev/complete-payment/route'
import { POST as receiveWebhook } from '@/app/api/momo/webhook/route'

function postRequest(path: string): NextRequest {
  return new NextRequest('http://localhost' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: '00000000-0000-0000-0000-000000000000' }),
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('payment route simulation lockout', () => {
  it('rejects free settlement in production without provider credentials', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MOMO_WEBHOOK_SECRET', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const completion = await completeSimulatedPayment(postRequest('/api/dev/complete-payment'))
    const webhook = await receiveWebhook(postRequest('/api/momo/webhook'))

    expect(completion.status).toBe(404)
    expect(webhook.status).toBe(503)
  })

  it('rejects simulation when only a generic provider is configured', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MOMO_TARGET_ENV', 'sandbox')
    vi.stubEnv('MOMO_WEBHOOK_SECRET', '')
    vi.stubEnv('MOMO_VODAFONE_BASE_URL', 'https://aggregator.example/vodafone')
    vi.stubEnv('MOMO_VODAFONE_API_KEY', 'vodafone-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const completion = await completeSimulatedPayment(postRequest('/api/dev/complete-payment'))
    const webhook = await receiveWebhook(postRequest('/api/momo/webhook'))

    expect(completion.status).toBe(404)
    expect(webhook.status).toBe(503)
  })

  it.each(['MOMO_API_USER', 'MOMO_MTN_BASE_URL'])(
    'rejects simulation for partial MTN configuration %s',
    async (envName) => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('MOMO_TARGET_ENV', 'sandbox')
      vi.stubEnv('MOMO_WEBHOOK_SECRET', '')
      vi.stubEnv(envName, envName === 'MOMO_MTN_BASE_URL' ? 'https://mtn.example' : 'api-user')
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const completion = await completeSimulatedPayment(postRequest('/api/dev/complete-payment'))
      const webhook = await receiveWebhook(postRequest('/api/momo/webhook'))

      expect(completion.status).toBe(404)
      expect(webhook.status).toBe(503)
    }
  )
})
