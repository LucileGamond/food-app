// Horaires des événements d'agenda, en français (« 9 h 30 – 10 h »), pour l'application et les notifications.

import type { CivilDate } from '../watering/civil-date.ts'
import { AGENDA_TIME_ZONE, occurrenceDays, type OccurrenceTime } from './occurrence.ts'

/** « 9 h », « 14 h 30 ». */
export function formatTime(instant: string, timeZone = AGENDA_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return minute === '00' ? `${hour} h` : `${hour} h ${minute}`
}

/**
 * Horaire d'une occurrence vu depuis un jour : « Journée », « 9 h – 10 h 30 », et pour un rendez-vous sur plusieurs
 * jours, « dès 18 h » (premier jour), « jusqu’à 12 h » (dernier jour) ou « Journée » (entre les deux).
 */
export function formatOccurrenceTime(time: OccurrenceTime, day: CivilDate, timeZone = AGENDA_TIME_ZONE): string {
  if (time.allDay) return 'Journée'
  const { first, last } = occurrenceDays(time, timeZone)
  const startsToday = first === day
  const endsToday = last === day
  if (startsToday && endsToday) return time.endsAt === time.startsAt ? formatTime(time.startsAt, timeZone) : `${formatTime(time.startsAt, timeZone)} – ${formatTime(time.endsAt, timeZone)}`
  if (startsToday) return `dès ${formatTime(time.startsAt, timeZone)}`
  if (endsToday) return `jusqu’à ${formatTime(time.endsAt, timeZone)}`
  return 'Journée'
}
