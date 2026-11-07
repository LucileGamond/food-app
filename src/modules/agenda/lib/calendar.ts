// Périodes de l'agenda : semaine du lundi au dimanche, mois en grille de semaines complètes.

import { addDays, addMonths, daysBetween, makeDate, parts, type CivilDate } from '@watering/civil-date.ts'

export type AgendaView = 'semaine' | 'mois'

export interface Period {
  view: AgendaView
  /** Premier et dernier jour affichés (inclus). */
  from: CivilDate
  to: CivilDate
  days: CivilDate[]
}

/** 0 = lundi … 6 = dimanche. */
export function weekdayIndex(day: CivilDate): number {
  const { year, month, day: d } = parts(day)
  return (new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7
}

export function startOfWeek(day: CivilDate): CivilDate {
  return addDays(day, -weekdayIndex(day))
}

export function startOfMonth(day: CivilDate): CivilDate {
  const { year, month } = parts(day)
  return makeDate(year, month, 1)
}

function range(from: CivilDate, to: CivilDate): CivilDate[] {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i))
}

/** Jours affichés autour de `day` : sa semaine, ou les semaines complètes qui couvrent son mois. */
export function periodOf(view: AgendaView, day: CivilDate): Period {
  if (view === 'semaine') {
    const from = startOfWeek(day)
    const to = addDays(from, 6)
    return { view, from, to, days: range(from, to) }
  }
  const first = startOfMonth(day)
  const from = startOfWeek(first)
  const to = addDays(startOfWeek(addDays(addMonths(first, 1), -1)), 6)
  return { view, from, to, days: range(from, to) }
}

/** Même jour une semaine ou un mois plus tôt (`step` = -1) ou plus tard (+1). */
export function shift(view: AgendaView, day: CivilDate, step: number): CivilDate {
  return view === 'semaine' ? addDays(day, 7 * step) : addMonths(day, step)
}

export function sameMonth(a: CivilDate, b: CivilDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** « Novembre 2026 » */
export function formatMonth(day: CivilDate): string {
  const text = monthFormatter.format(new Date(`${startOfMonth(day)}T12:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const
