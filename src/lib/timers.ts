// Minuteurs du mode cuisine : durées repérées dans les étapes (« 20 min », « 1 h 30 ») et décompte.

export interface StepDuration {
  /** Position du texte de la durée dans l'étape. */
  start: number
  end: number
  /** Texte tel qu'écrit (« 20 à 25 min »). */
  text: string
  seconds: number
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const HOURS = String.raw`h|heures?|hours?|hrs?`
const MINUTES = String.raw`min(?:utes?|s)?|mn`
const SECONDS = String.raw`s(?:ec(?:onde?s?|s)?)|seconds?`
// « 1 h 30 », « 1h30 », « 2 heures et 15 min » ; sinon « 20 min », « 20 à 25 min », « 10-12 minutes », « 30 secondes ».
const DURATION = new RegExp(
  String.raw`(\d+)\s*(?:${HOURS})\s*(?:et\s*)?(\d{1,2})(?:\s*(?:${MINUTES}))?(?![\p{L}\d])` +
    String.raw`|(${NUMBER})(?:\s*(?:à|a|-|–|to|ou|or)\s*${NUMBER})?\s*(${HOURS}|${MINUTES}|${SECONDS})(?![\p{L}])`,
  'giu',
)

/** Au plus 24 h : au-delà, ce n'est plus un minuteur (marinade de 2 jours). */
export const TIMER_MAX_SECONDS = 24 * 3600

/** Durées d'une étape, dans l'ordre. Pour une fourchette (« 20 à 25 min »), la plus courte : on vérifie la cuisson plus tôt. */
export function findDurations(text: string): StepDuration[] {
  const found: StepDuration[] = []
  for (const match of text.matchAll(DURATION)) {
    const [whole, hours, minutes, value, unit] = match
    let seconds: number
    if (hours !== undefined) seconds = Number(hours) * 3600 + Number(minutes) * 60
    else {
      const amount = Number(value.replace(',', '.'))
      const u = unit.toLowerCase()
      seconds = Math.round(amount * (u.startsWith('h') ? 3600 : u.startsWith('m') ? 60 : 1))
    }
    if (seconds <= 0 || seconds > TIMER_MAX_SECONDS) continue
    found.push({ start: match.index, end: match.index + whole.length, text: whole, seconds })
  }
  return found
}

/** Identifiant du minuteur d'une durée d'étape : relancer la même durée ne crée pas de doublon. */
export const stepTimerId = (step: number, start: number) => `etape-${step}-${start}`

/** Un minuteur : en marche (`endsAt`, heure de fin), ou en pause (`remaining`, en millisecondes). */
export interface Timer {
  id: string
  label: string
  seconds: number
  endsAt: number | null
  remaining: number
}

export function startTimer(id: string, label: string, seconds: number, now: number): Timer {
  return { id, label, seconds, endsAt: now + seconds * 1000, remaining: seconds * 1000 }
}

/** Temps restant en millisecondes (0 une fois terminé). */
export function remainingMs(timer: Timer, now: number): number {
  return timer.endsAt === null ? timer.remaining : Math.max(0, timer.endsAt - now)
}

export function isRinging(timer: Timer, now: number): boolean {
  return timer.endsAt !== null && timer.endsAt <= now
}

export function pauseTimer(timer: Timer, now: number): Timer {
  return timer.endsAt === null ? timer : { ...timer, endsAt: null, remaining: remainingMs(timer, now) }
}

export function resumeTimer(timer: Timer, now: number): Timer {
  return timer.endsAt === null ? { ...timer, endsAt: now + timer.remaining } : timer
}

/** Une minute de plus ; un minuteur qui sonne repart pour une minute. */
export function addMinute(timer: Timer, now: number): Timer {
  if (timer.endsAt === null) return { ...timer, remaining: timer.remaining + 60_000 }
  return { ...timer, endsAt: Math.max(timer.endsAt, now) + 60_000 }
}

/** « 4:05 », « 1:02:30 » : arrondi à la seconde supérieure (1 ms restante affiche 0:01). */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** « 20 min », « 1 h 30 », « 45 s » : durée lisible d'un minuteur. */
export function formatTimerDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`
  return `${s} s`
}

/** Minuteurs enregistrés (localStorage) : relus tels quels s'ils ont la bonne forme, sinon ignorés. */
export function parseTimers(raw: string | null): Timer[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter(
      (t): t is Timer =>
        typeof t === 'object' &&
        t !== null &&
        typeof t.id === 'string' &&
        typeof t.label === 'string' &&
        typeof t.seconds === 'number' &&
        (t.endsAt === null || typeof t.endsAt === 'number') &&
        typeof t.remaining === 'number',
    )
  } catch {
    return []
  }
}

/** Téléphone Android : il a un minuteur (appli Horloge) qu'on peut essayer de lancer. */
export const isAndroid = (userAgent: string) => /Android/i.test(userAgent)

/**
 * Lien qui lance le minuteur de l'Horloge Android (intention SET_TIMER : durée en secondes et nom), si Chrome
 * l'autorise : il sonne même appli fermée ou téléphone verrouillé.
 */
export function androidTimerUrl(seconds: number, label: string): string {
  const length = Math.max(1, Math.round(seconds))
  const message = encodeURIComponent(label).replace(/;/g, '%3B')
  return `intent:#Intent;action=android.intent.action.SET_TIMER;i.android.intent.extra.alarm.LENGTH=${length};S.android.intent.extra.alarm.MESSAGE=${message};B.android.intent.extra.alarm.SKIP_UI=false;end`
}
