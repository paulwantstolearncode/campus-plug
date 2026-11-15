'use client'
import { useEffect, useState } from 'react'
import {
  enablePushForCurrentUser,
  disablePushForCurrentUser,
  getPushSupport,
  isPushEnabled,
  type PushSupport,
} from '@/lib/push'

/**
 * Web push opt-in for any signed-in user: stores this device's subscription so
 * the admin-push worker can deliver OS-level alerts (messages, orders, reviews)
 * to this device even when the tab is closed. `push_messages.user_id` routes
 * each alert to its owner, so a subscriber only ever sees their own.
 *
 * Every unsupported case gets a next step instead of a blank panel: iPhone
 * users are told to install the app (push is impossible in a Safari tab), and
 * a blocked permission points at browser settings. Rendering nothing, as this
 * used to, left those users with no path at all.
 */
interface PushNotificationsToggleProps {
  /** The mobile drawer sits on charcoal for dark nav variants — without this
      the control rendered charcoal-on-charcoal and was effectively invisible. */
  tone?: 'light' | 'dark'
}

export default function PushNotificationsToggle({
  tone = 'light',
}: PushNotificationsToggleProps) {
  // Support detection runs once at mount in the initializer (same pattern as
  // PWAInstallPrompt) — the server always renders the closed dropdown, so
  // there is no hydration mismatch.
  const [support] = useState<PushSupport>(() =>
    typeof window === 'undefined' ? 'unsupported' : getPushSupport()
  )
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (support !== 'ready') return
    isPushEnabled()
      .then(setEnabled)
      .catch(() => undefined)
  }, [support])

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
      setError(err instanceof Error ? err.message : 'Could not change alert settings')
    } finally {
      setBusy(false)
    }
  }

  const titleCls = tone === 'dark' ? 'text-white' : 'text-charcoal'
  const hintCls = tone === 'dark' ? 'text-white/60' : 'text-gray-400'
  const hoverCls = tone === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50'

  if (support === 'unsupported' || support === 'insecure') return null

  if (support === 'ios-needs-install') {
    return (
      <div className="px-4 py-2.5">
        <p className={`text-sm font-medium ${titleCls}`}>Phone alerts</p>
        <p className={`text-[11px] ${hintCls} mt-1 leading-relaxed`}>
          On iPhone, tap <span className="font-semibold">Share</span> then{' '}
          <span className="font-semibold">Add to Home Screen</span>, and open Campus Plug
          from your home screen to switch alerts on.
        </p>
      </div>
    )
  }

  if (support === 'denied') {
    return (
      <div className="px-4 py-2.5">
        <p className={`text-sm font-medium ${titleCls}`}>Alerts blocked</p>
        <p className={`text-[11px] ${hintCls} mt-1 leading-relaxed`}>
          Allow notifications for this site in your browser settings, then reopen Campus
          Plug.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={handleToggle}
        disabled={busy}
        role="switch"
        aria-checked={enabled}
        className={`w-full flex items-center gap-3 text-sm ${titleCls} ${hoverCls} transition-colors text-left disabled:opacity-50 min-h-[44px]`}
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
        <p className={`text-[11px] ${hintCls} mt-1`}>
          Messages, orders and reviews as phone alerts — even with the tab closed.
        </p>
      )}
    </div>
  )
}
