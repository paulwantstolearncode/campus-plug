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
  const [mounted, setMounted] = useState(false)

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setChecked(JSON.parse(raw))
    } catch {
      // Corrupted storage — start fresh.
    }
    setMounted(true)
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
  const total = CHECKLIST_ITEMS.length
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100)
  const allDone = doneCount === total

  return (
    <div className="relative bg-ink text-white rounded-3xl border border-white/10 p-6 sm:p-8 overflow-hidden shadow-2xl">
      {/* Ambient gold glow + grain */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 right-0 w-72 h-72 bg-gold/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 grain-overlay opacity-[0.03]" />
      </div>

      <div className="relative">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="font-display text-xl sm:text-2xl font-bold">The Fresher Checklist</h2>
          <span className="font-mono text-xs font-bold text-gold whitespace-nowrap">
            {doneCount}/{total} done
          </span>
        </div>
        <p className="text-white/50 text-sm mb-5">
          Tick items off as you sort them — your progress saves on this device.
        </p>

        {/* Live gold progress bar */}
        <div
          className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-7"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fresher checklist progress"
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: mounted ? `${pct}%` : '0%',
              backgroundImage: 'linear-gradient(90deg, #c9a227 0%, #e8b93b 100%)',
              boxShadow: '0 0 12px rgba(201,162,39,0.5)',
            }}
          />
        </div>

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
                      ? 'bg-gold/15 border-gold/40'
                      : 'bg-white/5 border-white/10 hover:border-gold/50 hover:bg-white/[0.08]'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm font-bold transition-all ${
                      isChecked ? 'bg-gold border-gold text-ink scale-105' : 'border-white/25 text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span
                    className={`text-sm sm:text-base font-medium flex-1 transition-colors ${
                      isChecked ? 'text-white/45 line-through' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </span>
                  {/* Quick-link arrow on hover (unchecked rows) */}
                  {!isChecked && (
                    <span className="text-gold text-sm opacity-0 -translate-x-1 group-hover:opacity-100 transition-all">
                      →
                    </span>
                  )}
                </button>
                {activeItem === item.id && (
                  <Link
                    href={item.findHref}
                    className="mt-1.5 ml-12 inline-flex items-center gap-1 text-xs font-bold text-gold hover:text-gold-light transition-colors"
                  >
                    Find on Campus Plug →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>

        {/* Celebration line when everything is packed */}
        {mounted && allDone && (
          <p className="mt-5 text-center text-sm font-semibold text-gold">
            🎉 Fully packed — see you on campus!
          </p>
        )}
      </div>
    </div>
  )
}
