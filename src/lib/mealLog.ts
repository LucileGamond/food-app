// Journal des repas réellement mangés : végé, non végé ou pas de repas, par personne et par moment de la journée.

import { addDays, parseIsoDate, type IsoDate } from './dates'
import type { Meal } from './meals'
import { guessRecipeVegetarian } from './recipeList'

export type LogSlot = 'BREAKFAST' | 'LUNCH' | 'DINNER'
export type LogKind = 'vegetarian' | 'meat' | 'skipped'

export const LOG_SLOTS: readonly { value: LogSlot; label: string }[] = [
  { value: 'BREAKFAST', label: 'Petit-déj' },
  { value: 'LUNCH', label: 'Midi' },
  { value: 'DINNER', label: 'Soir' },
]

export const LOG_KINDS: readonly { value: LogKind; label: string }[] = [
  { value: 'vegetarian', label: 'Végé' },
  { value: 'meat', label: 'Non végé' },
  { value: 'skipped', label: 'Pas de repas' },
]

export interface MealLogEntry {
  profile_id: string
  eaten_on: IsoDate
  slot: LogSlot
  kind: LogKind
}

/** Réponses d'une journée par moment. */
export type DayLog = Partial<Record<LogSlot, LogKind>>

/** Heure (Paris) du rappel du soir : la journée en cours compte comme « à remplir » à partir de là. */
export const EVENING_HOUR = 21
/** Jours passés que le bandeau de rappel regarde. */
export const LOOKBACK_DAYS = 7
/** Semaines des statistiques. */
export const STATS_WEEKS = 8

export function dayLog(entries: readonly MealLogEntry[], profileId: string, date: IsoDate): DayLog {
  const log: DayLog = {}
  for (const e of entries) if (e.profile_id === profileId && e.eaten_on === date) log[e.slot] = e.kind
  return log
}

export function isComplete(log: DayLog): boolean {
  return LOG_SLOTS.every((s) => log[s.value] !== undefined)
}

/**
 * Suggestions d'après le planning (midi et soir) : végé ou non selon la recette du repas prévu pour cette personne.
 * Pas de suggestion quand on ne peut rien dire ou que plusieurs repas prévus se contredisent.
 */
export function planSuggestions(meals: readonly Meal[], profileId: string, date: IsoDate): DayLog {
  const suggestions: DayLog = {}
  for (const slot of ['LUNCH', 'DINNER'] as const) {
    const guesses = meals
      .filter((m) => m.meal_date === date && m.slot === slot && m.people.includes(profileId))
      .map((m) => guessRecipeVegetarian(m.recipe))
    if (guesses.length === 0 || guesses.includes(null)) continue
    suggestions[slot] = guesses.every(Boolean) ? 'vegetarian' : 'meat'
  }
  return suggestions
}

/** Premier jour noté par cette personne (le rappel ne remonte pas avant qu'elle ait commencé). */
function firstLogged(entries: readonly MealLogEntry[], profileId: string): IsoDate | null {
  let first: IsoDate | null = null
  for (const e of entries) if (e.profile_id === profileId && (first === null || e.eaten_on < first)) first = e.eaten_on
  return first
}

/**
 * Jours à remplir, du plus récent au plus ancien : les jours passés incomplets des `LOOKBACK_DAYS` derniers jours
 * (pas avant le premier jour noté), et aujourd'hui à partir de `EVENING_HOUR`. Sans rien de noté : aujourd'hui
 * seulement, le soir.
 */
export function missingDays(entries: readonly MealLogEntry[], profileId: string, today: IsoDate, hour: number): IsoDate[] {
  const first = firstLogged(entries, profileId)
  const days: IsoDate[] = []
  if (hour >= EVENING_HOUR && !isComplete(dayLog(entries, profileId, today))) days.push(today)
  if (first === null) return days
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const day = addDays(today, -i)
    if (day < first) break
    if (!isComplete(dayLog(entries, profileId, day))) days.push(day)
  }
  return days
}

/** Jours complets d'affilée, jusqu'à aujourd'hui (ou hier tant qu'aujourd'hui n'est pas fini). */
export function streak(entries: readonly MealLogEntry[], profileId: string, today: IsoDate): number {
  const complete = new Set<IsoDate>()
  const byDay = new Map<IsoDate, DayLog>()
  for (const e of entries) {
    if (e.profile_id !== profileId) continue
    const log = byDay.get(e.eaten_on) ?? {}
    log[e.slot] = e.kind
    byDay.set(e.eaten_on, log)
  }
  for (const [day, log] of byDay) if (isComplete(log)) complete.add(day)
  let day = complete.has(today) ? today : addDays(today, -1)
  let count = 0
  while (complete.has(day)) {
    count += 1
    day = addDays(day, -1)
  }
  return count
}

/** Lundi de la semaine d'un jour. */
export function weekStart(date: IsoDate): IsoDate {
  const weekday = (parseIsoDate(date).getDay() + 6) % 7
  return addDays(date, -weekday)
}

export interface WeekStats {
  week: IsoDate
  vegetarian: number
  meat: number
}

/** Repas végés et non végés par semaine (« pas de repas » ignoré), des `weeks` dernières semaines, la plus ancienne d'abord. */
export function weeklyStats(entries: readonly MealLogEntry[], profileId: string, today: IsoDate, weeks = STATS_WEEKS): WeekStats[] {
  const current = weekStart(today)
  const stats = Array.from({ length: weeks }, (_, i) => ({ week: addDays(current, -7 * (weeks - 1 - i)), vegetarian: 0, meat: 0 }))
  const index = new Map(stats.map((s, i) => [s.week, i]))
  for (const e of entries) {
    if (e.profile_id !== profileId || e.kind === 'skipped' || e.eaten_on > today) continue
    const i = index.get(weekStart(e.eaten_on))
    if (i !== undefined) stats[i]![e.kind] += 1
  }
  return stats
}

/** Part de repas végés (0 à 100, arrondie), ou null sans repas. */
export function vegetarianShare(stats: { vegetarian: number; meat: number }): number | null {
  const total = stats.vegetarian + stats.meat
  return total === 0 ? null : Math.round((100 * stats.vegetarian) / total)
}

/** Premier jour chargé pour le journal (statistiques comprises). */
export function logRangeStart(today: IsoDate): IsoDate {
  return addDays(weekStart(today), -7 * (STATS_WEEKS - 1))
}

/**
 * Jours passés pas encore remplis (un moment au moins sans réponse), du plus récent au plus ancien : d'hier jusqu'au
 * premier jour noté, sans remonter avant `from`. Rien de noté : aucun jour (le journal n'a pas commencé).
 */
export function daysToFill(entries: readonly MealLogEntry[], profileId: string, today: IsoDate, from: IsoDate): IsoDate[] {
  const first = firstLogged(entries, profileId)
  if (first === null) return []
  const start = first > from ? first : from
  const days: IsoDate[] = []
  for (let day = addDays(today, -1); day >= start; day = addDays(day, -1)) {
    if (!isComplete(dayLog(entries, profileId, day))) days.push(day)
  }
  return days
}

/** Jours d'une semaine (à partir de son lundi), sans dépasser aujourd'hui. */
export function weekDays(week: IsoDate, today: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => d <= today)
}
