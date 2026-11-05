/**
 * Dates civiles « YYYY-MM-DD » (sans heure ni fuseau) : les échéances d'arrosage sont des jours,
 * pas des instants. Toute l'arithmétique se fait en jours UTC pour éviter les pièges d'heure d'été.
 */
export type CivilDate = string

const DAY_MS = 86_400_000
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parts(date: CivilDate): { year: number; month: number; day: number } {
  const match = PATTERN.exec(date)
  if (!match) throw new RangeError(`Date invalide : ${date}`)
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new RangeError(`Date invalide : ${date}`)
  return { year, month, day }
}

export function isCivilDate(value: string): boolean {
  try {
    parts(value)
    return true
  } catch {
    return false
  }
}

export function makeDate(year: number, month: number, day: number): CivilDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toDayNumber(date: CivilDate): number {
  const { year, month, day } = parts(date)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

function fromDayNumber(dayNumber: number): CivilDate {
  const d = new Date(dayNumber * DAY_MS)
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(toDayNumber(date) + days)
}

/** Ajoute des mois en gardant le jour, ramené au dernier jour du mois si besoin (31 janv. + 1 mois = 28/29 févr.). */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const { year, month, day } = parts(date)
  const total = year * 12 + (month - 1) + months
  const y = Math.floor(total / 12)
  const m = total - y * 12 + 1
  return makeDate(y, m, Math.min(day, daysInMonth(y, m)))
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  return toDayNumber(to) - toDayNumber(from)
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Jour civil d'un instant dans un fuseau donné (par défaut Europe/Paris). */
export function toCivilDate(instant: Date | string, timeZone = 'Europe/Paris'): CivilDate {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  // en-CA formate en YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
