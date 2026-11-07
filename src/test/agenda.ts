import type { AgendaEvent, CalendarSource } from '@/modules/agenda/lib/agenda'
import { ERIC, LUCILE } from './fakes'

export function sourceFixture(overrides: Partial<CalendarSource> = {}): CalendarSource {
  return { id: 's-lucile', ownerId: LUCILE.id, ownerName: LUCILE.display_name, provider: 'ical', name: 'Perso', lastSyncedAt: '2026-11-10T07:45:00Z', lastError: null, ...overrides }
}

export const ERIC_SOURCE = sourceFixture({ id: 's-eric', ownerId: ERIC.id, ownerName: ERIC.display_name, name: 'Travail' })

/** Rendez-vous de Lucile le 10 novembre 2026, 9 h – 10 h (Paris). */
export function eventFixture(overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id: `e-${Math.random()}`,
    sourceId: 's-lucile',
    uid: 'uid',
    title: 'Dentiste',
    location: null,
    ownerId: LUCILE.id,
    ownerName: LUCILE.display_name,
    allDay: false,
    startsAt: '2026-11-10T08:00:00Z',
    endsAt: '2026-11-10T09:00:00Z',
    ...overrides,
  } as AgendaEvent
}
