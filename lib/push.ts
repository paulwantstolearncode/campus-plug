import { supabase } from '@/lib/supabase'

// Client-side Web Push registration + subscription management.
// Flow: user grants Notification permission → we register /sw.js → subscribe
// with the VAPID key from the admin-push Edge Function → store the
// subscription in push_subscriptions (owner-only RLS) so the server can send
// OS-level notifications even when the tab is closed.

const SW_PATH = '/sw.js'

function fnUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing')
  return `${base}/functions/v1/admin-push${path}`
}

export type PushSupport = 'ready' | 'unsupported' | 'denied' | 'insecure'

/**
 * Can this browser/device do web push at all?
 * - Requires a secure context (https or localhost).
 * - iOS Safari only supports push when the site runs as an installed PWA
 *   (Add to Home Screen), not in a regular Safari tab.
 */
export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!window.isSecureContext) return 'insecure'
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
  if (isIOS && !standalone) return 'unsupported'
  return 'ready'
}

async function getVapidKey(): Promise<string> {
  const res = await fetch(fnUrl('/vapid-public-key'))
  if (!res.ok) throw new Error('Could not load push key')
  const { key } = (await res.json()) as { key: string }
  if (!key) throw new Error('Empty VAPID key')
  return key
}

/**
 * Subscribe the current device for push notifications.
 * Returns true when a fresh subscription was stored, false when already
 * subscribed, and throws on permission denial / unsupported browsers.
 */
export async function enablePushForCurrentUser(): Promise<boolean> {
  if (getPushSupport() !== 'ready') {
    throw new Error('This browser does not support push notifications')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in first')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  const registration = await navigator.serviceWorker.register(SW_PATH)
  await navigator.serviceWorker.ready

  const vapidKey = await getVapidKey()

  const existing = await registration.pushManager.getSubscription()
  const applicationServerKey = urlBase64ToUint8Array(vapidKey) as Uint8Array<ArrayBuffer>
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }))

  // Idempotent upsert: endpoint has a UNIQUE constraint; re-subscribing the
  // same device just refreshes keys.
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Incomplete push subscription')
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(`Could not save push subscription: ${error.message}`)

  return !existing
}

/** Unsubscribe this device and remove its stored subscription row. */
export async function disablePushForCurrentUser(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.toJSON().endpoint
  await subscription.unsubscribe().catch(() => undefined)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
}

/** Whether this device already has an active push subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (getPushSupport() !== 'ready') return false
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH)
  const subscription = await registration?.pushManager.getSubscription()
  return Boolean(subscription)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
