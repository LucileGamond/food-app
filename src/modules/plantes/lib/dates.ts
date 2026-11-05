// Dates des arrosages : des jours civils (« YYYY-MM-DD ») calculés à l'heure de Paris, quel que soit le fuseau de
// l'appareil (les rappels du matin sont calculés de la même façon par le serveur).

import { daysBetween, toCivilDate, type CivilDate } from '@watering/civil-date.ts'

export type { CivilDate }

export const HOME_TIME_ZONE = 'Europe/Paris'

/** Jour du foyer (Paris). */
export function parisToday(now: Date = new Date()): CivilDate {
  return toCivilDate(now, HOME_TIME_ZONE)
}

function civilToUtcNoon(date: CivilDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fullDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const time = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit', timeZone: HOME_TIME_ZONE })

/** « mardi 20 octobre » */
export function formatLongDate(date: CivilDate): string {
  return longDate.format(civilToUtcNoon(date))
}

/** « 20 oct. » */
export function formatShortDate(date: CivilDate): string {
  return shortDate.format(civilToUtcNoon(date))
}

/** « 20 octobre 2026 » */
export function formatFullDate(date: CivilDate): string {
  return fullDate.format(civilToUtcNoon(date))
}

/** « 9 h 05 » (heure de Paris) */
export function formatTime(instant: string | Date): string {
  return time.format(typeof instant === 'string' ? new Date(instant) : instant).replace(':', ' h ')
}

/** « aujourd’hui », « hier », « demain », « dans 3 jours », « il y a 5 jours », sinon « le 20 oct. ». */
export function formatRelativeDay(date: CivilDate, reference: CivilDate): string {
  const diff = daysBetween(reference, date)
  if (diff === 0) return 'aujourd’hui'
  if (diff === -1) return 'hier'
  if (diff === 1) return 'demain'
  if (diff > 1 && diff <= 6) return `dans ${diff} jours`
  if (diff < -1 && diff >= -6) return `il y a ${-diff} jours`
  return `le ${formatShortDate(date)}`
}
