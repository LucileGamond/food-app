/**
 * Événements d'agenda, partagés entre l'application (Vite) et les Edge Functions (Deno). TypeScript pur, sans
 * dépendance : ce qu'est une occurrence, les jours qu'elle couvre et leur ordre d'affichage.
 */

import { addDays, compareDates, toCivilDate, type CivilDate } from '../watering/civil-date.ts'

/** Fuseau du foyer : un rendez-vous appartient au jour où il tombe à Paris. */
export const AGENDA_TIME_ZONE = 'Europe/Paris'

/** Journée entière (fin exclue, comme en iCal) ou rendez-vous à heure fixe (instants ISO). */
export type OccurrenceTime = { allDay: true; startDate: CivilDate; endDate: CivilDate } | { allDay: false; startsAt: string; endsAt: string }

/** Une occurrence d'un événement (un événement récurrent en a une par répétition). */
export type CalendarOccurrence = OccurrenceTime & {
  /** Identifiant stable dans sa source : uid de l'événement, suivi de la répétition s'il est récurrent. */
  uid: string
  title: string
  location: string | null
}

/** Premier et dernier jour (inclus) couverts par une occurrence. */
export function occurrenceDays(time: OccurrenceTime, timeZone = AGENDA_TIME_ZONE): { first: CivilDate; last: CivilDate } {
  if (time.allDay) return { first: time.startDate, last: addDays(time.endDate, -1) }
  const start = Date.parse(time.startsAt)
  // Un rendez-vous qui finit pile à minuit ne déborde pas sur le lendemain.
  const lastInstant = Math.max(start, Date.parse(time.endsAt) - 1)
  return { first: toCivilDate(new Date(start), timeZone), last: toCivilDate(new Date(lastInstant), timeZone) }
}

export function occursOn(time: OccurrenceTime, day: CivilDate, timeZone = AGENDA_TIME_ZONE): boolean {
  const { first, last } = occurrenceDays(time, timeZone)
  return compareDates(first, day) <= 0 && compareDates(day, last) <= 0
}

/** Début, pour le tri : minuit (UTC) du jour pour une journée entière. */
function startMs(time: OccurrenceTime): number {
  return time.allDay ? Date.parse(`${time.startDate}T00:00:00Z`) : Date.parse(time.startsAt)
}

/** Journées entières d'abord, puis par heure de début, puis par titre. */
export function compareOccurrences(a: OccurrenceTime & { title: string }, b: OccurrenceTime & { title: string }): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return startMs(a) - startMs(b) || a.title.localeCompare(b.title, 'fr')
}

/** Occurrences d'un jour, dans l'ordre d'affichage. */
export function occurrencesOn<T extends OccurrenceTime & { title: string }>(occurrences: T[], day: CivilDate, timeZone = AGENDA_TIME_ZONE): T[] {
  return occurrences.filter((o) => occursOn(o, day, timeZone)).sort(compareOccurrences)
}
