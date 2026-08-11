'use client'
import { useState } from 'react'

// Reusable star rating. Two modes:
//   * Display (default): read-only gold stars. Supports fractional values
//     (e.g. an average of 4.8) via a clipped gold overlay.
//   * Interactive: hover previews the rating, click sets it (integer 1-5).
//
// Gold stars (#d4af37) for filled, gray for empty. SVG so they stay crisp at
// any size.

interface StarRatingProps {
  rating: number // 0-5 (display: any value; interactive: integer 1-5)
  interactive?: boolean
  onChange?: (rating: number) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-7 h-7' }

function Star({ filled, sizeClass }: { filled: boolean; sizeClass: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={(sizeClass + ' fill-current shrink-0 ') + (filled ? 'text-gold' : 'text-gray-300')}
      aria-hidden="true"
    >
      <path d="M12 2l2.92 6.26 6.88.6-5.2 4.56 1.53 6.72L12 16.4l-6.13 3.74 1.53-6.72L2.2 8.86l6.88-.6L12 2z" />
    </svg>
  )
}

function StarRow({ filled, sizeClass }: { filled: number; sizeClass: string }) {
  return (
    <span className="flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} filled={i <= filled} sizeClass={sizeClass} />
      ))}
    </span>
  )
}

export default function StarRating({
  rating,
  interactive = false,
  onChange,
  size = 'md',
  className = '',
}: StarRatingProps) {
  const [hover, setHover] = useState(0)
  const sizeClass = SIZES[size]

  if (!interactive) {
    const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
    const label =
      rating > 0
        ? Number(rating).toFixed(1) + ' out of 5 stars'
        : 'No rating yet'
    return (
      <span
        className={'relative inline-flex align-middle ' + className}
        role="img"
        aria-label={label}
        title={label}
      >
        <StarRow filled={5} sizeClass={sizeClass} />
        <span className="absolute inset-0 overflow-hidden flex" style={{ width: pct + '%' }}>
          <StarRow filled={5} sizeClass={sizeClass} />
        </span>
      </span>
    )
  }

  const active = hover || rating
  return (
    <div className={'inline-flex items-center gap-1 ' + className} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={active === n}
          aria-label={n + ' star' + (n > 1 ? 's' : '')}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange?.(n)}
          className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
        >
          <Star filled={n <= active} sizeClass={sizeClass} />
        </button>
      ))}
    </div>
  )
}
