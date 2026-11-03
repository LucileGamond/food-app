// Suivi d'hydratation : verres bus dans la journée, objectif et heure du prochain rappel.

export interface WaterIntake {
  id: string
  volume_ml: number
  drunk_at: string
}

export const GLASSES = [
  { label: 'Petit verre', volumeMl: 200 },
  { label: 'Grand verre', volumeMl: 330 },
] as const

/** Plage des rappels (heure de Paris, comme le serveur) et délai sans boire avant un rappel. */
export const REMINDER_START_HOUR = 9
export const REMINDER_END_HOUR = 23
export const REMINDER_DELAY_MS = 4 * 3600 * 1000

const TIME_ZONE = 'Europe/Paris'

/** Date et heure à Paris d'un instant. */
function parisParts(at: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  )
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!, minute: parts.minute! }
}

/** Instant où il est `hour` h, heure de Paris, le même jour (à Paris) que `at`. */
export function parisTime(at: Date, hour: number): Date {
  const { year, month, day } = parisParts(at)
  const guess = Date.UTC(year, month - 1, day, hour)
  // Décalage de Paris à cet instant (1 h l'hiver, 2 h l'été).
  const seen = parisParts(new Date(guess))
  const offset = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) - guess
  return new Date(guess - offset)
}

/** Minuit à Paris : la journée de l'eau suit l'heure de Paris, comme les rappels, même en voyage. */
export function startOfDay(now: Date): Date {
  return parisTime(now, 0)
}

export function totalMl(intakes: WaterIntake[]): number {
  return intakes.reduce((sum, i) => sum + i.volume_ml, 0)
}

/** 1500 → « 1,5 L », 330 → « 0,33 L ». */
export function formatLiters(ml: number): string {
  return `${(Math.round(ml / 10) / 100).toLocaleString('fr-FR')} L`
}

/** 200 → « 20 cl ». */
export function formatCl(ml: number): string {
  return `${Math.round(ml / 10)} cl`
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « 2 h 10 », « 35 min ». */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`
}

export function lastDrink(intakes: WaterIntake[]): Date | null {
  const times = intakes.map((i) => Date.parse(i.drunk_at))
  return times.length ? new Date(Math.max(...times)) : null
}

/**
 * Heure du prochain rappel si rien n'est bu d'ici là (4 h après le dernier verre, ou après 9 h ; puis toutes les 4 h
 * après le rappel précédent, comme le serveur), null si l'objectif est atteint ou si elle tombe après 23 h.
 */
export function nextReminder(intakes: WaterIntake[], goalMl: number, now: Date): Date | null {
  if (totalMl(intakes) >= goalMl) return null
  const dayStart = parisTime(now, REMINDER_START_HOUR)
  const dayEnd = parisTime(now, REMINDER_END_HOUR)
  const last = lastDrink(intakes)
  const reference = last && last > dayStart ? last : dayStart
  let at = reference.getTime() + REMINDER_DELAY_MS
  // Heure passée : ce rappel est parti, le suivant vient 4 h après.
  while (at <= now.getTime()) at += REMINDER_DELAY_MS
  return at < dayEnd.getTime() ? new Date(at) : null
}
