'use client'

/**
 * CategoryIcon — minimal line-drawing SVG icon for a category slug.
 * Stroke-based, 24×24 viewBox, inherits color via currentColor so the parent
 * sets text color. Unknown slugs fall back to a generic tag icon.
 */

const ICONS: Record<string, React.ReactNode> = {
  'hair-beauty': (
    // Comb
    <>
      <path d="M4 6h16" />
      <path d="M4 10h16" />
      <path d="M4 14h16" />
      <path d="M4 18h16" />
      <path d="M8 6v4M12 6v4M16 6v4M6 10v4M10 10v4M14 10v4M18 10v4M8 14v4M12 14v4M16 14v4" />
    </>
  ),
  tutoring: (
    // Open book
    <>
      <path d="M12 6.5C10.5 5 8 4.5 5.5 4.5c-.6 0-1 .4-1 1V17c0 .6.4 1 1 1 2.5 0 5 .5 6.5 2 1.5-1.5 4-2 6.5-2 .6 0 1-.4 1-1V5.5c0-.6-.4-1-1-1-2.5 0-5 .5-6.5 2z" />
      <path d="M12 6.5V20" />
    </>
  ),
  'tech-repairs': (
    // Wrench
    <>
      <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7z" />
    </>
  ),
  'design-creative': (
    // Paint palette
    <>
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.2.1 1.7-.5.6-1.5 1-2.6 1z" />
      <circle cx="7.5" cy="10.5" r="0.5" />
      <circle cx="12" cy="7.5" r="0.5" />
      <circle cx="16.5" cy="10.5" r="0.5" />
    </>
  ),
  'delivery-errands': (
    // Delivery van
    <>
      <path d="M1 8a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v8H1V8z" />
      <path d="M14 10h4l3 3v3h-7v-6z" />
      <circle cx="5.5" cy="18" r="1.8" />
      <circle cx="17.5" cy="18" r="1.8" />
    </>
  ),
  'food-catering': (
    // Steaming bowl
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0z" />
      <path d="M8 8c0-1.5 1-1.5 1-3M12 8c0-1.5 1-1.5 1-3M16 8c0-1.5 1-1.5 1-3" />
    </>
  ),
  'other-services': (
    // Three dots (more)
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  'clothing-fashion': (
    // T-shirt
    <>
      <path d="M8 3l4 2.5L16 3l5 3.5-2 3-2-1V21H7V8.5l-2 1-2-3L8 3z" />
    </>
  ),
  'electronics-gadgets': (
    // Laptop
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  'snacks-food': (
    // Burger
    <>
      <path d="M4 10a8 8 0 0 1 16 0H4z" />
      <path d="M3 14h18" />
      <path d="M4 18h16a0 0 0 0 1 0 0c0 1.5-2 2.5-8 2.5S4 19.5 4 18z" />
    </>
  ),
  'beauty-products': (
    // Lipstick
    <>
      <path d="M9 11V6a3 3 0 0 1 6 0v5" />
      <rect x="8" y="11" width="8" height="4" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
    </>
  ),
  'hostel-essentials': (
    // Bed
    <>
      <path d="M3 18v-8" />
      <path d="M3 14h18v4" />
      <path d="M21 14a3 3 0 0 0-3-3h-6v3" />
      <path d="M6 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </>
  ),
  'gifts-accessories': (
    // Gift box
    <>
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <path d="M12 10v10" />
      <path d="M4 10h16" />
      <path d="M12 10c-1.5 0-4.5-.5-4.5-3A2.5 2.5 0 0 1 12 5a2.5 2.5 0 0 1 4.5 2c0 2.5-3 3-4.5 3z" />
    </>
  ),
  'other-products': (
    // Package / tag fallback style
    <>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
}

/** Generic fallback for unknown/legacy slugs. */
const FALLBACK = (
  // Price tag
  <>
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1" />
  </>
)

interface CategoryIconProps {
  slug: string
  size?: number
  className?: string
}

export default function CategoryIcon({ slug, size = 28, className }: CategoryIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[slug] ?? FALLBACK}
    </svg>
  )
}
