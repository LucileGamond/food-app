import { parseIsoDate, toIsoDate, type IsoDate } from './dates'
import type { Profile } from './meals'

export const WEIGHT_MIN_KG = 20
export const WEIGHT_MAX_KG = 300
/** Au-delà, on rappelle à la personne de se peser. */
export const STALE_AFTER_DAYS = 20

export interface WeightEntry {
  id: string
  profile_id: string
  measured_on: IsoDate
  weight_kg: number
}

export interface WeighInValue {
  profile_id: string
  weight_kg: number | null
}

// ---------------------------------------------------------------------------
// Saisie et affichage
// ---------------------------------------------------------------------------

/** « 62,5 » / « 62.5 » → 62.5 ; vide → null ; invalide → NaN. */
export function parseWeightInput(raw: string): number | null {
  const value = raw.trim().replace(',', '.')
  if (value === '') return null
  if (!/^\d+(\.\d+)?$/.test(value)) return Number.NaN
  return Number(value)
}

/** Message d'erreur pour une saisie de poids, ou null si elle est valide (ou vide). */
export function weightInputError(raw: string): string | null {
  const value = parseWeightInput(raw)
  if (value === null) return null
  if (Number.isNaN(value)) return 'Poids invalide'
  if (!/^\d+([.,]\d)?$/.test(raw.trim())) return 'Une décimale maximum'
  if (value < WEIGHT_MIN_KG || value > WEIGHT_MAX_KG) return `Entre ${WEIGHT_MIN_KG} et ${WEIGHT_MAX_KG} kg`
  return null
}

const kgFormatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatKg(value: number): string {
  return `${kgFormatter.format(value)} kg`
}

/** « +1,2 kg », « −0,4 kg », « 0,0 kg ». */
export function formatDeltaKg(delta: number): string {
  const rounded = Math.round(delta * 10) / 10
  if (rounded === 0) return '0,0 kg'
  return `${rounded > 0 ? '+' : '−'}${kgFormatter.format(Math.abs(rounded))} kg`
}

export function formatWeightInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : kgFormatter.format(value)
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

export function sortByDate(entries: readonly WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => a.measured_on.localeCompare(b.measured_on))
}

export function entriesOf(entries: readonly WeightEntry[], profileId: string): WeightEntry[] {
  return sortByDate(entries.filter((e) => e.profile_id === profileId))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000)
}

export interface PersonSummary {
  profile: Profile
  latest: WeightEntry | null
  /** Écart avec la mesure précédente. */
  deltaPrevious: number | null
  /** Écart entre la première et la dernière mesure de la période affichée. */
  deltaPeriod: number | null
  min: number | null
  max: number | null
  daysSinceLatest: number | null
}

/** Synthèse d'une personne : dernière mesure (la sienne, pas celle du dernier relevé commun), écarts, min/max sur la période. */
export function summarize(entries: readonly WeightEntry[], profile: Profile, from: IsoDate | null, today: IsoDate): PersonSummary {
  const all = entriesOf(entries, profile.id)
  const latest = all.at(-1) ?? null
  const previous = all.at(-2) ?? null
  const inPeriod = from ? all.filter((e) => e.measured_on >= from) : all
  const values = inPeriod.map((e) => e.weight_kg)
  const first = inPeriod[0]
  const last = inPeriod.at(-1)
  return {
    profile,
    latest,
    deltaPrevious: latest && previous ? latest.weight_kg - previous.weight_kg : null,
    deltaPeriod: first && last && first !== last ? last.weight_kg - first.weight_kg : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    daysSinceLatest: latest ? daysBetween(latest.measured_on, today) : null,
  }
}

/** Personnes à relancer : jamais pesées, ou dernière pesée il y a plus de `STALE_AFTER_DAYS` jours. */
export function staleProfiles(summaries: readonly PersonSummary[], threshold = STALE_AFTER_DAYS): PersonSummary[] {
  return summaries.filter((s) => s.daysSinceLatest === null || s.daysSinceLatest > threshold)
}

export function staleLabel(summary: PersonSummary): string {
  const name = summary.profile.display_name
  if (summary.daysSinceLatest === null) return `${name} : aucune pesée enregistrée`
  return `${name} : dernière pesée il y a ${summary.daysSinceLatest} jours`
}

// ---------------------------------------------------------------------------
// Périodes
// ---------------------------------------------------------------------------

