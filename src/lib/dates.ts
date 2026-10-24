/** Dates « métier » manipulées au format ISO local AAAA-MM-JJ (sans fuseau). */
export type IsoDate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseIsoDate(iso: IsoDate): Date {
  const match = ISO_DATE.exec(iso)
  if (!match) throw new Error(`Date invalide : ${iso}`)
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (toIsoDate(date) !== iso) throw new Error(`Date invalide : ${iso}`)
  return date
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now)
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = parseIsoDate(iso)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** Fenêtre glissante : `count` jours consécutifs à partir de `start`. */
export function nextDays(start: IsoDate, count = 7): IsoDate[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
const fullFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const compactFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1)
}

/** « Lundi 20 octobre » */
export function formatDay(iso: IsoDate): string {
  return capitalize(dayFormatter.format(parseIsoDate(iso)))
}

/** « 20 octobre » */
export function formatShortDate(iso: IsoDate): string {
  return shortFormatter.format(parseIsoDate(iso))
}

/** « 20 octobre 2026 » */
export function formatFullDate(iso: IsoDate): string {
  return fullFormatter.format(parseIsoDate(iso))
}

/** « 20 oct. 2026 » */
export function formatCompactDate(iso: IsoDate): string {
  return compactFormatter.format(parseIsoDate(iso))
}

/** « Du 20 octobre au 26 octobre » */
export function formatRange(start: IsoDate, count = 7): string {
  return `Du ${formatShortDate(start)} au ${formatShortDate(addDays(start, count - 1))}`
}
