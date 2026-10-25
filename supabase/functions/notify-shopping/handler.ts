// Logique de notify-shopping, indépendante de Deno pour pouvoir être testée.
// Appelée toutes les 3 minutes par pg_cron (en-tête x-cron-secret) : envoie les notifications groupées
// des modifications de listes de courses aux appareils des autres personnes.

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
  /** Appareils de tout le monde sauf l'auteur des modifications. */
  loadSubscriptions: (excludeProfileId: string) => Promise<DeviceSubscription[]>
  send: (subscription: DeviceSubscription, payload: PushPayload) => Promise<SendResult>
  deleteSubscriptions: (ids: string[]) => Promise<void>
  markNotified: (eventIds: number[]) => Promise<void>
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
  const report: RunReport = { groups: groups.length, sent: 0, failed: 0, removed: 0 }
  const gone = new Set<string>()

  for (const group of groups) {
    const payload = buildShoppingMessage(group)
    for (const subscription of await deps.loadSubscriptions(group.actor_id)) {
      const result = await deps.send(subscription, payload)
      if (result === 'sent') report.sent += 1
      else if (result === 'gone') gone.add(subscription.id)
      else report.failed += 1
    }
    // Marqués même en cas d'échec d'envoi : pas de rafale de notifications en retard.
    await deps.markNotified(group.events.map((e) => e.id))
  }

  if (gone.size > 0) {
    await deps.deleteSubscriptions([...gone])
    report.removed = gone.size
  }
  await deps.purgeOldEvents()
  return report
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

export function createHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    if (!deps.secret || request.headers.get('x-cron-secret') !== deps.secret) return json({ error: 'Non autorisé.' }, 401)
    try {
      const report = await notifyPending(deps)
      if (report.groups > 0) deps.log?.('notifications envoyées', { ...report })
      return json(report)
    } catch (error) {
      deps.log?.('notifications en erreur', { error: String(error) })
      return json({ error: 'Échec de l’envoi des notifications.' }, 500)
    }
  }
}
