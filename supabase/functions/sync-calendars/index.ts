// Edge Function Supabase : synchronise les agendas (module Agenda) dans calendar_events.
// Appelée par pg_cron (voir la migration agenda) et par le bouton « Synchroniser » de l'application. Secrets :
//   NOTIFY_SECRET  secret partagé avec les tâches planifiées (en-tête x-cron-secret), le même que notify-shopping

import { createClient } from '@supabase/supabase-js'
import { createSignedInCheck } from '../_shared/auth.ts'
import { createIcalProvider } from '../_shared/agenda/ical-provider.ts'
import type { CalendarProviderKind } from '../_shared/agenda/provider.ts'
import { createHandler } from './handler.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(
  createHandler({
    secret: Deno.env.get('NOTIFY_SECRET'),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
    now: () => new Date(),
    providers: { ical: createIcalProvider() },
    async loadSources(staleBefore) {
      const { data, error } = await db
        .from('calendar_sources')
        .select('id, provider')
        .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore.toISOString()}`)
        .order('created_at')
      if (error) throw error
      return (data as { id: string; provider: CalendarProviderKind }[]).map(({ id, provider }) => ({ id, provider }))
    },
    async loadCredentials(sourceId) {
      const { data, error } = await db.from('calendar_source_credentials').select('ical_url').eq('source_id', sourceId).maybeSingle()
      if (error) throw error
      return data?.ical_url ? { provider: 'ical', url: data.ical_url as string } : null
    },
    async saveOccurrences(sourceId, occurrences) {
      const { error } = await db.rpc('replace_calendar_events', { p_source_id: sourceId, p_events: occurrences })
      if (error) throw error
    },
    async recordFailure(sourceId, message) {
      const { error } = await db.from('calendar_sources').update({ last_synced_at: new Date().toISOString(), last_error: message }).eq('id', sourceId)
      if (error) throw error
    },
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
  }),
)
