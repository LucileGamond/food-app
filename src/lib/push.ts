// Abonnement de cet appareil aux notifications Web Push (service worker de la PWA).

/** Clé publique VAPID (publique par nature : elle identifie le serveur d'envoi). */
export const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on'

export interface DevicePush {
  endpoint: string
  p256dh: string
  auth: string
}

export class PushPermissionError extends Error {
  constructor() {
    super('Notifications refusées par le téléphone.')
    this.name = 'PushPermissionError'
  }
}

/** Le navigateur gère les notifications Push et l'application est installée (service worker actif). */
export async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!VAPID_PUBLIC_KEY || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  if (typeof window === 'undefined' || !('PushManager' in window) || !('Notification' in window)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** « BEl6…» (base64url) → octets, pour applicationServerKey. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function toDevicePush(subscription: PushSubscription): DevicePush | null {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}

/** Abonnement actuel de l'appareil, s'il existe. */
export async function currentDevicePush(registration: ServiceWorkerRegistration): Promise<DevicePush | null> {
  const subscription = await registration.pushManager.getSubscription()
  return subscription ? toDevicePush(subscription) : null
}

/** Demande l'autorisation et abonne l'appareil. */
export async function subscribeDevice(registration: ServiceWorkerRegistration): Promise<DevicePush> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushPermissionError()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!),
  })
  const device = toDevicePush(subscription)
  if (!device) throw new Error('Abonnement incomplet')
  return device
}

export async function unsubscribeDevice(registration: ServiceWorkerRegistration): Promise<string | null> {
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  await subscription.unsubscribe()
  return subscription.endpoint
}

/** Cache où le service worker lit l'adresse et la clé publique de la base (boutons des notifications, public/push-sw.js). */
export const PUSH_CONFIG_CACHE = 'life-push-config'
export const PUSH_CONFIG_KEY = '/push-config.json'

/**
 * Range l'adresse et la clé publique de la base pour le service worker : les boutons des notifications (« C’est
 * arrosé ») agissent sans ouvrir l'application. Rien de secret : la clé publique est déjà dans l'application.
 */
export async function rememberPushConfig(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
  key: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY,
): Promise<void> {
  if (!url || !key || typeof caches === 'undefined') return
  try {
    const cache = await caches.open(PUSH_CONFIG_CACHE)
    await cache.put(PUSH_CONFIG_KEY, new Response(JSON.stringify({ url, key }), { headers: { 'content-type': 'application/json' } }))
  } catch {
    // Stockage indisponible : les boutons ouvriront l'application.
  }
}
