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

/** Plage des rappels (heure locale) et délai sans boire avant un rappel. */
export const REMINDER_START_HOUR = 9
export const REMINDER_END_HOUR = 23
export const REMINDER_DELAY_MS = 4 * 3600 * 1000

export function startOfDay(now: Date): Date {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  return day
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
 * Heure du prochain rappel si rien n'est bu d'ici là (4 h après le dernier verre, ou après 9 h),
 * null si l'objectif est atteint ou si elle tombe après 23 h.
 */
export function nextReminder(intakes: WaterIntake[], goalMl: number, now: Date): Date | null {
  if (totalMl(intakes) >= goalMl) return null
  const dayStart = startOfDay(now)
  dayStart.setHours(REMINDER_START_HOUR)
  const dayEnd = startOfDay(now)
  dayEnd.setHours(REMINDER_END_HOUR)
  const last = lastDrink(intakes)
  const reference = last && last > dayStart ? last : dayStart
  const at = new Date(reference.getTime() + REMINDER_DELAY_MS)
  return at < dayEnd ? at : null
}
