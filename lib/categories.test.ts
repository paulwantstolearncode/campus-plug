import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  FRESHER_PICKS,
  getCategoriesByType,
  getCategoryBySlug,
  getCategoryLabel,
  getCategoryDisplay,
} from '@/lib/categories'

describe('CATEGORIES', () => {
  it('has 14 categories split 7 / 7 between services and products', () => {
    expect(CATEGORIES).toHaveLength(14)
    expect(CATEGORIES.filter((c) => c.type === 'service')).toHaveLength(7)
    expect(CATEGORIES.filter((c) => c.type === 'product')).toHaveLength(7)
  })

  it('has unique, kebab-case slugs (they are persisted in the DB)', () => {
    const slugs = CATEGORIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('gives every category the fields the browse cards render', () => {
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.description.length).toBeGreaterThan(0)
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(Array.isArray(c.sampleItems)).toBe(true)
      expect(c.sampleItems.length).toBeGreaterThan(0)
    }
  })
})

describe('getCategoriesByType', () => {
  it('returns only services or only products', () => {
    const services = getCategoriesByType('service')
    const products = getCategoriesByType('product')
    expect(services.every((c) => c.type === 'service')).toBe(true)
    expect(products.every((c) => c.type === 'product')).toBe(true)
    expect(services.length + products.length).toBe(CATEGORIES.length)
  })
})

describe('getCategoryBySlug', () => {
  it('finds a known slug', () => {
    expect(getCategoryBySlug('hair-beauty')?.label).toBe('Hair & Beauty')
  })

  it('returns undefined for nullish or unknown slugs', () => {
    expect(getCategoryBySlug(null)).toBeUndefined()
    expect(getCategoryBySlug(undefined)).toBeUndefined()
    expect(getCategoryBySlug('')).toBeUndefined()
    expect(getCategoryBySlug('space-travel')).toBeUndefined()
  })
})

describe('getCategoryLabel', () => {
  it('falls back to Uncategorized', () => {
    expect(getCategoryLabel('tutoring')).toBe('Tutoring & Academic Help')
    expect(getCategoryLabel(null)).toBe('Uncategorized')
    expect(getCategoryLabel('nope')).toBe('Uncategorized')
  })
})

describe('getCategoryDisplay', () => {
  it('returns the emoji + label pair for a known category', () => {
    expect(getCategoryDisplay('electronics-gadgets')).toEqual({
      emoji: '💻',
      label: 'Electronics & Gadgets',
    })
  })

  it('returns a safe fallback for legacy rows', () => {
    expect(getCategoryDisplay(null)).toEqual({ emoji: '📋', label: 'Uncategorized' })
  })
})

describe('FRESHER_PICKS', () => {
  it('curates exactly 6 resolvable categories', () => {
    expect(FRESHER_PICKS).toHaveLength(6)
    for (const c of FRESHER_PICKS) {
      expect(CATEGORIES).toContain(c)
    }
  })

  it('keeps the documented order (indexes 0 and 3 get the tall bento cells)', () => {
    expect(FRESHER_PICKS.map((c) => c.slug)).toEqual([
      'tutoring',
      'hostel-essentials',
      'electronics-gadgets',
      'clothing-fashion',
      'tech-repairs',
      'hair-beauty',
    ])
  })
})
