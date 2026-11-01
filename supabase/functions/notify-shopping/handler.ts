// Logique de notify-shopping, indépendante de Deno pour pouvoir être testée.
// Appelée par pg_cron (en-tête x-cron-secret) :
//   - toutes les 3 minutes : notifications groupées des modifications de listes de courses aux appareils des autres ;
//   - toutes les 10 minutes, corps {"job": "hydration"} : rappels « pense à boire ».

import { buildHydrationMessage, type HydrationReminder } from './hydration.ts'
import { buildShoppingMessage, QUIET_MS, readyGroups, type PushPayload, type ShoppingEvent } from './message.ts'

export interface DeviceSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult = 'sent' | 'gone' | 'failed'

export interface Deps {
  secret: string | undefined
  now: () => number
  loadPendingEvents: () => Promise<ShoppingEvent[]>
  /** Appareils de tout le monde sauf l'auteur des modifications (et ceux qui ont coupé ces notifications). */
  loadSubscriptions: (excludeProfileId: string) => Promise<DeviceSubscription[]>
  /** Appareils d'une personne. */
  loadProfileSubscriptions: (profileId: string) => Promise<DeviceSubscription[]>
  /** Rappels d'hydratation dus, réservés (une seule exécution les envoie). */
  claimHydrationReminders: () => Promise<HydrationReminder[]>
  send: (subscription: DeviceSubscription, payload: PushPayload) => Promise<SendResult>
  deleteSubscriptions: (ids: string[]) => Promise<void>
  /**
   * Marque comme notifiés ceux des événements qui ne le sont pas encore, en une seule opération, et renvoie ceux-là :
   * deux exécutions simultanées ne peuvent pas réserver (et donc envoyer) les mêmes.
   */
  reserveEvents: (eventIds: number[]) => Promise<number[]>
  purgeOldEvents: () => Promise<void>
  log?: (message: string, data?: Record<string, unknown>) => void
}

export interface RunReport {
  groups: number
  sent: number
  failed: number
  removed: number
}

export async function notifyPending(deps: Deps): Promise<RunReport> {
  const groups = readyGroups(await deps.loadPendingEvents(), deps.now(), QUIET_MS)
  const report: RunReport = { groups: 0, sent: 0, failed: 0, removed: 0 }
  const gone = new Set<string>()

  try {
    for (const ready of groups) {
      // Réservés avant l'envoi (et donc marqués même s'il échoue : pas de rafale de notifications en retard).
      const reserved = new Set(await deps.reserveEvents(ready.events.map((e) => e.id)))
      const group = { ...ready, events: ready.events.filter((e) => reserved.has(e.id)) }
      if (group.events.length === 0) continue // déjà pris par une autre exécution
      report.groups += 1
      const payload = buildShoppingMessage(group)
      for (const subscription of await deps.loadSubscriptions(group.actor_id)) {
        if (gone.has(subscription.id)) continue // expiré : déjà constaté pour un groupe précédent
        const result = await deps.send(subscription, payload)
        if (result === 'sent') report.sent += 1
        else if (result === 'gone') gone.add(subscription.id)
        else report.failed += 1
      }
    }
  } finally {
    // Abonnements expirés retirés même si un groupe a échoué en cours de route.
    if (gone.size > 0) {
      await deps.deleteSubscriptions([...gone])
      report.removed = gone.size
    }
  }
  await deps.purgeOldEvents()
  return report
}

export async function notifyHydration(deps: Deps): Promise<RunReport> {
  const report: RunReport = { groups: 0, sent: 0, failed: 0, removed: 0 }
  const gone: string[] = []
  try {
    for (const reminder of await deps.claimHydrationReminders()) {
      report.groups += 1
      const payload = buildHydrationMessage(reminder)
      for (const subscription of await deps.loadProfileSubscriptions(reminder.profile_id)) {
        const result = await deps.send(subscription, payload)
        if (result === 'sent') report.sent += 1
        else if (result === 'gone') gone.push(subscription.id)
        else report.failed += 1
      }
    }
  } finally {
    if (gone.length > 0) {
      await deps.deleteSubscriptions(gone)
      report.removed = gone.length
    }
  }
  return report
}

/** Comparaison en temps constant (le secret ne se devine pas caractère par caractère). */
export function sameSecret(given: string | null, expected: string): boolean {
  const a = new TextEncoder().encode(given ?? '')
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

export function createHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    if (!deps.secret || !sameSecret(request.headers.get('x-cron-secret'), deps.secret)) return json({ error: 'Non autorisé.' }, 401)
    try {
      const body = (await request.json().catch(() => null)) as { job?: unknown } | null
      const report = body?.job === 'hydration' ? await notifyHydration(deps) : await notifyPending(deps)
      if (report.groups > 0) deps.log?.('notifications envoyées', { ...report })
      return json(report)
    } catch (error) {
      deps.log?.('notifications en erreur', { error: String(error) })
      return json({ error: 'Échec de l’envoi des notifications.' }, 500)
    }
  }
}
