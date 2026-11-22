import { describe, it, expect } from 'vitest'
import {
  momoProviderForPhone,
  momoCheckoutUrl,
  momoDevCompleteUrl,
} from '@/lib/momo'

describe('momoProviderForPhone', () => {
  it('detects MTN prefixes', () => {
    expect(momoProviderForPhone('0244123456')).toBe('mtn')
    expect(momoProviderForPhone('0544123456')).toBe('mtn')
    expect(momoProviderForPhone('0554123456')).toBe('mtn')
    expect(momoProviderForPhone('0594123456')).toBe('mtn')
  })

  it('detects the +233 international form for MTN', () => {
    expect(momoProviderForPhone('+233244123456')).toBe('mtn')
    expect(momoProviderForPhone('233544123456')).toBe('mtn')
  })

  it('detects AirtelTigo prefixes', () => {
    expect(momoProviderForPhone('0274123456')).toBe('airteltigo')
    expect(momoProviderForPhone('0574123456')).toBe('airteltigo')
    expect(momoProviderForPhone('0564123456')).toBe('airteltigo')
    expect(momoProviderForPhone('+233274123456')).toBe('airteltigo')
  })

  it('detects Vodafone 050', () => {
    expect(momoProviderForPhone('0504123456')).toBe('vodafone')
    expect(momoProviderForPhone('+233504123456')).toBe('vodafone')
  })

  it('falls back to MTN for unknown prefixes', () => {
    expect(momoProviderForPhone('0314123456')).toBe('mtn')
    expect(momoProviderForPhone('')).toBe('mtn')
    expect(momoProviderForPhone('not-a-number')).toBe('mtn')
  })

  it('ignores punctuation and spaces in the number', () => {
    expect(momoProviderForPhone('024 412 3456')).toBe('mtn')
    expect(momoProviderForPhone('(050) 412-3456')).toBe('vodafone')
  })

  // Regression anchor: 020 is claimed by the MTN branch first (see the comment
  // in lib/momo.ts — 020 is shared between MTN and Vodafone in practice). Keep
  // this test honest about what the code actually does so a future reorder of
  // the checks is a deliberate, visible change.
  it('resolves the shared 020 prefix to MTN today', () => {
    expect(momoProviderForPhone('0204123456')).toBe('mtn')
  })
})

describe('checkout URLs', () => {
  it('builds the buyer checkout path', () => {
    expect(momoCheckoutUrl('abc')).toBe('/checkout/abc')
  })

  it('builds dev completion paths for paid and failed', () => {
    expect(momoDevCompleteUrl('abc', 'paid')).toBe('/checkout/dev/abc?status=paid')
    expect(momoDevCompleteUrl('abc', 'failed')).toBe('/checkout/dev/abc?status=failed')
  })
})
