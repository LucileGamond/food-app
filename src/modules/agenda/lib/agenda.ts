// Module Agenda : sources (agendas Google suivis) et événements, tels que l'application les affiche.

import { occurrencesOn, type CalendarOccurrence } from '@agenda/occurrence.ts'
import { inScope, type AgendaScope } from '@agenda/scope.ts'
import type { CalendarProviderKind } from '@agenda/provider.ts'
import type { IsoDate } from '@/lib/dates'

export interface CalendarSource {
  id: string
  ownerId: string
  ownerName: string
  provider: CalendarProviderKind
  name: string
  lastSyncedAt: string | null
  /** Message de la dernière synchronisation ratée (null : réussie, ou pas encore faite). */
  lastError: string | null
}

/** Occurrence d'un agenda, avec sa source et son propriétaire. */
export type AgendaEvent = CalendarOccurrence & { id: string; sourceId: string; sourceName: string; ownerId: string; ownerName: string }

export type SourceStatus = 'pending' | 'ok' | 'error'

export function sourceStatus(source: Pick<CalendarSource, 'lastSyncedAt' | 'lastError'>): SourceStatus {
  if (source.lastError) return 'error'
  return source.lastSyncedAt ? 'ok' : 'pending'
}

/** Événements des agendas affichés. */
export function eventsInScope<T extends { ownerId: string }>(events: T[], viewerId: string, scope: AgendaScope): T[] {
  return events.filter((e) => inScope(e.ownerId, viewerId, scope))
}

/** Les jours et leurs événements, dans l'ordre d'affichage. */
export function eventsByDay(events: AgendaEvent[], days: IsoDate[]): { day: IsoDate; events: AgendaEvent[] }[] {
  return days.map((day) => ({ day, events: occurrencesOn(events, day) }))
}

/** Libellés du choix des agendas : « Moi », le prénom de l'autre, « Les deux ». */
export function scopeOptions(otherName: string): { value: AgendaScope; label: string }[] {
  return [
    { value: 'mine', label: 'Moi' },
    { value: 'other', label: otherName },
    { value: 'all', label: 'Les deux' },
  ]
}

/** Recherche du lieu dans Google Maps (adresse, ou nom d'un endroit). */
export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}
