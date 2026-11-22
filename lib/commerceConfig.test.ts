import { describe, expect, it } from 'vitest'
import {
  COMMISSION_RATE,
  DELIVERY_FEE_GHS,
  HIGH_TICKET_THRESHOLD,
  commission,
} from '@/lib/commerceConfig'

describe('commerce configuration', () => {
  it('centralizes marketplace constants', () => {
    expect(COMMISSION_RATE).toBe(0.08)
    expect(DELIVERY_FEE_GHS).toBe(15)
    expect(HIGH_TICKET_THRESHOLD).toBe(1000)
  })
})

describe('commission', () => {
  it('charges 8% and rounds to two decimals like SQL', () => {
    expect(commission(123.45)).toBe(9.88)
    expect(commission(100)).toBe(8)
    expect(commission(10)).toBe(0.8)
  })

  it('handles null, zero, and numeric strings', () => {
    expect(commission(0)).toBe(0)
    expect(commission(null)).toBe(0)
    expect(commission(undefined)).toBe(0)
    expect(commission('200')).toBe(16)
  })
})
