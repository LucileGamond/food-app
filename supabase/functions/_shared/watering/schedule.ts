/**
 * Moteur de planification des arrosages, partagé entre l'application (Vite) et l'Edge Function (Deno).
 * TypeScript pur, sans dépendance.
 *
 * Une règle couvre un bloc de mois consécutifs (ex. juin → août, ou novembre → février) et donne
 * la quantité, la fréquence (tous les N jours / semaines / mois) et la date du 1er arrosage.
 * Chaque année, le rythme est calé sur le jour et le mois du 1er arrosage et appliqué à toute la période
 * (avant comme après ce jour), mais jamais avant le tout premier arrosage.
 */
import { addDays, addMonths, compareDates, daysBetween, daysInMonth, makeDate, parts, type CivilDate } from './civil-date.ts'

export type IntervalUnit = 'day' | 'week' | 'month'

export interface WateringRule {
  id: string
  months: number[]
  firstWateringOn: CivilDate
  intervalCount: number
  intervalUnit: IntervalUnit
  amountMl: number
}

export interface WateringEvent {
  id: string
  scheduledOn: CivilDate | null
  /** Jour civil de l'arrosage (fuseau du foyer). */
  wateredOn: CivilDate
}

export interface Occurrence {
  date: CivilDate
  ruleId: string
  amountMl: number
}

export interface PlantSchedule {
  /** Échéance passée ou du jour, pas encore faite (les oublis plus anciens ne s'empilent pas). */
  pending: Occurrence | null
  overdueDays: number
  /** Prochaine échéance strictement après aujourd'hui. */
  next: Occurrence | null
}

/** Horizon de recherche des échéances : un peu plus d'un an. */
export const HORIZON_DAYS = 400

function shift(anchor: CivilDate, k: number, rule: WateringRule): CivilDate {
  switch (rule.intervalUnit) {
    case 'day':
      return addDays(anchor, k * rule.intervalCount)
    case 'week':
      return addDays(anchor, k * rule.intervalCount * 7)
    case 'month':
      return addMonths(anchor, k * rule.intervalCount)
  }
}

/** Indice k approché tel que shift(anchor, k) ≈ target (évite de boucler depuis l'ancre). */
function estimateIndex(anchor: CivilDate, target: CivilDate, rule: WateringRule): number {
  if (rule.intervalUnit === 'month') {
    const a = parts(anchor)
    const t = parts(target)
    return Math.floor(((t.year - a.year) * 12 + (t.month - a.month)) / rule.intervalCount)
  }
  const step = rule.intervalCount * (rule.intervalUnit === 'week' ? 7 : 1)
  return Math.floor(daysBetween(anchor, target) / step)
}

/** Premier mois du bloc (celui dont le mois précédent n'est pas sélectionné), null si toute l'année. */
export function blockStartMonth(months: number[]): number | null {
  const set = new Set(months)
  if (set.size === 12) return null
  return months.find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? null
}

/** Échéances d'une règle entre `from` et `to` inclus, triées. */
export function occurrences(rule: WateringRule, from: CivilDate, to: CivilDate): Occurrence[] {
  const lower = compareDates(from, rule.firstWateringOn) > 0 ? from : rule.firstWateringOn
  if (compareDates(lower, to) > 0) return []

  const dates = new Set<CivilDate>()
  const collect = (anchor: CivilDate, start: CivilDate, end: CivilDate) => {
    const lo = compareDates(start, lower) > 0 ? start : lower
    const hi = compareDates(end, to) < 0 ? end : to
    if (compareDates(lo, hi) > 0) return
    // Chaque date est calculée depuis l'ancre : pas de dérive (31 janv. → 28 févr. → 31 mars).
    let k = estimateIndex(anchor, lo, rule)
    while (compareDates(shift(anchor, k, rule), lo) >= 0) k--
    for (let date = shift(anchor, ++k, rule); compareDates(date, hi) <= 0; date = shift(anchor, ++k, rule)) {
      dates.add(date)
    }
  }

  const start = blockStartMonth(rule.months)
  if (start === null) {
    collect(rule.firstWateringOn, rule.firstWateringOn, to)
  } else {
    const anchorParts = parts(rule.firstWateringOn)
    const lastMonthIndex = start - 1 + rule.months.length - 1
    const offset = (anchorParts.month - start + 12) % 12
    for (let year = parts(lower).year - 1; year <= parts(to).year; year++) {
      const endYear = year + Math.floor(lastMonthIndex / 12)
      const endMonth = (lastMonthIndex % 12) + 1
      const anchorYear = year + (start - 1 + offset >= 12 ? 1 : 0)
      const anchorDay = Math.min(anchorParts.day, daysInMonth(anchorYear, anchorParts.month))
      collect(
        makeDate(anchorYear, anchorParts.month, anchorDay),
        makeDate(year, start, 1),
        makeDate(endYear, endMonth, daysInMonth(endYear, endMonth)),
      )
    }
  }

  return [...dates].sort().map((date) => ({ date, ruleId: rule.id, amountMl: rule.amountMl }))
}

/** Échéances de toutes les règles d'une plante entre deux dates, triées. */
export function scheduleBetween(rules: WateringRule[], from: CivilDate, to: CivilDate): Occurrence[] {
  return rules.flatMap((rule) => occurrences(rule, from, to)).sort((a, b) => compareDates(a.date, b.date))
}

/** Les `count` prochaines échéances à partir de `from` (inclus). */
export function upcoming(rules: WateringRule[], from: CivilDate, count: number): Occurrence[] {
  return scheduleBetween(rules, from, addDays(from, HORIZON_DAYS)).slice(0, count)
}

/**
 * Une échéance est faite si un arrosage la couvre explicitement,
 * ou si un arrosage hors planning a eu lieu ce jour-là ou après.
 */
export function isDone(occurrence: Occurrence, events: WateringEvent[]): boolean {
  return events.some((e) =>
    e.scheduledOn !== null ? e.scheduledOn === occurrence.date : compareDates(e.wateredOn, occurrence.date) >= 0,
  )
}

/**
 * État d'une plante : échéance à faire (la plus récente seulement, et seulement tant que sa période
 * de l'année est en cours : un oubli d'août n'a plus de sens en octobre) et prochaine échéance.
 */
export function plantSchedule(rules: WateringRule[], events: WateringEvent[], today: CivilDate): PlantSchedule {
  const latest = scheduleBetween(rules, addDays(today, -HORIZON_DAYS), today).at(-1) ?? null
  const seasonOngoing = latest !== null && rules.some((r) => r.id === latest.ruleId && r.months.includes(parts(today).month))
  const pending = latest && seasonOngoing && !isDone(latest, events) ? latest : null
  const next = scheduleBetween(rules, addDays(today, 1), addDays(today, HORIZON_DAYS))[0] ?? null
  return { pending, overdueDays: pending ? daysBetween(pending.date, today) : 0, next }
}
