'use client'

import Link from 'next/link'
import CategoryIcon from './CategoryIcon'
import { CATEGORIES, FRESHER_PICKS } from '@/lib/categories'

/**
 * BentoGrid — "Start here" fresher section. Six curated categories in an
 * asymmetric bento layout: indexes 0 and 3 span 2 rows on desktop. Cards link
 * to the services feed pre-filtered by category.
 */

export default function BentoGrid() {
  return (
    <section className="relative py-20 md:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 md:mb-16">
          <p className="font-serif-accent italic text-gold-dark text-xl sm:text-2xl mb-3">
            Freshers
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-ink leading-tight mb-3">
            Start here
          </h2>
          <p className="text-base md:text-lg text-ink-muted">
            The six plugs every Legon fresher needs first
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5 md:auto-rows-fr">
          {FRESHER_PICKS.map((cat, idx) => {
            const tall = idx === 0 || idx === 3
            return (
              <Link
                key={cat.slug}
                href={`/services?category=${cat.slug}`}
                className={
                  'group relative overflow-hidden bg-surface hairline rounded-2xl p-6 card-lift hover:border-gold hover:shadow-glow transition-colors flex flex-col justify-end ' +
                  (tall ? 'md:row-span-2 min-h-[280px]' : 'min-h-[160px]')
                }
              >
                {/* Large faded emoji backdrop */}
                <span
                  className="absolute -top-4 -right-3 text-[6rem] leading-none opacity-[0.06] select-none pointer-events-none"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-ink mb-auto"
                  style={{ backgroundColor: cat.color + '26' }} // ~15% tint
                >
                  <CategoryIcon slug={cat.slug} size={22} />
                </div>

                <div className="mt-4">
                  <h3 className="text-lg sm:text-xl font-bold text-ink leading-snug mb-1">
                    {cat.label}
                  </h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed line-clamp-2">
                    {cat.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/categories"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-gold-dark hover:text-gold transition-colors"
          >
            View all {CATEGORIES.length} categories
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
        </div>
    </section>
  )
}
