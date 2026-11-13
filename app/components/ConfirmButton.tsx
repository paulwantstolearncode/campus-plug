'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

interface ConfirmButtonProps {
  label: string
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  className?: string
  confirmClassName?: string
}

/**
 * Two-tap confirmation button that replaces browser-native confirm() dialogs.
 *
 * First tap swaps the label to the confirmLabel (default: "Tap again to confirm")
 * with a subtle amber warning state. Auto-resets after 3 seconds if no second tap.
 * Second tap executes onConfirm and resets.
 *
 * Feels native on mobile — no browser dialog that looks like the site crashed.
 */
export function ConfirmButton({
  label,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  disabled = false,
  className = '',
  confirmClassName = '',
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    setConfirming(false)
    if (resetTimer.current) {
      clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
  }, [])

  // Clear pending reset when confirming state changes to false externally
  useEffect(() => {
    if (!confirming && resetTimer.current) {
      clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
  }, [confirming])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const handleClick = async () => {
    if (disabled) return

    if (!confirming) {
      setConfirming(true)
      resetTimer.current = setTimeout(reset, 3000)
      return
    }

    reset()
    try {
      await onConfirm()
    } catch {
      // Errors are surfaced by the caller via its own state
    }
  }

  const base =
    'inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold text-xs transition-colors'
  const variant = confirming
    ? `bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 ${confirmClassName}`
    : `bg-ink text-white hover:bg-black ${className}`

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`${base} ${variant}`.trim()}
    >
      {confirming ? confirmLabel : label}
    </button>
  )
}
