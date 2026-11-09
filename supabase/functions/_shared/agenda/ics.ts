/**
 * Lecture d'un agenda au format iCalendar (RFC 5545) : occurrences des événements sur une période, récurrences
 * (RRULE, RDATE, EXDATE), exceptions (RECURRENCE-ID) et fuseaux (VTIMEZONE) compris, grâce à ical.js.
 * Utilisé par la synchronisation (sync-calendars) seulement : l'application ne lit jamais de fichier iCal.
 */

import ICAL from 'ical.js'
import { makeDate, addDays, type CivilDate } from '../watering/civil-date.ts'
import { AGENDA_TIME_ZONE, type CalendarOccurrence } from './occurrence.ts'
import { CalendarSyncError, type SyncWindow } from './provider.ts'

/** Répétitions parcourues au plus par événement (un événement quotidien depuis 50 ans reste lisible). */
const MAX_ITERATIONS = 20_000
const MAX_TITLE = 500
const MAX_DESCRIPTION = 4000
const MAX_UID = 1000
const UNTITLED = 'Sans titre'

type IcalTime = InstanceType<typeof ICAL.Time>
type IcalEvent = InstanceType<typeof ICAL.Event>
type IcalComponent = InstanceType<typeof ICAL.Component>

export function parseIcs(text: string, window: SyncWindow): CalendarOccurrence[] {
  const calendar = readCalendar(text)
  registerTimezones(calendar)
  const events = linkExceptions(calendar.getAllSubcomponents('vevent'))
  return events.flatMap((event) => (event.isRecurring() ? expand(event, window) : single(event, window)))
}

function readCalendar(text: string): IcalComponent {
  let calendar: IcalComponent
  try {
    calendar = new ICAL.Component(ICAL.parse(text) as unknown[])
  } catch {
    throw new CalendarSyncError('Le contenu reçu n’est pas un agenda lisible.')
  }
  if (calendar.name !== 'vcalendar') throw new CalendarSyncError('Le contenu reçu n’est pas un agenda lisible.')
  return calendar
}

