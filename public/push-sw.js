/* Notifications Web Push, importé par le service worker généré (vite-plugin-pwa, workbox.importScripts).
 * Message attendu (JSON) : { title, body, url, tag }. */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Food'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      // Petite icône de la barre d'état Android : silhouette blanche sur fond transparent.
      badge: '/icons/badge-96.png',
      // Une notification par liste : la suivante remplace la précédente.
      tag: data.tag || 'food',
      renotify: true,
      data: { url: data.url || '/courses' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/courses', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (existing) {
        return existing.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : undefined))
      }
      return self.clients.openWindow(url)
    }),
  )
})
