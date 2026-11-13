'use client'

import { useEffect, useState, useRef } from 'react'

interface CelebrateProps {
  trigger: boolean
  className?: string
}

/**
 * Hand-rolled celebration burst — zero npm packages.
 *
 * Fires once when `trigger` flips to true. N gold dots radiate from the
 * centre using CSS keyframes with random trajectories, then self-unmounts.
 *
 * Respects `prefers-reduced-motion` and touch devices: on either, renders
 * nothing (no burst, no animation). Callers manage re-fire via localStorage
 * flags so the burst only celebrates once per order/reveal.
 */
export function Celebrate({ trigger, className }: CelebrateProps) {
  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!trigger) return

    // Respect reduced motion — skip burst entirely
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    // Touch devices — skip continuous animation
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    ) {
      return
    }

    if (!active) {
      const t = setTimeout(() => {
        setActive(true)
        timerRef.current = setTimeout(() => {
          setActive(false)
          timerRef.current = null
        }, 900)
      }, 0)
      return () => clearTimeout(t)
    }
  }, [trigger, active])

  if (!active) return null

  const dots = Array.from({ length: 14 }).map((_, i) => {
    const angle = (i / 14) * 360
    const distance = 40 + (i % 5) * 12
    const tx = Math.cos((angle * Math.PI) / 180) * distance
    const ty = Math.sin((angle * Math.PI) / 180) * distance
    const delay = (i % 4) * 40

    return (
      <span
        key={i}
        className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-gold rounded-full shadow-glow"
        style={{
          transform: 'translate(-50%, -50%)',
          animation: `celebrate-burst 900ms ease-out ${delay}ms forwards`,
          '--tx': `${tx}px`,
          '--ty': `${ty}px`,
        } as React.CSSProperties}
      />
    )
  })

  return (
    <div className={`fixed inset-0 z-50 pointer-events-none ${className || ''}`}>
      <div className="absolute top-1/2 left-1/2 w-full h-full translate-x-[-50%] translate-y-[-50%]">
        {dots}
      </div>
    </div>
  )
}
