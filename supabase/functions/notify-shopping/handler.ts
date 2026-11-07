// Logique de notify-shopping, indépendante de Deno pour pouvoir être testée.
// Appelée par pg_cron (en-tête x-cron-secret) :
//   - toutes les 3 minutes : notifications groupées des modifications de listes de courses aux appareils des autres ;
//   - toutes les 10 minutes, corps {"job": "hydration"} : rappels « pense à boire » ;
//   - toutes les heures, corps {"job": "plants"} : rappels d'arrosage du matin (à partir de 8 h, une fois par jour) ;
//   - chaque nuit, corps {"job": "cleanup"} : suppression des fichiers (photos, PDF) que plus rien n'utilise.

import { CLEANED_BUCKETS, orphanFiles, type CleanedBucket, type StoredFile } from './cleanup.ts'
import { toCivilDate } from '../_shared/watering/civil-date.ts'
import { buildHydrationMessage, drinkButtons, type HydrationReminder } from './hydration.ts'
import { buildPlantsMessage, duePlants, wateredButton, wateringsOf, type PlantData } from './plants.ts'
import { buildShoppingMessage, QUIET_MS, readyGroups, type NotificationButton, type PushPayload, type ShoppingEvent } from './message.ts'

export interface DeviceSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult = 'sent' | 'gone' | 'failed'

export type ActionKind = 'water' | 'plants'

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
  /** Plantes non archivées, avec leurs règles et leurs arrosages récents. */
  loadActivePlants: () => Promise<PlantData[]>
  /** Personnes à qui envoyer le rappel d'arrosage du jour, réservées (une seule exécution les envoie). */
  claimPlantReminders: () => Promise<string[]>
  /** Jeton des boutons d'une notification (geste de cette personne, à usage unique). */
  createActionToken: (profileId: string, kind: ActionKind, payload: Record<string, unknown>) => Promise<string>
  /** Fichiers d'un bucket du stockage, et ceux encore utilisés. */
  listFiles: (bucket: CleanedBucket) => Promise<StoredFile[]>
  referencedFiles: (bucket: CleanedBucket) => Promise<string[]>
  removeFiles: (bucket: CleanedBucket, paths: string[]) => Promise<void>
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

/** Heures sans notification de courses (heure de Paris) : les modifications attendent le matin. */
export const NIGHT_START_HOUR = 22
export const NIGHT_END_HOUR = 8

export function parisHour(ms: number): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(ms))
}

export async function notifyPending(deps: Deps): Promise<RunReport> {
  const report: RunReport = { groups: 0, sent: 0, failed: 0, removed: 0 }
  const hour = parisHour(deps.now())
  if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) return report
  const groups = readyGroups(await deps.loadPendingEvents(), deps.now(), QUIET_MS)
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

/** Un message par personne, sur tous ses appareils ; les abonnements expirés sont retirés. */
async function sendToProfiles(deps: Deps, messages: { profileId: string; payload: PushPayload }[]): Promise<RunReport> {
  const report: RunReport = { groups: 0, sent: 0, failed: 0, removed: 0 }
  const gone: string[] = []
  try {
    for (const { profileId, payload } of messages) {
      report.groups += 1
      for (const subscription of await deps.loadProfileSubscriptions(profileId)) {
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

/**
 * Ajoute les boutons et leur jeton à la notification d'une personne. Sans jeton (erreur), la notification part
 * quand même, sans boutons : un clic ouvre l'application.
 */
async function withButtons(
  deps: Deps,
  profileId: string,
  payload: PushPayload,
  buttons: NotificationButton[],
  kind: ActionKind,
  data: Record<string, unknown>,
): Promise<PushPayload> {
  if (buttons.length === 0) return payload
  try {
    return { ...payload, actions: buttons, token: await deps.createActionToken(profileId, kind, data) }
  } catch (error) {
    deps.log?.('jeton de notification impossible', { error: String(error) })
    return payload
  }
}

export async function notifyHydration(deps: Deps): Promise<RunReport> {
  const messages = []
  for (const reminder of await deps.claimHydrationReminders()) {
    const buttons = drinkButtons(reminder)
    const volumes = buttons.map((b) => Number(b.action.slice('drink:'.length)))
    const payload = await withButtons(deps, reminder.profile_id, buildHydrationMessage(reminder), buttons, 'water', { volumes })
    messages.push({ profileId: reminder.profile_id, payload })
  }
  return sendToProfiles(deps, messages)
}

export async function notifyPlants(deps: Deps): Promise<RunReport> {
  const today = toCivilDate(new Date(deps.now()), 'Europe/Paris')
  const due = duePlants(await deps.loadActivePlants(), today)
  // Rien à arroser : personne n'est réservé, une plante qui le devient dans la journée sera rappelée au passage suivant.
  if (due.length === 0) return { groups: 0, sent: 0, failed: 0, removed: 0 }
  const payload = buildPlantsMessage(due, today)
  const messages = []
  for (const profileId of await deps.claimPlantReminders()) {
    messages.push({ profileId, payload: await withButtons(deps, profileId, payload, [wateredButton(due)], 'plants', { waterings: wateringsOf(due) }) })
  }
  return sendToProfiles(deps, messages)
}

export async function cleanupFiles(deps: Deps): Promise<{ removed: number }> {
  let removed = 0
  for (const bucket of CLEANED_BUCKETS) {
    const orphans = orphanFiles(await deps.listFiles(bucket), await deps.referencedFiles(bucket), deps.now())
    // Par paquets : l'API de stockage borne la taille d'une suppression.
    for (let i = 0; i < orphans.length; i += 100) await deps.removeFiles(bucket, orphans.slice(i, i + 100))
    removed += orphans.length
  }
  return { removed }
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
      if (body?.job === 'cleanup') {
        const result = await cleanupFiles(deps)
        if (result.removed > 0) deps.log?.('fichiers inutilisés supprimés', result)
        return json(result)
      }
      const report =
        body?.job === 'hydration' ? await notifyHydration(deps) : body?.job === 'plants' ? await notifyPlants(deps) : await notifyPending(deps)
      if (report.groups > 0) deps.log?.('notifications envoyées', { ...report })
      return json(report)
    } catch (error) {
      deps.log?.('notifications en erreur', { error: String(error) })
      return json({ error: 'Échec de l’envoi des notifications.' }, 500)
    }
  }
}
