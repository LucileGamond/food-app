// Qui mange à la maison, créneau par créneau, d'après l'agenda de chacun et ses règles (Réglages).
//   - midi en semaine : au travail pour qui l'a choisi ;
//   - un rendez-vous pendant le repas retire la personne, sauf s'il contient un de ses mots-clés (« escalade ») ;
//   - un rendez-vous dans l'heure et demie qui précède (ou pendant) empêche de cuisiner : un plat long a besoin
//     d'une personne libre.
// Les journées entières (anniversaires, rappels) sont ignorées.

import { formatTime } from '@agenda/format.ts'
import { weekdayIndex } from '@/modules/agenda/lib/calendar'
import type { IsoDate } from '@/lib/dates'
import { SLOTS, type MealSlot, type Profile } from '@/lib/meals'
import { foldText } from '@/lib/text'

export interface PresenceRule {
  profileId: string
  weekdayLunchAtWork: boolean
  /** Rendez-vous qui n'empêchent pas de manger à la maison (« escalade »). */
  ignoredKeywords: string[]
}

export const DEFAULT_RULE: Omit<PresenceRule, 'profileId'> = { weekdayLunchAtWork: false, ignoredKeywords: [] }

export type PresenceEvent = { ownerId: string; title: string } & ({ allDay: true } | { allDay: false; startsAt: string; endsAt: string })

/** Heures des repas à Paris, en minutes depuis minuit. */
export const MEAL_WINDOWS: Record<MealSlot, { start: number; end: number }> = {
  LUNCH: { start: 12 * 60, end: 14 * 60 },
  DINNER: { start: 19 * 60, end: 21 * 60 },
}
/** Temps pour cuisiner avant le repas. */
export const COOKING_LEAD_MINUTES = 90

export interface SlotPresence {
  date: IsoDate
  slot: MealSlot
  /** Personnes à la maison, dans l'ordre des profils. */
  people: string[]
  /** Personnes à la maison sans rendez-vous avant le repas : elles ont le temps de cuisiner. */
  freeCooks: string[]
  /** Raison affichée par personne : absence, rendez-vous ignoré, ou occupée avant le repas. */
  notes: Record<string, string>
}

const PARIS = 'Europe/Paris'

/** Instant (ms) d'une heure de Paris (`minutes` depuis minuit) un jour donné. */
export function parisInstant(date: IsoDate, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  const wall = (instant: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone: PARIS, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date(instant))
        .map((x) => [x.type, Number(x.value)]),
    )
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!)
  }
  return guess - (wall(guess) - guess)
}

export function matchesKeyword(title: string, keywords: readonly string[]): boolean {
  const text = foldText(title)
  return keywords.map(foldText).some((k) => k !== '' && text.includes(k))
}

const overlaps = (event: { startsAt: string; endsAt: string }, from: number, to: number) =>
  Date.parse(event.startsAt) < to && Date.parse(event.endsAt) > from

export function computePresence({
  days,
  profiles,
  rules,
  events,
}: {
  days: IsoDate[]
  profiles: readonly Profile[]
  rules: readonly PresenceRule[]
  events: readonly PresenceEvent[]
}): SlotPresence[] {
  const timedEvents = events.filter((e): e is Extract<PresenceEvent, { allDay: false }> => !e.allDay)
  return days.flatMap((date) =>
    SLOTS.map((slot) => {
      const window = MEAL_WINDOWS[slot]
      const mealFrom = parisInstant(date, window.start)
      const mealTo = parisInstant(date, window.end)
      const cookFrom = parisInstant(date, window.start - COOKING_LEAD_MINUTES)
      const weekday = weekdayIndex(date) < 5
      const people: string[] = []
      const freeCooks: string[] = []
      const notes: Record<string, string> = {}
      for (const { id } of profiles) {
        const rule = rules.find((r) => r.profileId === id) ?? DEFAULT_RULE
        const own = timedEvents.filter((e) => e.ownerId === id)
        const label = (e: { startsAt: string; title: string }) => `${formatTime(e.startsAt)} ${e.title}`
        if (slot === 'LUNCH' && weekday && rule.weekdayLunchAtWork) {
          notes[id] = 'Au travail'
          continue
        }
        const during = own.filter((e) => overlaps(e, mealFrom, mealTo))
        const blocking = during.find((e) => !matchesKeyword(e.title, rule.ignoredKeywords))
        if (blocking) {
          notes[id] = label(blocking)
          continue
        }
        people.push(id)
        const before = own.find((e) => overlaps(e, cookFrom, mealTo))
        if (during[0]) notes[id] = `${label(during[0])} (mange à la maison)`
        else if (before) notes[id] = `Occupé avant : ${label(before)}`
        if (!before) freeCooks.push(id)
      }
      return { date, slot, people, freeCooks, notes }
    }),
  )
}

/** « escalade, Yoga ,, escalade » → ['escalade', 'Yoga'] (sans doublon ni vide, 20 au plus). */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/[,;\n]/)
    .map((k) => k.trim().replace(/\s+/g, ' ').slice(0, 40))
    .filter((k) => {
      const key = foldText(k)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}
