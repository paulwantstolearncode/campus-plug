import { describe, it, expect } from 'vitest'
import {
  formatPrice,
  getPriceRange,
  formatPriceRange,
  formatListingPrice,
} from '@/lib/format'

describe('formatPrice', () => {
  it('formats whole numbers with thousands separators and GH₵', () => {
    expect(formatPrice(2500)).toBe('GH₵ 2,500')
    expect(formatPrice(80)).toBe('GH₵ 80')
  })

  it('treats nullish values as zero', () => {
    expect(formatPrice(0)).toBe('GH₵ 0')
    expect(formatPrice(null)).toBe('GH₵ 0')
    expect(formatPrice(undefined)).toBe('GH₵ 0')
  })

  it('accepts numeric strings (NUMERIC columns come back as strings)', () => {
    expect(formatPrice('1500')).toBe('GH₵ 1,500')
  })
})

describe('getPriceRange', () => {
  it('returns null for empty / nullish bundles', () => {
    expect(getPriceRange([])).toBeNull()
    expect(getPriceRange(null)).toBeNull()
    expect(getPriceRange(undefined)).toBeNull()
  })

  it('returns min and max across items', () => {
    expect(getPriceRange([{ price: 100 }, { price: 30 }, { price: 80 }])).toEqual({
      min: 30,
      max: 100,
    })
  })
})

describe('formatPriceRange', () => {
  it('collapses to a single price when all items match', () => {
    expect(formatPriceRange([{ price: 80 }, { price: 80 }])).toBe('GH₵ 80')
  })

  it('uses a compact en-dash range otherwise', () => {
    expect(formatPriceRange([{ price: 30 }, { price: 100 }])).toBe('GH₵ 30–100')
  })

  it('returns null with no items', () => {
    expect(formatPriceRange([])).toBeNull()
  })
})

describe('formatListingPrice', () => {
  it('returns GH₵ 0 for null/undefined', () => {
    expect(formatListingPrice(null)).toBe('GH₵ 0')
    expect(formatListingPrice(undefined)).toBe('GH₵ 0')
  })

  it('shows a single price when no max', () => {
    expect(formatListingPrice(2500)).toBe('GH₵ 2,500')
  })

  it('shows a spaced range when max_price exceeds base', () => {
    expect(formatListingPrice(2500, 4500)).toBe('GH₵ 2,500 – 4,500')
  })

  it('ignores a max_price at or below the base price', () => {
    expect(formatListingPrice(2500, 2000)).toBe('GH₵ 2,500')
    expect(formatListingPrice(2500, 2500)).toBe('GH₵ 2,500')
  })
})
