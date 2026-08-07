// Shared formatting helpers for prices and bundle price ranges.

export function formatPrice(value: number | string | null | undefined): string {
  const n = Number(value || 0)
  return 'GH₵ ' + n.toLocaleString()
}

export interface PriceRange {
  min: number
  max: number
}

// Returns null when there are no bundle items (plain single listing).
export function getPriceRange(
  items: { price: number }[] | null | undefined
): PriceRange | null {
  if (!items || items.length === 0) return null
  const prices = items.map((i) => Number(i.price))
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

// "GH₵ 80" when all items share one price, otherwise "GH₵ 30–100".
export function formatPriceRange(
  items: { price: number }[] | null | undefined
): string | null {
  const range = getPriceRange(items)
  if (!range) return null
  if (range.min === range.max) return formatPrice(range.min)
  return 'GH₵ ' + range.min.toLocaleString() + '–' + range.max.toLocaleString()
}
