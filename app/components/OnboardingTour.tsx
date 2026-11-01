'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * First-login walkthrough.
 *
 * A spotlight overlay that points at real UI (nav links, search, listing grid)
 * so a brand-new student learns the map of Campus Plug in ~30 seconds.
 *
 * Deliberately dependency-free: the spotlight is one element with a huge
 * box-shadow (the "cutout" trick), which keeps the bundle small and lets the
 * card use the charcoal/gold design tokens directly.
 *
 * Seen-flag lives in localStorage (`campus-plug:tour:v1`) — no schema change,
 * so this ships without a Supabase migration. A user who clears storage (or
 * signs in on a new device) simply gets the tour again, which is harmless.
 */

const SEEN_KEY = 'campus-plug:tour:v1'
const RESTART_KEY = 'campus-plug:tour:restart'

/** Routes where the tour would be noise (or would fight the admin chrome). */
const SKIP_PREFIXES = ['/admin', '/login', '/auth', '/privacy', '/terms']

/** Minimum viewport width for the desktop-only steps. */
const MOBILE_MAX = 767

interface TourStep {
  id: string
  title: string
  body: string
  /** CSS selector for the element to spotlight. Omit for a centred card. */
  target?: string
  /** Alternative target used on narrow viewports. */
  mobileTarget?: string
  /** Which viewport the step belongs to. Defaults to 'all'. */
  device?: 'all' | 'desktop' | 'mobile'
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Campus Plug 👋',
    body: 'A 30-second tour of everything you can do here. You can skip any time — this only shows once.',
  },
  {
    id: 'search',
    title: 'Find it in seconds',
    body: 'Search for anything on campus — past questions, braiding, kettles, phone repair. Quick chips and filters narrow it down by category and hall.',
    target: '[data-tour="services-search"]',
  },
  {
    id: 'listings',
    title: 'Verified student sellers',
    body: 'Every listing is posted by a verified student and reviewed before it goes live. Tap a card to see details, or use WhatsApp to chat with the seller directly — no middleman.',
    target: '[data-tour="listing-card"]',
  },
  {
    id: 'wanted',
    device: 'desktop',
    title: 'Can’t find it? Ask for it',
    body: 'The Wanted Board lets you post what you need — a seller who has it will come to you.',
    target: '[data-tour="nav-wanted"]',
  },
  {
    id: 'fresher',
    device: 'desktop',
    title: 'New on campus?',
    body: 'The Fresher Kit is a checklist of the essentials you actually need for your first weeks — no guesswork.',
    target: '[data-tour="nav-fresher"]',
  },
  {
    id: 'menu',
    device: 'mobile',
    title: 'Everything is in here',
    body: 'Open the menu for Services, Categories, the Wanted Board, the Fresher Kit 🎓 and your Favorites.',
    mobileTarget: '[data-tour="nav-menu"]',
  },
  {
    id: 'sell',
    title: 'Got something to sell?',
    body: 'Become a seller and post your first listing in minutes. We verify every seller, so buyers trust what they see.',
    target: '[data-tour="nav-sell"]',
  },
  {
    id: 'account',
    device: 'desktop',
    title: 'Your account lives here',
    body: 'Bookings, favorites, reviews and your dashboard. You can also switch accounts or log out from this menu.',
    target: '[data-tour="nav-account"]',
  },
  {
    id: 'done',
    title: 'That’s it — you’re set up 🔌',
    body: 'Browse services, save favorites with the heart icon, and message sellers on WhatsApp when you’re ready.',
  },
]

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX
}

function resolveSelector(step: TourStep): string | null {
  if (step.mobileTarget && isMobileViewport()) return step.mobileTarget
  return step.target ?? null
}

function stepsForViewport(): TourStep[] {
  const mobile = isMobileViewport()
  return STEPS.filter((s) => {
    if (!s.device || s.device === 'all') return true
    return s.device === (mobile ? 'mobile' : 'desktop')
  })
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/** Keep the spotlight inside the viewport, even for targets taller than it. */
function clampToViewport(raw: DOMRect): Rect {
  const top = Math.max(6, raw.top)
  const left = Math.max(6, raw.left)
  const bottom = Math.min(window.innerHeight - 6, raw.bottom)
  const right = Math.min(window.innerWidth - 6, raw.right)
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** Wait for an element (nav is async — it loads the session/profile first). */
async function waitForElement(selector: string, timeoutMs = 2500): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el && el.getBoundingClientRect().width > 0) return el
    await new Promise((r) => setTimeout(r, 80))
  }
  return null
}

