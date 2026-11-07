/* Notifications Web Push, importé par le service worker généré (vite-plugin-pwa, workbox.importScripts).
 * Message attendu (JSON) : { title, body, url, tag, actions?, token? }.
 * Boutons (« Petit verre · 20 cl », « C’est arrosé ») : le geste est fait sans ouvrir l'application, en échangeant le
 * jeton de la notification (run_notification_action) ; adresse et clé publique de la base rangées par l'application
 * dans le cache PUSH_CONFIG_CACHE (src/lib/push.ts). */

const PUSH_CONFIG_CACHE = 'life-push-config'
const PUSH_CONFIG_KEY = '/push-config.json'
/** Durée d'affichage de la confirmation d'un geste. */
const CONFIRMATION_MS = 4000

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Life'
  const actions = Array.isArray(data.actions) && data.token ? data.actions.slice(0, 2) : []
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      // Petite icône de la barre d'état Android : silhouette blanche sur fond transparent.
      badge: '/icons/badge-96.png',
      // Une notification par liste : la suivante remplace la précédente.
      tag: data.tag || 'food',
      renotify: true,
      actions,
      data: { url: data.url || '/courses', token: actions.length ? data.token : undefined },
    }),
  )
})

/** Ouvre (ou ramène au premier plan) l'application sur une de ses pages, jamais une adresse externe. */
function openApp(path) {
  const target = new URL(path || '/courses', self.location.origin)
  const url = target.origin === self.location.origin ? target.href : new URL('/courses', self.location.origin).href
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
    if (!existing) return self.clients.openWindow(url)
    // Une fenêtre non contrôlée par ce service worker refuse navigate() : on en ouvre une nouvelle.
    return existing
      .focus()
      .then((w) => (w && 'navigate' in w ? w.navigate(url) : self.clients.openWindow(url)))
      .catch(() => self.clients.openWindow(url))
  })
}

async function readConfig() {
  const cache = await caches.open(PUSH_CONFIG_CACHE)
  const response = await cache.match(PUSH_CONFIG_KEY)
  const config = response ? await response.json() : null
  if (!config || typeof config.url !== 'string' || typeof config.key !== 'string') throw new Error('configuration absente')
  return config
}

const liters = (ml) => `${(Math.round(ml / 10) / 100).toLocaleString('fr-FR')} L`

/** Texte de confirmation d'après la réponse de run_notification_action. */
function confirmation(result) {
  if (result && result.kind === 'water') {
    return { title: `Noté : ${Math.round(result.volume_ml / 10)} cl 💧`, body: `${liters(result.drunk_ml)} sur ${liters(result.goal_ml)} aujourd’hui.` }
  }
  if (result && result.kind === 'plants') {
    if (result.count === 0) return { title: 'Déjà arrosé 🪴', body: 'Quelqu’un l’a noté entre-temps.' }
    return { title: 'Arrosage noté 🪴', body: result.count === 1 ? '1 plante arrosée.' : `${result.count} plantes arrosées.` }
  }
  return { title: 'C’est noté', body: '' }
}

/** Fait le geste d'un bouton, puis affiche brièvement une confirmation à la place de la notification. */
async function runAction(notification, action) {
  const config = await readConfig()
  const response = await fetch(`${config.url}/rest/v1/rpc/run_notification_action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: config.key, authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ p_token: notification.data.token, p_action: action }),
  })
  if (!response.ok) throw new Error(`geste refusé (${response.status})`)
  const { title, body } = confirmation(await response.json())
  const tag = notification.tag || 'food'
  await self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag, silent: true, data: notification.data })
  await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_MS))
  for (const shown of await self.registration.getNotifications({ tag })) shown.close()
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  notification.close()
  const data = notification.data || {}
  if (event.action && data.token) {
    // Jeton expiré ou déjà utilisé, réseau coupé… : l'application s'ouvre sur la page, pour le faire à la main.
    event.waitUntil(runAction(notification, event.action).catch(() => openApp(data.url)))
    return
  }
  event.waitUntil(openApp(data.url))
})
