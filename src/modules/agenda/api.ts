// Module Agenda : agendas Google suivis (sources) et leurs événements, en lecture seule. Les événements sont écrits
// par la synchronisation (Edge Function sync-calendars) ; l'adresse secrète d'une source n'est jamais relue.

import { AppError, toAppError } from '@/api/errors'
import { subscribeTables } from '@/api/realtime'
import type { AppSupabaseClient } from '@/api/client'
import { addDays, type IsoDate } from '@/lib/dates'
import type { AgendaEvent, CalendarSource } from './lib/agenda'

const SOURCE_COLUMNS = 'id, owner_id, provider, name, last_synced_at, last_error, created_at, owner:profiles(display_name)'
const EVENT_COLUMNS = 'id, source_id, uid, title, location, all_day, starts_at, ends_at, start_date, end_date, source:calendar_sources!inner(owner_id, owner:profiles(display_name))'

interface EventRow {
  id: string
  source_id: string
  uid: string
  title: string
  location: string | null
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  start_date: string | null
  end_date: string | null
  source: { owner_id: string; owner: { display_name: string } | null }
}

function toEvent(row: EventRow): AgendaEvent {
  const base = {
    id: row.id,
    sourceId: row.source_id,
    uid: row.uid,
    title: row.title,
    location: row.location,
    ownerId: row.source.owner_id,
    ownerName: row.source.owner?.display_name ?? 'Quelqu’un',
  }
  return row.all_day
    ? { ...base, allDay: true, startDate: row.start_date!, endDate: row.end_date! }
    : { ...base, allDay: false, startsAt: row.starts_at!, endsAt: row.ends_at! }
}

export function createAgendaApi(db: AppSupabaseClient) {
  return {
    /** Agendas suivis par le foyer, par propriétaire puis par date d'ajout. */
    async listSources(): Promise<CalendarSource[]> {
      const { data, error } = await db.from('calendar_sources').select(SOURCE_COLUMNS).order('owner_id').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger les agendas.')
      return data.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        ownerName: row.owner?.display_name ?? 'Quelqu’un',
        provider: row.provider as CalendarSource['provider'],
        name: row.name,
        lastSyncedAt: row.last_synced_at,
        lastError: row.last_error,
      }))
    },

    /** Suit un agenda Google par son adresse iCal secrète ; renvoie l'id de la source. */
    async addIcalSource(name: string, url: string): Promise<string> {
      const { data, error } = await db.rpc('add_ical_calendar', { p_name: name, p_url: url })
      if (error?.code === '23514') throw new AppError('Adresse ou nom refusé : colle l’« adresse secrète au format iCal » de ton agenda Google.', error.code)
      if (error) throw toAppError(error, 'Impossible d’ajouter l’agenda.')
      return data
    },

    /** Ne suit plus l'agenda : ses événements disparaissent de l'application. */
    async deleteSource(id: string): Promise<void> {
      const { error } = await db.from('calendar_sources').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer l’agenda.')
    },

    /** Événements qui touchent les jours [from, to] (inclus), tous agendas confondus. */
    async listEvents(from: IsoDate, to: IsoDate): Promise<AgendaEvent[]> {
      // Rendez-vous : large d'un jour de chaque côté (fuseaux) ; le jour exact à Paris est retenu à l'affichage.
      const [timed, allDay] = await Promise.all([
        db.from('calendar_events').select(EVENT_COLUMNS).eq('all_day', false).lt('starts_at', `${addDays(to, 2)}T00:00:00Z`).gte('ends_at', `${addDays(from, -1)}T00:00:00Z`),
        db.from('calendar_events').select(EVENT_COLUMNS).eq('all_day', true).lte('start_date', to).gt('end_date', from),
      ])
      if (timed.error) throw toAppError(timed.error, 'Impossible de charger l’agenda.')
      if (allDay.error) throw toAppError(allDay.error, 'Impossible de charger l’agenda.')
      return [...timed.data, ...allDay.data].map((row) => toEvent(row as EventRow))
    },

    /** Synchronise tout de suite (sources non synchronisées depuis une minute). */
    async syncNow(): Promise<void> {
      const { error } = await db.functions.invoke('sync-calendars', { body: {} })
      if (error) throw new AppError('Synchronisation impossible pour le moment.')
    },

    /** Une synchronisation (réussie ou non) met la source à jour. */
    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'agenda', ['calendar_sources'], onChange, onStatus),
  }
}

export type AgendaApi = ReturnType<typeof createAgendaApi>
