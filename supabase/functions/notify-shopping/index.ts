// Edge Function Supabase : notifications Web Push des modifications de listes de courses.
// Appelée par pg_cron (voir la migration shopping_notifications). Secrets :
//   NOTIFY_SECRET  secret partagé avec la tâche planifiée (en-tête x-cron-secret)
//   VAPID_KEYS     paire de clés VAPID au format JWK : {"publicKey": {...}, "privateKey": {...}}
//   VAPID_SUBJECT  contact du serveur d'envoi (URL https ou mailto:)

import { ApplicationServer, importVapidKeys, PushMessageError } from '@negrel/webpush'
import { createClient } from '@supabase/supabase-js'
import { createHandler, type DeviceSubscription } from './handler.ts'
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

type EventRow = Omit<ShoppingEvent, 'list_name' | 'actor_name'> & {
  list: { name: string } | null
  actor: { display_name: string } | null
}

Deno.serve(
  createHandler({
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
      const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').neq('profile_id', excludeProfileId)
      if (error) throw error
      return data
    },
    send,
    async deleteSubscriptions(ids) {
      const { error } = await db.from('push_subscriptions').delete().in('id', ids)
      if (error) throw error
    },
    async markNotified(eventIds) {
      const { error } = await db.from('shopping_events').update({ notified_at: new Date().toISOString() }).in('id', eventIds)
      if (error) throw error
    },
    async purgeOldEvents() {
      const { error } = await db
        .from('shopping_events')
        .delete()
        .lt('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      if (error) throw error
    },
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
  }),
)