/**
 * Replay the tour on demand (used by "Replay tour" in the account menu).
 * Flags a one-shot restart and lands on the page the tour is written for.
 */
export function replayTour(path = '/services') {
  try {
    sessionStorage.setItem(RESTART_KEY, '1')
  } catch {
    /* private mode — just navigate */
  }
  if (window.location.pathname === path) {
    window.location.reload()
  } else {
    window.location.assign(path)
  }
}

export default function OnboardingTour() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [steps, setSteps] = useState<TourStep[]>([])
  const [index, setIndex] = useState(0)
  // Stamp the measurement with the step id so a stale rect from the previous
  // step is never drawn (avoids resetting state inside an effect).
  const [measured, setMeasured] = useState<{ stepId: string; rect: Rect } | null>(null)
  const [cardHeight, setCardHeight] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const cardHeightRef = useRef(0)
  // Marks "the tour has actually opened", not "a start was requested" — in
  // StrictMode the first effect run is torn down, so a request-level guard
  // would swallow the tour entirely.
  const openedRef = useRef(false)

  const step = steps[index]
  const isLast = index === steps.length - 1

  const finish = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore quota / private mode */
    }
    openedRef.current = false
    setActive(false)
  }, [])

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      finish()
      return
    }
    setIndex(index + 1)
  }, [index, steps.length, finish])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // ── Should we start? ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (SKIP_PREFIXES.some((p) => pathname?.startsWith(p))) return

    let cancelled = false

    const start = () => {
      if (cancelled || openedRef.current) return
      setSteps(stepsForViewport())
      setIndex(0)
      // Let the page paint and the listings finish their first render.
      setTimeout(() => {
        if (cancelled || openedRef.current) return
        openedRef.current = true
        // Only now consume the one-shot restart flag: StrictMode tears down the
        // first effect run, so removing it any earlier would lose the request.
        try {
          sessionStorage.removeItem(RESTART_KEY)
        } catch {
          /* ignore */
        }
        setActive(true)
      }, 800)
    }

    // Explicit restart (Replay tour) always wins, even if seen.
    let restart = false
    try {
      restart = sessionStorage.getItem(RESTART_KEY) === '1'
    } catch {
      /* ignore */
    }

    if (restart) {
      start()
      return () => {
        cancelled = true
      }
    }

    try {
      if (localStorage.getItem(SEEN_KEY)) return
    } catch {
      return
    }

    const maybeStart = (hasSession: boolean) => {
      if (hasSession) start()
    }

    supabase.auth.getSession().then(({ data }) => maybeStart(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      maybeStart(!!session)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [pathname])

  // ── Track the spotlight target for the current step ─────────────────
  useEffect(() => {
    if (!active || !step) return
    const stepId = step.id
    let cancelled = false

    const selector = resolveSelector(step)
    if (!selector) {
      // Centred step — nothing to spotlight.
      return
    }

    const track = (el: HTMLElement) => {
      const read = () => {
        if (cancelled) return
        setMeasured({ stepId, rect: clampToViewport(el.getBoundingClientRect()) })
      }
      // Follow the element while the page smooth-scrolls it into view.
      const until = performance.now() + 700
      const loop = () => {
        if (cancelled) return
        read()
        if (performance.now() < until) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }

    ;(async () => {
      const el = await waitForElement(selector)
      if (cancelled) return
      // Target never appeared (empty grid, missing bell) — the centred card
      // fallback is simply "no rect for this step id".
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      if (r.height > vh * 0.7) {
        // Tall target: centre-scrolling it would push its top out of view.
        // Park it just below where the tour card will sit so the two never
        // overlap.
        const offset = Math.max(96, cardHeightRef.current + 28)
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset) })
      } else if (r.top < 72 || r.bottom > vh - 8) {
        el.scrollIntoView({ block: 'center' })
      }
      track(el)
    })()

    return () => {
      cancelled = true
    }
  }, [active, step])

  // Keep the spotlight glued to the target on resize / scroll.
  useEffect(() => {
    if (!active) return
    const onResize = () => {
      if (!step) return
      const selector = resolveSelector(step)
      if (!selector) return
      const el = document.querySelector<HTMLElement>(selector)
      if (!el) return
      setMeasured({ stepId: step.id, rect: clampToViewport(el.getBoundingClientRect()) })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active, step])

  // ── Lock scroll + keyboard controls + focus ─────────────────────────
  useEffect(() => {
    if (!active) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'Tab') {
        // Keep focus inside the tour card.
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    cardRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [active, finish, next, prev])

  // Measure the card so placement can avoid running off-screen.
  useLayoutEffect(() => {
    if (!active) return
    const h = cardRef.current?.getBoundingClientRect().height ?? 0
    cardHeightRef.current = h
    setCardHeight(h)
  }, [active, index, steps])

  if (!active || !step) return null

  const rect: Rect | null = measured && measured.stepId === step.id ? measured.rect : null

  // ── Layout maths ────────────────────────────────────────────────────
  const CARD_W = Math.min(360, (typeof window !== 'undefined' ? window.innerWidth : 360) - 32)
  const GAP = 16
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const estH = cardHeight || 200

  let cardTop: number
  let cardLeft: number
  let placement: 'below' | 'above' | 'center' = 'center'

  // Always clamp so the card stays fully on screen, even when the measured
  // height lags one frame behind the step change.
  const clampTop = (top: number) => Math.max(12, Math.min(top, vh - estH - 12))

  if (rect) {
    const below = rect.top + rect.height + GAP
    const above = rect.top - estH - GAP
    if (below + estH < vh - 12) {
      placement = 'below'
      cardTop = below
    } else if (above > 12) {
      placement = 'above'
      cardTop = above
    } else {
      placement = below <= above ? 'below' : 'above'
      cardTop = below <= above ? below : above
    }
    cardTop = clampTop(cardTop)
    cardLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - CARD_W / 2, vw - CARD_W - 16))
  } else {
    cardTop = clampTop((vh - estH) / 2)
    cardLeft = Math.max(16, (vw - CARD_W) / 2)
  }

  // The arrow only makes sense when the card still sits beside the target —
  // clamping can slide it away from a tall element.
  const arrowVisible =
    !!rect &&
    (placement === 'below'
      ? Math.abs(cardTop - (rect.top + rect.height + GAP)) < 2
      : Math.abs(cardTop + estH - (rect.top - GAP)) < 2)

  return (
    <div className="fixed inset-0 z-[90] no-print" role="dialog" aria-modal="true" aria-label="Campus Plug tour">
      {/* Backdrop. The spotlight cutout supplies its own darkness. */}
      <div
        className={`absolute inset-0 ${rect ? '' : 'bg-ink/75 backdrop-blur-[2px]'}`}
        onClick={next}
        aria-hidden="true"
      />

      {/* Spotlight cutout — a huge ring shadow dims everything except the hole. */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-3xl ring-2 ring-gold/80 transition-all duration-200 ease-out"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(10,10,12,0.75)',
          }}
        />
      )}

      {/* Tour card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute bg-surface rounded-3xl shadow-2xl border border-rule overflow-hidden outline-none animate-fade-in"
        style={{ top: cardTop, left: cardLeft, width: CARD_W }}
      >
        {/* Gold hairline + arrow pointing at the target */}
        <div className="h-1 bg-gradient-to-r from-gold via-gold-dark to-gold" />
        {arrowVisible && rect && placement !== 'center' && (
          <div
            className="absolute w-3 h-3 bg-surface border-l border-t border-rule rotate-45"
            style={{
              left: Math.max(18, Math.min(rect.left + rect.width / 2 - cardLeft - 6, CARD_W - 30)),
              [placement === 'below' ? 'top' : 'bottom']: -7,
            }}
            aria-hidden="true"
          />
        )}

        <div className="p-5 sm:p-6">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gold-dark mb-2">
            {isLast ? 'All done' : `Step ${index + 1} of ${steps.length}`}
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-ink leading-snug mb-2">{step.title}</h2>
          <p className="text-sm text-ink-muted leading-relaxed">{step.body}</p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mt-4" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={
                  'h-1.5 rounded-full transition-all ' +
                  (i === index ? 'w-5 bg-gold' : i < index ? 'w-1.5 bg-gold/40' : 'w-1.5 bg-rule')
                }
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 mt-5">
            <button
              onClick={finish}
              className="text-xs font-semibold text-ink-muted hover:text-ink transition-colors"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {index > 0 && (
                <button
                  onClick={prev}
                  className="px-4 py-2.5 rounded-full text-sm font-semibold text-ink border border-rule hover:border-ink-muted transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                className="px-5 py-2.5 rounded-full text-sm font-bold bg-ink text-white hover:bg-gold hover:text-ink transition-colors"
              >
                {isLast ? 'Start browsing' : index === 0 ? 'Show me around' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
