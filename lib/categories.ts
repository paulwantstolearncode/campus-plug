// Single source of truth for listing categories.
// Every listing belongs to exactly one category; listings.category stores the
// kebab-case slug. Keep slugs stable — they're persisted in the DB and used
// for filtering throughout the app.

export type CategorySlug = string // e.g. "hair-beauty"

export interface Category {
  slug: CategorySlug
  label: string
  emoji: string
  type: 'service' | 'product'
}

export const CATEGORIES: Category[] = [
  // ── Services ──
  { slug: 'hair-beauty', label: 'Hair & Beauty', emoji: '💇', type: 'service' },
  { slug: 'tutoring', label: 'Tutoring & Academic Help', emoji: '📚', type: 'service' },
  { slug: 'tech-repairs', label: 'Tech & Repairs', emoji: '💻', type: 'service' },
  { slug: 'design-creative', label: 'Design & Creative', emoji: '🎨', type: 'service' },
  { slug: 'delivery-errands', label: 'Delivery & Errands', emoji: '🚚', type: 'service' },
  { slug: 'food-catering', label: 'Food & Catering', emoji: '🍳', type: 'service' },
  { slug: 'other-services', label: 'Other Services', emoji: '📋', type: 'service' },
  // ── Products ──
  { slug: 'clothing-fashion', label: 'Clothing & Fashion', emoji: '👗', type: 'product' },
  { slug: 'electronics-gadgets', label: 'Electronics & Gadgets', emoji: '📱', type: 'product' },
  { slug: 'snacks-food', label: 'Snacks & Food', emoji: '🍫', type: 'product' },
  { slug: 'beauty-products', label: 'Beauty Products', emoji: '💄', type: 'product' },
  { slug: 'hostel-essentials', label: 'Hostel Essentials', emoji: '🛏️', type: 'product' },
  { slug: 'gifts-accessories', label: 'Gifts & Accessories', emoji: '🎁', type: 'product' },
  { slug: 'other-products', label: 'Other Products', emoji: '📋', type: 'product' },
]

export function getCategoriesByType(type: 'service' | 'product'): Category[] {
  return CATEGORIES.filter((c) => c.type === type)
}

export function getCategoryBySlug(slug: string | null | undefined): Category | undefined {
  if (!slug) return undefined
  return CATEGORIES.find((c) => c.slug === slug)
}

export function getCategoryLabel(slug: string | null | undefined): string {
  return getCategoryBySlug(slug)?.label ?? 'Uncategorized'
}

// Emoji + label pair for badges. Legacy listings (category IS NULL/unknown)
// render no badge at all — call sites gate on `listing.category` truthiness,
// so the fallback below is only a safety net and never shown on marketplace
// cards ("📋 Uncategorized" looked unprofessional).
export function getCategoryDisplay(slug: string | null | undefined): { emoji: string; label: string } {
  const cat = getCategoryBySlug(slug)
  return cat ? { emoji: cat.emoji, label: cat.label } : { emoji: '📋', label: 'Uncategorized' }
}
