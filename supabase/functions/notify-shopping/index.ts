// Edge Function Supabase : notifications Web Push des modifications de listes de courses, rappels d'hydratation
// et d'arrosage des plantes, résumé du matin de l'agenda.
// Appelée par pg_cron (voir les migrations shopping_notifications et settings_hydration). Secrets :
//   NOTIFY_SECRET  secret partagé avec la tâche planifiée (en-tête x-cron-secret)
//   VAPID_KEYS     paire de clés VAPID au format JWK : {"publicKey": {...}, "privateKey": {...}}
//   VAPID_SUBJECT  contact du serveur d'envoi (URL https ou mailto:)

import { ApplicationServer, importVapidKeys, PushMessageError } from '@negrel/webpush'
import { createClient } from '@supabase/supabase-js'
import { notifyAgenda, type AgendaNotifyDeps } from './agenda.ts'
import { createHandler, type Deps, type DeviceSubscription } from './handler.ts'
import { isAgendaScope } from '../_shared/agenda/scope.ts'
import { addDays, toCivilDate } from '../_shared/watering/civil-date.ts'
import type { HydrationReminder } from './hydration.ts'
import type { PushPayload, ShoppingEvent } from './message.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

let server: Promise<ApplicationServer> | null = null
function applicationServer(): Promise<ApplicationServer> {
  server ??= (async () =>
    ApplicationServer.new({
      contactInformation: Deno.env.get('VAPID_SUBJECT') || 'https://github.com/LucileGamond/food-app',
      vapidKeys: await importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? '{}')),
    }))()
  return server
}

async function send(subscription: DeviceSubscription, payload: PushPayload) {
  try {
    const subscriber = (await applicationServer()).subscribe({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } })
    await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: 24 * 3600 })
    return 'sent' as const
  } catch (error) {
    if (error instanceof PushMessageError && error.isGone()) return 'gone' as const
    console.log(JSON.stringify({ message: 'envoi impossible', error: String(error) }))
    return 'failed' as const
  }
}

interface PlantRow {
  id: string
  name: string
  rules: { id: string; months: number[]; first_watering_on: string; interval_count: number; interval_unit: 'day' | 'week' | 'month'; amount_ml: number }[]
  events: { id: string; scheduled_on: string | null; watered_at: string }[]
}

type EventRow = Omit<ShoppingEvent, 'list_name' | 'actor_name'> & {
  list: { name: string } | null
  actor: { display_name: string } | null
}

