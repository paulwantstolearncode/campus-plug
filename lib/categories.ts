// Single source of truth for listing categories.
// Every listing belongs to exactly one category; listings.category stores the
// kebab-case slug. Keep slugs stable — they're persisted in the DB and used
// for filtering throughout the app.
//
// `color` is the category's identity color (hex) used for icon circles on the
// browse pages; `description` is the one-liner shown on category cards.

export type CategorySlug = string // e.g. "hair-beauty"

export interface Category {
  slug: CategorySlug
  label: string
  emoji: string
  type: 'service' | 'product'
  /** Identity color (6-digit hex) for icon circles / accents. */
  color: string
  /** One-line description for browse cards. */
  description: string
}

export const CATEGORIES: Category[] = [
  // ── Services ──
  { slug: 'hair-beauty', label: 'Hair & Beauty', emoji: '💇', type: 'service', color: '#ec4899', description: 'Braids, locs, nails, barbering & more' },
  { slug: 'tutoring', label: 'Tutoring & Academic Help', emoji: '📚', type: 'service', color: '#c9a227', description: 'Past questions, study groups & subject help' },
  { slug: 'tech-repairs', label: 'Tech & Repairs', emoji: '🔧', type: 'service', color: '#3b82f6', description: 'Phone & laptop fixes, done on campus' },
  { slug: 'design-creative', label: 'Design & Creative', emoji: '🎨', type: 'service', color: '#8b5cf6', description: 'Graphics, photography & prints' },
  { slug: 'delivery-errands', label: 'Delivery & Errands', emoji: '🚚', type: 'service', color: '#14b8a6', description: 'Errands, pickups & campus runs' },
  { slug: 'food-catering', label: 'Food & Catering', emoji: '🍳', type: 'service', color: '#ef4444', description: 'Home-cooked meals & event catering' },
  { slug: 'other-services', label: 'Other Services', emoji: '📋', type: 'service', color: '#64748b', description: 'Everything else students offer' },
  // ── Products ──
  { slug: 'clothing-fashion', label: 'Clothing & Fashion', emoji: '👗', type: 'product', color: '#f43f5e', description: 'Fits, thrift finds & custom pieces' },
  { slug: 'electronics-gadgets', label: 'Electronics & Gadgets', emoji: '💻', type: 'product', color: '#0ea5e9', description: 'Laptops, chargers, audio & accessories' },
  { slug: 'snacks-food', label: 'Snacks & Food', emoji: '🍫', type: 'product', color: '#f97316', description: 'Small chops, drinks & quick bites' },
  { slug: 'beauty-products', label: 'Beauty Products', emoji: '💄', type: 'product', color: '#d946ef', description: 'Skincare, hair products & cosmetics' },
  { slug: 'hostel-essentials', label: 'Hostel Essentials', emoji: '🛏️', type: 'product', color: '#10b981', description: 'Mattresses, kettles, buckets & room items' },
  { slug: 'gifts-accessories', label: 'Gifts & Accessories', emoji: '🎁', type: 'product', color: '#eab308', description: 'Gift boxes, jewellery & extras' },
  { slug: 'other-products', label: 'Other Products', emoji: '📦', type: 'product', color: '#64748b', description: 'Everything else on the board' },
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

// ── Fresher picks ──────────────────────────────────────────────────────────
// The curated 6 shown in the "Start here" bento on /categories — what a new
// student actually needs in their first weeks (academic help, room kit,
// gadgets, fits, repairs, hair). Order matters: indexes 0 and 3 get the
// tall bento cells.
export const FRESHER_PICKS: Category[] = [
  'tutoring',
  'hostel-essentials',
  'electronics-gadgets',
  'clothing-fashion',
  'tech-repairs',
  'hair-beauty',
]
  .map((slug) => getCategoryBySlug(slug))
  .filter((c): c is Category => Boolean(c))
