/* Service worker for Campus Plug web push.
   - 'push': server (admin-push Edge Function) queued a notification for this
     device → show it and focus/open the admin panel on click.
   - 'notificationclick': bring the user straight to the relevant page. */

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
      tag: 'campus-plug-admin-alert',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Reuse an existing tab if one is already on the target page.
      for (const client of clientList) {
        if ('focus' in client && new URL(client.url).pathname === new URL(target, self.location.origin).pathname) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
