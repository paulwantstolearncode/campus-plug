'use client'
import { useEffect, useState } from 'react'
import {
  enablePushForCurrentUser,
  disablePushForCurrentUser,
  getPushSupport,
  isPushEnabled,
} from '@/lib/push'

/**
 * Web push opt-in for admins: stores this device's subscription so the
 * admin-push worker can deliver OS-level alerts (seller applications, new
 * listings) even when the tab is closed. Renders nothing on unsupported
 * browsers/devices — no dead UI.
 */
export default function PushNotificationsToggle() {
  // Support detection runs once at mount in the initializer (same pattern as
  // PWAInstallPrompt) — server renders false, so no hydration mismatch.
  const [supported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return getPushSupport() === 'ready'
  })
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported) return
    isPushEnabled().then(setEnabled).catch(() => undefined)
  }, [supported])

  async function handleToggle() {
    setBusy(true)
    setError(null)
    try {
      if (enabled) {
        await disablePushForCurrentUser()
        setEnabled(false)
      } else {
        await enablePushForCurrentUser()
        setEnabled(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change push settings')
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={handleToggle}
        disabled={busy}
        className="w-full flex items-center gap-3 text-sm text-charcoal hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
      >
        <span className="text-base leading-none">{enabled ? '🔔' : '🔕'}</span>
        <span className="flex-1">
          {busy ? 'Working…' : enabled ? 'Alerts ON (this device)' : 'Phone/desktop alerts'}
        </span>
        <span
          className={
            'inline-block w-9 h-5 rounded-full relative transition-colors shrink-0 ' +
            (enabled ? 'bg-green-500' : 'bg-gray-300')
          }
          aria-hidden="true"
        >
          <span
            className={
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ' +
              (enabled ? 'left-[18px]' : 'left-0.5')
            }
          />
        </span>
      </button>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      {!enabled && !error && (
        <p className="text-[11px] text-gray-400 mt-1">
          Get notified when sellers apply or listings need review — even with the tab closed.
        </p>
      )}
    </div>
  )
}