export type WeightPeriod = '3m' | '6m' | '1y' | 'all'

export const PERIODS: { value: WeightPeriod; label: string }[] = [
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
  { value: 'all', label: 'Tout' },
]

/** Premier jour de la période, ou null pour tout l'historique. */
export function periodStart(period: WeightPeriod, today: IsoDate): IsoDate | null {
  if (period === 'all') return null
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
  const date = parseIsoDate(today)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() - months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return toIsoDate(date)
}

export function filterFrom(entries: readonly WeightEntry[], from: IsoDate | null): WeightEntry[] {
  return from ? entries.filter((e) => e.measured_on >= from) : [...entries]
}

// ---------------------------------------------------------------------------
// Tableau : un relevé par date
// ---------------------------------------------------------------------------

export interface WeighInRow {
  date: IsoDate
  weights: Record<string, number>
}

/** Relevés groupés par date, du plus récent au plus ancien. */
export function groupByDate(entries: readonly WeightEntry[]): WeighInRow[] {
  const rows = new Map<IsoDate, WeighInRow>()
  for (const e of entries) {
    const row = rows.get(e.measured_on) ?? { date: e.measured_on, weights: {} }
    row.weights[e.profile_id] = e.weight_kg
    rows.set(e.measured_on, row)
  }
  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date))
}

// ---------------------------------------------------------------------------
// Formulaire de relevé
// ---------------------------------------------------------------------------

export interface WeighInFormValues {
  date: IsoDate
  weights: Record<string, string>
}

export type WeighInFormErrors = { date?: string; form?: string; weights?: Record<string, string> }

export function validateWeighIn(values: WeighInFormValues, today: IsoDate): WeighInFormErrors {
  const errors: WeighInFormErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Date obligatoire'
  else if (values.date > today) errors.date = 'La date ne peut pas être dans le futur'

  const weightErrors: Record<string, string> = {}
  for (const [id, raw] of Object.entries(values.weights)) {
    const error = weightInputError(raw)
    if (error) weightErrors[id] = error
  }
  if (Object.keys(weightErrors).length > 0) errors.weights = weightErrors
  if (!Object.values(values.weights).some((raw) => parseWeightInput(raw) !== null)) {
    errors.form = 'Renseigne au moins un poids'
  }
  return errors
}

/** Valeurs à enregistrer : un poids vide efface la mesure existante de la personne à cette date. */
export function toWeighInValues(values: WeighInFormValues): WeighInValue[] {
  return Object.entries(values.weights).map(([profile_id, raw]) => ({ profile_id, weight_kg: parseWeightInput(raw) }))
}

// ---------------------------------------------------------------------------
// Graphique
// ---------------------------------------------------------------------------

/** Domaine Y lisible : marge de 15 % (1 kg mini), écart d'au moins 2 kg, bornes entières. */
export function yDomain(values: readonly number[]): [number, number] {
  if (values.length === 0) return [50, 90]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(max - min, 2)
  const margin = Math.max(spread * 0.15, 1)
  const middle = (min + max) / 2
  return [Math.floor(middle - spread / 2 - margin), Math.ceil(middle + spread / 2 + margin)]
}

/** Graduations Y « rondes » (pas de 1, 2, 5 ou 10 kg) pour 3 à 7 lignes. */
export function yTicks([min, max]: [number, number]): number[] {
  const step = [1, 2, 5, 10, 20].find((s) => (max - min) / s <= 6) ?? 50
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v)
  return ticks
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' })
const monthYearFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' })

/** Graduations X au 1er du mois, espacées pour ne pas dépasser `maxTicks`. */
export function xTicks(from: IsoDate, to: IsoDate, maxTicks = 6): { date: IsoDate; label: string }[] {
  const start = parseIsoDate(from)
  const end = parseIsoDate(to)
  const months: Date[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  if (start.getDate() === 1) cursor.setMonth(cursor.getMonth() - 1)
  while (cursor <= end) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const step = Math.max(1, Math.ceil(months.length / maxTicks))
  const spansYears = start.getFullYear() !== end.getFullYear()
  return months
    .filter((_, i) => i % step === 0)
    .map((d) => ({
      date: toIsoDate(d),
      label: (spansYears ? monthYearFormatter : monthFormatter).format(d).replace('.', ''),
    }))
}
