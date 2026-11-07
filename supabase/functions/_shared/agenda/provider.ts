/**
 * Fournisseurs d'agenda : d'où viennent les événements d'une source. Aujourd'hui l'adresse iCal secrète d'un agenda
 * Google ; demain la connexion Google (OAuth) : il suffira d'ajouter son type d'accès et son fournisseur, la
 * synchronisation (sync-calendars) n'en dépend pas.
 */

import type { CalendarOccurrence } from './occurrence.ts'

/** Accès à une source iCal : son adresse secrète. */
export interface IcalCredentials {
  provider: 'ical'
  url: string
}

/** Accès à une source, selon son fournisseur (OAuth : un `GoogleCredentials` viendra s'ajouter ici). */
export type CalendarCredentials = IcalCredentials

export type CalendarProviderKind = CalendarCredentials['provider']

/** Période synchronisée : de quoi afficher la semaine passée et les deux mois à venir. */
export interface SyncWindow {
  from: Date
  to: Date
}

export const SYNC_DAYS_BEFORE = 7
export const SYNC_DAYS_AFTER = 60

export function syncWindow(now: Date): SyncWindow {
  const day = 86_400_000
  return { from: new Date(now.getTime() - SYNC_DAYS_BEFORE * day), to: new Date(now.getTime() + SYNC_DAYS_AFTER * day) }
}

export interface CalendarProvider<C extends CalendarCredentials = CalendarCredentials> {
  readonly kind: C['provider']
  /** Occurrences qui touchent la période ; CalendarSyncError (message lisible) si la source est inutilisable. */
  fetchOccurrences(credentials: C, window: SyncWindow): Promise<CalendarOccurrence[]>
}

/** Un fournisseur par type de source. */
export type CalendarProviders = { [K in CalendarProviderKind]: CalendarProvider<Extract<CalendarCredentials, { provider: K }>> }

/** Erreur à montrer telle quelle sur la source (« Agenda introuvable… »). */
export class CalendarSyncError extends Error {
  override name = 'CalendarSyncError'
}
