'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const CHECKLIST_ITEMS: { id: string; label: string; findHref: string }[] = [
  { id: 'fan-kettle', label: 'Standing Fan / Kettle', findHref: '/services?category=hostel-essentials' },
  { id: 'extension-board', label: 'Heavy Duty Extension Board', findHref: '/services?category=hostel-essentials' },
  { id: 'laptop-surge', label: 'Laptop & Surge Protector', findHref: '/services?category=electronics-gadgets' },
  { id: 'laundry-stylist', label: 'Laundry / Hair Stylist Contact', findHref: '/services?category=hair-beauty' },
  { id: 'past-questions', label: 'Past Questions & Handouts', findHref: '/services?category=tutoring' },
]

const STORAGE_KEY = 'cp_fresher_checklist'

export default function FresherChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [activeItem, setActiveItem] = useState<string | null>(null)

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setChecked(JSON.parse(raw))
    } catch {
      // Corrupted storage — start fresh.
    }
  }, [])

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage unavailable (private mode) — session-only is fine.
      }
      return next
    })
    setActiveItem((prev) => (prev === id ? null : id))
  }

  const doneCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="bg-white rounded-2xl border border-rule p-6 sm:p-8 shadow-sm">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">The Fresher Checklist</h2>
        <span className="text-xs font-bold text-gold whitespace-nowrap">
          {doneCount}/{CHECKLIST_ITEMS.length} done
        </span>
      </div>
      <p className="text-ink-muted text-sm mb-5">
        Tick items off as you sort them — your progress saves on this device.
      </p>

      <ul className="space-y-2.5">
        {CHECKLIST_ITEMS.map((item) => {
          const isChecked = !!checked[item.id]
          return (
            <li key={item.id}>
              <button
                onClick={() => toggle(item.id)}
                aria-pressed={isChecked}
                className={`w-full flex items-center gap-3.5 text-left px-4 py-3.5 rounded-xl border transition-all min-h-[48px] ${
                  isChecked
                    ? 'bg-gold/10 border-gold/40'
                    : 'bg-paper border-rule hover:border-gold/50'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm font-bold transition-colors ${
                    isChecked ? 'bg-gold border-gold text-charcoal' : 'border-rule text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span
                  className={`text-sm sm:text-base font-medium flex-1 ${
                    isChecked ? 'text-ink-muted line-through' : 'text-ink'
                  }`}
                >
                  {item.label}
                </span>
              </button>
              {activeItem === item.id && (
                <Link
                  href={item.findHref}
                  className="mt-1.5 ml-12 inline-flex items-center gap-1 text-xs font-bold text-gold hover:text-gold/80 transition-colors"
                >
                  Find on Campus Plug →
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
