import { describe, it, expect, vi } from 'vitest'

// lib/orders.ts imports the Supabase browser client at module load. Mock it so
// the pure transition logic can be tested in Node without env vars / a DOM.
const { disputeResult } = vi.hoisted(() => ({
  disputeResult: { data: null as { id: string } | null, error: null as { message: string } | null },
}))

vi.mock('@/lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => disputeResult,
  }
  return { supabase: { from: () => chain } }
})

import { canAdvance, hasOpenDispute, orderActionLabel, orderStatusLabel, type Order } from '@/lib/orders'

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    buyer_id: 'buyer-1',
    buyer_whatsapp: null,
    buyer_name: null,
    seller_id: 'seller-1',
    listing_id: 'listing-1',
    kind: 'product',
    amount: 100,
    status: 'awaiting_payment',
    payment_method: 'prepaid',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    scheduled_for: null,
    ...overrides,
  }
}

const BUYER = 'buyer-1'
const SELLER = 'seller-1'

describe('orderStatusLabel', () => {
  it('maps every canonical status to a human label', () => {
    expect(orderStatusLabel('awaiting_payment')).toBe('Awaiting payment')
    expect(orderStatusLabel('paid')).toBe('Paid')
    expect(orderStatusLabel('collecting')).toBe('Collecting')
    expect(orderStatusLabel('out_for_delivery')).toBe('Out for delivery')
    expect(orderStatusLabel('delivered')).toBe('Delivered')
    expect(orderStatusLabel('confirmed')).toBe('Confirmed')
    expect(orderStatusLabel('disputed')).toBe('Disputed')
    expect(orderStatusLabel('refunded')).toBe('Refunded')
  })

  it('uses service-specific booking labels without a separate status flow', () => {
    expect(orderStatusLabel('awaiting_payment', 'service')).toBe('Awaiting payment')
    expect(orderStatusLabel('paid', 'service')).toBe('Booking confirmed')
    expect(orderStatusLabel('delivered', 'service')).toBe('Service delivered')
    expect(orderActionLabel('confirmed', 'service')).toBe('Confirm service')
  })

  it('passes unknown statuses through', () => {
    expect(orderStatusLabel('weird')).toBe('weird')
  })
})

describe('canAdvance — canonical fulfillment', () => {
  it('allows only MoMo settlement to move awaiting_payment to paid', () => {
    expect(canAdvance(makeOrder(), SELLER, 'paid')).toBe(false)
    expect(canAdvance(makeOrder(), BUYER, 'paid')).toBe(false)
  })

  it('allows the seller to follow each fulfillment step for products and services', () => {
    for (const kind of ['product', 'service'] as const) {
      expect(canAdvance(makeOrder({ kind, status: 'paid' }), SELLER, 'collecting')).toBe(true)
      expect(canAdvance(makeOrder({ kind, status: 'collecting' }), SELLER, 'out_for_delivery')).toBe(true)
      expect(canAdvance(makeOrder({ kind, status: 'out_for_delivery' }), SELLER, 'delivered')).toBe(true)
    }
  })

  it('lets only the buyer confirm after delivery', () => {
    expect(canAdvance(makeOrder({ status: 'delivered' }), BUYER, 'confirmed')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'delivered' }), SELLER, 'confirmed')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'out_for_delivery' }), BUYER, 'confirmed')).toBe(false)
  })

  it('allows either participant to dispute only after delivery', () => {
    expect(canAdvance(makeOrder({ status: 'delivered' }), BUYER, 'disputed')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'delivered' }), SELLER, 'disputed')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'paid' }), BUYER, 'disputed')).toBe(false)
  })

  it('rejects fulfillment skips and manual payment confirmation', () => {
    expect(canAdvance(makeOrder(), SELLER, 'collecting')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'paid' }), SELLER, 'out_for_delivery')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'collecting' }), SELLER, 'delivered')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'awaiting_payment', payment_method: 'pay_on_delivery' }), SELLER, 'paid')).toBe(false)
  })
})

describe('canAdvance — cancellation and terminal states', () => {
  it('allows either participant to cancel only before collection', () => {
    expect(canAdvance(makeOrder(), BUYER, 'cancelled')).toBe(true)
    expect(canAdvance(makeOrder(), SELLER, 'cancelled')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'paid' }), BUYER, 'cancelled')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'paid' }), SELLER, 'cancelled')).toBe(true)
    expect(canAdvance(makeOrder({ status: 'collecting' }), BUYER, 'cancelled')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'delivered' }), BUYER, 'cancelled')).toBe(false)
  })

  it('rejects every transition out of a terminal or dispute state', () => {
    for (const status of ['confirmed', 'cancelled', 'disputed', 'refunded'] as const) {
      expect(canAdvance(makeOrder({ status }), BUYER, 'confirmed')).toBe(false)
      expect(canAdvance(makeOrder({ status }), SELLER, 'collecting')).toBe(false)
    }
  })
})

describe('canAdvance — guards', () => {
  it('rejects non-parties, null buyers, and no-op transitions', () => {
    expect(canAdvance(makeOrder(), 'stranger', 'cancelled')).toBe(false)
    expect(canAdvance(makeOrder({ buyer_id: null }), BUYER, 'cancelled')).toBe(false)
    expect(canAdvance(makeOrder({ status: 'paid' }), SELLER, 'paid')).toBe(false)
  })

  it('freezes every participant transition while a dispute is open', () => {
    const delivered = makeOrder({ status: 'delivered' })
    expect(canAdvance(delivered, BUYER, 'confirmed', true)).toBe(false)
    expect(canAdvance(delivered, BUYER, 'disputed', true)).toBe(false)
    expect(canAdvance(makeOrder({ status: 'paid' }), SELLER, 'collecting', true)).toBe(false)
    expect(canAdvance(delivered, BUYER, 'confirmed', false)).toBe(true)
  })
})

describe('hasOpenDispute', () => {
  it('returns true when an open dispute row exists', async () => {
    disputeResult.data = { id: 'dispute-1' }
    disputeResult.error = null
    await expect(hasOpenDispute('order-1')).resolves.toBe(true)
  })

  it('returns false when there is no open dispute', async () => {
    disputeResult.data = null
    disputeResult.error = null
    await expect(hasOpenDispute('order-1')).resolves.toBe(false)
  })

  it('fails open (false) when the lookup errors', async () => {
    disputeResult.data = null
    disputeResult.error = { message: 'network' }
    await expect(hasOpenDispute('order-1')).resolves.toBe(false)
  })
})
