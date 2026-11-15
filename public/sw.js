/* Service worker for Campus Plug web push.
   - 'push': the admin-push Edge Function queued an alert for this device →
     show it as an OS notification, even when no tab is open.
   - 'notificationclick': clear the icon badge and bring the user straight to
     the relevant page. */

/** Stable per-section tag, e.g. '/messages/abc' -> 'campus-plug:messages'. */
function tagFor(url) {
  try {
    const first = new URL(url || '/', self.location.origin).pathname.split('/')[1]
    return 'campus-plug:' + (first || 'alert')
  } catch {
    return 'campus-plug:alert'
  }
}

self.addEventListener('push', (event) => {
  let data = { title: 'Campus Plug', body: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* malformed payload — fall back to defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192',
      badge: '/icon-192',
      data: { url: data.url },
      // One tag per area of the site (/messages, /dashboard, /reviews…), so
      // repeats collapse into a single tray entry but a chat alert no longer
      // replaces an order alert — the old single shared tag wiped every
      // earlier notification. Derived from the link so the worker needs no
      // change to supply a tag.
      tag: data.tag || tagFor(data.url),
      renotify: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      // Opening an alert clears the app icon badge; the app re-sets it from
      // real unread counts on next load.
      try {
        if (typeof self.registration.clearAppBadge === 'function') {
          await self.registration.clearAppBadge()
        }
      } catch {
        /* Badging API unavailable */
      }

      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Reuse a tab already on the target page, else focus any tab and send it
      // there, else open a new one.
      const targetPath = new URL(target, self.location.origin).pathname
      for (const client of clientList) {
        if ('focus' in client && new URL(client.url).pathname === targetPath) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })(),
  )
})
