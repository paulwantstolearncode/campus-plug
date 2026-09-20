/**
 * MarqueeStrip — dark obsidian ticker with every category name + emoji.
 * Pure CSS infinite loop (track content duplicated, translateX 0 → -50%),
 * pauses on hover. No JS.
 */

import { CATEGORIES } from '@/lib/categories'

export default function MarqueeStrip() {
  const items = CATEGORIES.map((c) => `${c.emoji} ${c.label}`)
  // Duplicate once so translateX(-50%) loops seamlessly.
  const doubled = [...items, ...items]

  return (
    <section
      aria-hidden="true"
      className="relative w-full overflow-hidden bg-ink border-y border-white/10 py-3.5"
    >
      <div className="marquee-track flex w-max items-center gap-10 whitespace-nowrap">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="font-display font-semibold text-sm sm:text-base text-white/50 tracking-wide"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}