/** Fuseaux décrits par le fichier (avant de lire la moindre date : ical.js les résout à la lecture). */
function registerTimezones(calendar: IcalComponent) {
  for (const component of calendar.getAllSubcomponents('vtimezone')) {
    const tzid = component.getFirstPropertyValue('tzid')
    if (typeof tzid === 'string' && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(component)
  }
}

/** Événements principaux, chacun avec ses exceptions ; une exception orpheline devient un événement simple. */
function linkExceptions(components: IcalComponent[]): IcalEvent[] {
  const masters = new Map<string, IcalEvent>()
  const exceptions: IcalEvent[] = []
  for (const component of components) {
    const event = new ICAL.Event(component)
    if (event.isRecurrenceException()) exceptions.push(event)
    else masters.set(event.uid, event)
  }
  const orphans: IcalEvent[] = []
  for (const exception of exceptions) {
    const master = masters.get(exception.uid)
    if (master?.isRecurring()) master.relateException(exception)
    else orphans.push(exception)
  }
  return [...masters.values(), ...orphans]
}

function isCancelled(event: IcalEvent): boolean {
  return String(event.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
}

function single(event: IcalEvent, window: SyncWindow): CalendarOccurrence[] {
  if (isCancelled(event) || !event.startDate) return []
  // Exception reçue sans sa série (invitation à une seule réunion d'une série) : uid de la répétition, comme pour une
  // série, sinon plusieurs exceptions de la même série partageraient le même uid et une seule serait gardée.
  const uid = event.isRecurrenceException() ? `${event.uid}#${event.recurrenceId.toString()}` : event.uid
  const occurrence = toOccurrence(uid, event, event.startDate, event.endDate)
  return overlaps(occurrence, window) ? [occurrence] : []
}

function expand(event: IcalEvent, window: SyncWindow): CalendarOccurrence[] {
  if (isCancelled(event)) return []
  const occurrences: CalendarOccurrence[] = []
  // Répétitions passées : sautées sans les détailler (une série quotidienne depuis des années reste rapide), sauf
  // celles déplacées par une exception, qui peuvent tomber dans la période.
  const duration = event.endDate ? Math.max(0, instantMs(event.endDate) - instantMs(event.startDate)) : 0
  const moved = new Set(Object.values(event.exceptions as unknown as Record<string, IcalEvent>).map((e) => e.recurrenceId.toString()))
  const iterator = event.iterator()
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = iterator.next()
    if (!next || instantMs(next) >= window.to.getTime()) break
    if (instantMs(next) + duration < window.from.getTime() && !moved.has(next.toString())) continue
    const details = event.getOccurrenceDetails(next)
    if (isCancelled(details.item)) continue
    const occurrence = toOccurrence(`${event.uid}#${details.recurrenceId.toString()}`, details.item, details.startDate, details.endDate)
    if (overlaps(occurrence, window)) occurrences.push(occurrence)
  }
  return occurrences
}

function toOccurrence(uid: string, event: IcalEvent, start: IcalTime, end: IcalTime | null): CalendarOccurrence {
  const base = { uid: uid.slice(0, MAX_UID), title: text(event.summary) ?? UNTITLED, location: text(event.location), description: plainText(event.description) }
  if (start.isDate) {
    const startDate = civilDate(start)
    const endDate = end?.isDate ? civilDate(end) : addDays(startDate, 1)
    return { ...base, allDay: true, startDate, endDate: endDate > startDate ? endDate : addDays(startDate, 1) }
  }
  const startsAt = new Date(instantMs(start)).toISOString()
  const endsAt = end && instantMs(end) > instantMs(start) ? new Date(instantMs(end)).toISOString() : startsAt
  return { ...base, allDay: false, startsAt, endsAt }
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, MAX_TITLE) : null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Description en texte simple : Google y met parfois du HTML (<br>, liens) ; les liens gardent leur adresse. */
export function plainText(value: string | null | undefined): string | null {
  if (!value) return null
  const text = value
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_, href: string, label: string) => (label.trim() && label.trim() !== href ? `${label} (${href})` : href))
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (entity: string, code: string) => (code.startsWith('#') ? String.fromCharCode(Number(code.slice(1))) : (ENTITIES[code.toLowerCase()] ?? entity)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text ? text.slice(0, MAX_DESCRIPTION) : null
}

function civilDate(time: IcalTime): CivilDate {
  return makeDate(time.year, time.month, time.day)
}

/**
 * Instant d'une heure iCal. UTC ou fuseau décrit par le fichier : ical.js sait faire. Heure « flottante » (sans
 * fuseau, ou fuseau non décrit) : c'est l'heure de Paris, pas celle du serveur (UTC).
 */
function instantMs(time: IcalTime): number {
  const tzid = time.zone?.tzid
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day)
  if (tzid && tzid !== 'floating') return time.toJSDate().getTime()
  return wallTimeMs(time, AGENDA_TIME_ZONE)
}

/** Instant où il est (année, mois, jour, heure…) à l'horloge du fuseau. */
function wallTimeMs(time: IcalTime, timeZone: string): number {
  const asUtc = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second)
  const first = asUtc - offsetMs(asUtc, timeZone)
  // Deuxième passage : l'écart peut changer entre les deux instants (changement d'heure).
  return asUtc - offsetMs(first, timeZone)
}

function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, Number(p.value)]),
  )
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - Math.floor(instant / 1000) * 1000
}

function overlaps(occurrence: CalendarOccurrence, window: SyncWindow): boolean {
  const [start, end] = occurrence.allDay
    ? [Date.parse(`${occurrence.startDate}T00:00:00Z`), Date.parse(`${occurrence.endDate}T00:00:00Z`)]
    : [Date.parse(occurrence.startsAt), Math.max(Date.parse(occurrence.endsAt), Date.parse(occurrence.startsAt) + 1)]
  return end > window.from.getTime() && start < window.to.getTime()
}