const deps: Deps = {
  secret: Deno.env.get('NOTIFY_SECRET'),
  now: () => Date.now(),
  async loadPendingEvents() {
    const { data, error } = await db
      .from('shopping_events')
      .select('id, list_id, actor_id, kind, item_name, created_at, list:shopping_lists(name), actor:profiles(display_name)')
      .is('notified_at', null)
      .order('id')
      .limit(1000)
    if (error) throw error
    return (data as unknown as EventRow[]).map(({ list, actor, ...event }) => ({
      ...event,
      list_name: list?.name ?? 'Liste de courses',
      actor_name: actor?.display_name ?? 'Quelqu’un',
    }))
  },
  async loadSubscriptions(excludeProfileId) {
    const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, profile_id').neq('profile_id', excludeProfileId)
    if (error) throw error
    // Personnes qui ont coupé les notifications des courses (ou masqué la page) dans leurs réglages.
    const muted = await db.from('user_settings').select('profile_id').or('muted_notifications.cs.{courses},disabled_pages.cs.{courses}')
    if (muted.error) throw muted.error
    const excluded = new Set(muted.data.map((row) => row.profile_id as string))
    return data.filter((row) => !excluded.has(row.profile_id)).map(({ profile_id: _, ...subscription }) => subscription)
  },
  async loadProfileSubscriptions(profileId) {
    const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', profileId)
    if (error) throw error
    return data
  },
  async listFiles(bucket) {
    // Fichiers rangés par dossier : « pending/ », « <recette>/ », « <personne>/ ».
    const list = async (folder: string) => {
      const entries: { name: string; id: string | null; created_at?: string | null }[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000, offset })
        if (error) throw error
        entries.push(...data)
        if (data.length < 1000) return entries
      }
    }
    const files: { path: string; createdAt: string | null }[] = []
    for (const folder of await list('')) {
      // Dossier (sans id) : ses fichiers ; fichier à la racine : lui-même.
      if (folder.id) files.push({ path: folder.name, createdAt: folder.created_at ?? null })
      else for (const f of await list(folder.name)) if (f.id) files.push({ path: `${folder.name}/${f.name}`, createdAt: f.created_at ?? null })
    }
    return files
  },
  async referencedFiles(bucket) {
    const { data, error } = await db.rpc('referenced_files', { p_bucket: bucket })
    if (error) throw error
    return data as string[]
  },
  async removeFiles(bucket, paths) {
    const { error } = await db.storage.from(bucket).remove(paths)
    if (error) throw error
  },
  async claimHydrationReminders() {
    const { data, error } = await db.rpc('claim_hydration_reminders')
    if (error) throw error
    return data as HydrationReminder[]
  },
  async loadActivePlants() {
    // Arrosages de la dernière année et demie : assez pour retrouver l'échéance en cours de chaque règle.
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString()
    const { data, error } = await db
      .from('plants')
      .select('id, name, rules:watering_rules(id, months, first_watering_on, interval_count, interval_unit, amount_ml), events:watering_events(id, scheduled_on, watered_at)')
      .is('archived_at', null)
      .gte('events.watered_at', since)
    if (error) throw error
    return (data as PlantRow[]).map((plant) => ({
      id: plant.id,
      name: plant.name,
      rules: plant.rules.map((r) => ({
        id: r.id,
        months: r.months,
        firstWateringOn: r.first_watering_on,
        intervalCount: r.interval_count,
        intervalUnit: r.interval_unit,
        amountMl: r.amount_ml,
      })),
      events: plant.events.map((e) => ({ id: e.id, scheduledOn: e.scheduled_on, wateredOn: toCivilDate(e.watered_at, 'Europe/Paris') })),
    }))
  },
  async claimPlantReminders() {
    const { data, error } = await db.rpc('claim_plant_reminders')
    if (error) throw error
    return (data as { profile_id: string }[]).map((row) => row.profile_id)
  },
  async createActionToken(profileId, kind, payload) {
    const { data, error } = await db.rpc('create_notification_action', { p_profile_id: profileId, p_kind: kind, p_payload: payload })
    if (error) throw error
    return data as string
  },
  send,
  async deleteSubscriptions(ids) {
    const { error } = await db.from('push_subscriptions').delete().in('id', ids)
    if (error) throw error
  },
  async reserveEvents(eventIds) {
    // Une seule requête UPDATE : une exécution concurrente attend le verrou de la ligne puis ne la retrouve plus.
    const { data, error } = await db
      .from('shopping_events')
      .update({ notified_at: new Date().toISOString() })
      .in('id', eventIds)
      .is('notified_at', null)
      .select('id')
    if (error) throw error
    return data.map((row) => row.id as number)
  },
  async purgeOldEvents() {
    const { error } = await db
      .from('shopping_events')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    if (error) throw error
  },
  log: (message, data) => console.log(JSON.stringify({ message, ...data })),
}

interface AgendaRow {
  uid: string
  title: string
  location: string | null
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  start_date: string | null
  end_date: string | null
  source: { owner_id: string; owner: { display_name: string } | null } | null
}

const AGENDA_COLUMNS = 'uid, title, location, all_day, starts_at, ends_at, start_date, end_date, source:calendar_sources(owner_id, owner:profiles(display_name))'

const agendaDeps: AgendaNotifyDeps = {
  now: deps.now,
  send: deps.send,
  loadProfileSubscriptions: deps.loadProfileSubscriptions,
  deleteSubscriptions: deps.deleteSubscriptions,
  async claimAgendaReminders() {
    const { data, error } = await db.rpc('claim_agenda_reminders')
    if (error) throw error
    return (data as { profile_id: string; agenda_scope: string }[]).map((row) => ({
      profileId: row.profile_id,
      scope: isAgendaScope(row.agenda_scope) ? row.agenda_scope : 'all',
    }))
  },
  async loadAgendaDay(day) {
    // Large (la veille au lendemain) : le jour exact à Paris est retenu par buildAgendaMessage.
    const from = `${addDays(day, -1)}T00:00:00Z`
    const to = `${addDays(day, 2)}T00:00:00Z`
    const [timed, allDay] = await Promise.all([
      db.from('calendar_events').select(AGENDA_COLUMNS).eq('all_day', false).lt('starts_at', to).gte('ends_at', from),
      db.from('calendar_events').select(AGENDA_COLUMNS).eq('all_day', true).lte('start_date', day).gt('end_date', day),
    ])
    if (timed.error) throw timed.error
    if (allDay.error) throw allDay.error
    return ([...timed.data, ...allDay.data] as unknown as AgendaRow[]).map((row) => ({
      uid: row.uid,
      title: row.title,
      location: row.location,
      description: null,
      ownerId: row.source?.owner_id ?? '',
      ownerName: row.source?.owner?.display_name ?? 'Quelqu’un',
      ...(row.all_day ? { allDay: true as const, startDate: row.start_date!, endDate: row.end_date! } : { allDay: false as const, startsAt: row.starts_at!, endsAt: row.ends_at! }),
    }))
  },
}

Deno.serve(createHandler(deps, { agenda: () => notifyAgenda(agendaDeps) }))
