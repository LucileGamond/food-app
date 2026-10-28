import { addDays, formatCompactDate, formatShortDate, parseIsoDate, type IsoDate } from './dates'
import type { Database } from './database.types'

export type FoodMeal = Database['public']['Enums']['food_meal']

/** Moments de la journée, dans l'ordre d'affichage. */
export const MEALS: readonly { value: FoodMeal; label: string }[] = [
  { value: 'BREAKFAST', label: 'Petit-déjeuner' },
  { value: 'LUNCH', label: 'Déjeuner' },
  { value: 'SNACK', label: 'Collation' },
  { value: 'APERITIF', label: 'Apéritif' },
  { value: 'DINNER', label: 'Dîner' },
  { value: 'POOL', label: 'Pool alimentaire' },
  { value: 'SPORT', label: 'Sport' },
]

export const OCCURRENCES_MAX = 99
export const DEFAULT_PERIOD_DAYS = 14
/** Le rappel « période bientôt terminée » apparaît à partir de 2 jours avant la fin. */
export const ENDING_SOON_DAYS = 2

export function mealLabel(meal: FoodMeal): string {
  return MEALS.find((m) => m.value === meal)!.label
}

export interface PlanItem {
  id: string
  meal: FoodMeal
  category: string
  name: string
  quantity: number | null
  unit: string | null
  allowed_occurrences: number
  position: number
}

export interface Consumption {
  id: string
  consumed_on: IsoDate
  created_at: string
}

export interface PeriodItem extends PlanItem {
  consumptions: Consumption[]
}

export interface FoodPeriod {
  id: string
  profile_id: string
  start_date: IsoDate
  end_date: IsoDate
}

// ---------------------------------------------------------------------------
// Affichage

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** « 250 ml », « 62,5 g », « 150 ml ou g » ; vide sans quantité. */
export function formatPortion(quantity: number | null, unit: string | null): string {
  if (quantity === null) return ''
  const label = (unit ?? '').replace(/_/g, ' ').trim()
  return label ? `${numberFormatter.format(quantity)} ${label}` : numberFormatter.format(quantity)
}

/** « 19 oct. → 2 nov. 2026 » */
export function formatPeriod(period: Pick<FoodPeriod, 'start_date' | 'end_date'>): string {
  const sameYear = period.start_date.slice(0, 4) === period.end_date.slice(0, 4)
  const start = sameYear ? formatCompactDate(period.start_date).replace(/\s\d{4}$/, '') : formatCompactDate(period.start_date)
  return `${start} → ${formatCompactDate(period.end_date)}`
}

/** Recherche sans tenir compte des accents ni de la casse. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// Quotas

/** Ordre chronologique : les premières consommations entrent dans le quota, les suivantes sont hors plan. */
export function sortConsumptions(list: readonly Consumption[]): Consumption[] {
  return [...list].sort((a, b) => a.consumed_on.localeCompare(b.consumed_on) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export type DotKind = 'used' | 'free' | 'over'

export interface Dot {
  kind: DotKind
  /** Date de la consommation (pastilles utilisées et hors plan). */
  date?: IsoDate
}

export interface ItemUsage {
  used: number
  allowed: number
  remaining: number
  /** Nombre de consommations au-delà du quota. */
  over: number
  dots: Dot[]
}

export function itemUsage(item: Pick<PeriodItem, 'allowed_occurrences' | 'consumptions'>): ItemUsage {
  const sorted = sortConsumptions(item.consumptions)
  const allowed = item.allowed_occurrences
  const used = sorted.length
  const dots: Dot[] = sorted.map((c, i) => ({ kind: i < allowed ? 'used' : 'over', date: c.consumed_on }))
  for (let i = used; i < allowed; i++) dots.push({ kind: 'free' })
  return { used, allowed, remaining: Math.max(0, allowed - used), over: Math.max(0, used - allowed), dots }
}

export function consumptionsOn(item: Pick<PeriodItem, 'consumptions'>, date: IsoDate): Consumption[] {
  return sortConsumptions(item.consumptions.filter((c) => c.consumed_on === date))
}

/** Préfixe des consommations affichées avant leur enregistrement (ajout optimiste). */
export const PENDING_CONSUMPTION_PREFIX = 'tmp-'

export function isPendingConsumption(consumption: Pick<Consumption, 'id'>): boolean {
  return consumption.id.startsWith(PENDING_CONSUMPTION_PREFIX)
}

/** Une consommation de ce jour-là peut être retirée (une consommation en cours d'enregistrement ne le peut pas). */
export function canRemoveOn(item: Pick<PeriodItem, 'consumptions'>, date: IsoDate): boolean {
  return item.consumptions.some((c) => c.consumed_on === date && !isPendingConsumption(c))
}

/** Consommation à retirer pour « − » : la dernière notée ce jour-là. */
export function lastConsumptionOn(item: Pick<PeriodItem, 'consumptions'>, date: IsoDate): Consumption | undefined {
  return consumptionsOn(item, date).at(-1)
}

export interface CategoryGroup<T extends PlanItem> {
  name: string
  items: T[]
}

export interface MealGroup<T extends PlanItem> {
  meal: FoodMeal
  label: string
  categories: CategoryGroup<T>[]
}

/** Regroupe par moment (ordre fixe) puis par catégorie (ordre d'apparition), éléments triés par position. */
export function groupItems<T extends PlanItem>(items: readonly T[]): MealGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
  return MEALS.flatMap(({ value, label }) => {
    const categories: CategoryGroup<T>[] = []
    for (const item of sorted.filter((i) => i.meal === value)) {
      const group = categories.find((c) => c.name === item.category)
      if (group) group.items.push(item)
      else categories.push({ name: item.category, items: [item] })
    }
    return categories.length > 0 ? [{ meal: value, label, categories }] : []
  })
}

export interface MealStats {
  /** Consommations notées le jour choisi. */
  onDate: number
  /** Éléments au-delà de leur quota sur la période. */
  overItems: number
}

export function mealStats(items: readonly PeriodItem[], date: IsoDate): MealStats {
  return {
    onDate: items.reduce((n, i) => n + i.consumptions.filter((c) => c.consumed_on === date).length, 0),
    overItems: items.filter((i) => i.consumptions.length > i.allowed_occurrences).length,
  }
}

// ---------------------------------------------------------------------------
// Périodes

export function periodLength(period: Pick<FoodPeriod, 'start_date' | 'end_date'>): number {
  return Math.round((parseIsoDate(period.end_date).getTime() - parseIsoDate(period.start_date).getTime()) / 86_400_000) + 1
}

export function containsDate(period: Pick<FoodPeriod, 'start_date' | 'end_date'>, date: IsoDate): boolean {
  return date >= period.start_date && date <= period.end_date
}

export function clampToPeriod(date: IsoDate, period: Pick<FoodPeriod, 'start_date' | 'end_date'>): IsoDate {
  if (date < period.start_date) return period.start_date
  if (date > period.end_date) return period.end_date
  return date
}

/** Période affichée par défaut : celle en cours, sinon la plus récente. */
export function defaultPeriod<T extends FoodPeriod>(periods: readonly T[], today: IsoDate): T | null {
  return periods.find((p) => containsDate(p, today)) ?? [...periods].sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null
}

export interface PeriodProgress {
  /** Jour courant dans la période (1 = premier jour), borné à la période. */
  day: number
  total: number
  /** Jours restants après aujourd'hui ; négatif si la période est terminée. */
  daysLeft: number
}

export function periodProgress(period: Pick<FoodPeriod, 'start_date' | 'end_date'>, today: IsoDate): PeriodProgress {
  const total = periodLength(period)
  const elapsed = periodLength({ start_date: period.start_date, end_date: today })
  return {
    day: Math.min(total, Math.max(0, elapsed)),
    total,
    daysLeft: periodLength({ start_date: today, end_date: period.end_date }) - 1,
  }
}

export type PeriodNotice =
  | { kind: 'ending'; daysLeft: number; message: string }
  | { kind: 'ended'; message: string }
  | { kind: 'none'; message: string }

/** Rappels de l'ancienne application : fin de période proche, ou aucune période en cours. */
export function periodNotice(periods: readonly FoodPeriod[], today: IsoDate): PeriodNotice | null {
  if (periods.length === 0) return null
  const current = periods.find((p) => containsDate(p, today))
  if (!current) {
    if (periods.some((p) => p.start_date > today)) return null
    return { kind: 'none', message: 'Aucune période en cours : crée la suivante.' }
  }
  const { daysLeft } = periodProgress(current, today)
  if (daysLeft > ENDING_SOON_DAYS) return null
  // Une période suivante existe déjà : rien à préparer.
  if (periods.some((p) => p.start_date > current.end_date)) return null
  if (daysLeft === 0) return { kind: 'ending', daysLeft, message: 'La période se termine aujourd’hui : prépare la suivante.' }
  return { kind: 'ending', daysLeft, message: `La période se termine dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} : pense à préparer la suivante.` }
}

export interface PeriodFormValues {
  start: IsoDate
  end: IsoDate
}

/** Nouvelle période proposée : à la suite de la dernière (si elle n'est pas trop ancienne), même durée. */
export function suggestPeriod(periods: readonly FoodPeriod[], today: IsoDate): PeriodFormValues {
  const latest = [...periods].sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
  const length = latest ? periodLength(latest) : DEFAULT_PERIOD_DAYS
  const start = latest && latest.end_date >= addDays(today, -1) ? addDays(latest.end_date, 1) : today
  return { start, end: addDays(start, length - 1) }
}

export type PeriodFormErrors = Partial<Record<keyof PeriodFormValues, string>>

export function validatePeriodForm(values: PeriodFormValues, periods: readonly FoodPeriod[]): PeriodFormErrors {
  const errors: PeriodFormErrors = {}
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (!valid(values.start)) errors.start = 'Date requise'
  if (!valid(values.end)) errors.end = 'Date requise'
  if (errors.start || errors.end) return errors
  if (values.end < values.start) return { end: 'La fin doit être après le début' }
  if (periodLength({ start_date: values.start, end_date: values.end }) > 366) return { end: 'Une période dure au plus un an' }
  const overlap = periods.find((p) => values.start <= p.end_date && values.end >= p.start_date)
  if (overlap) errors.start = `Chevauche la période du ${formatShortDate(overlap.start_date)} au ${formatShortDate(overlap.end_date)}`
  return errors
}

// ---------------------------------------------------------------------------
// Plan

export interface PlanItemFormValues {
  meal: FoodMeal
  category: string
  name: string
  quantity: string
  unit: string
  allowed: string
}

export type PlanItemFormErrors = Partial<Record<keyof PlanItemFormValues, string>>

export interface PlanItemInput {
  meal: FoodMeal
  category: string
  name: string
  quantity: number | null
  unit: string | null
  allowed_occurrences: number
}

function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  return Number(text)
}

export function emptyPlanItemForm(meal: FoodMeal = 'BREAKFAST', category = ''): PlanItemFormValues {
  return { meal, category, name: '', quantity: '', unit: '', allowed: '1' }
}

export function planItemToForm(item: PlanItem): PlanItemFormValues {
  return {
    meal: item.meal,
    category: item.category,
    name: item.name,
    quantity: item.quantity === null ? '' : String(item.quantity).replace('.', ','),
    unit: item.unit ?? '',
    allowed: String(item.allowed_occurrences),
  }
}

/** `others` : les autres éléments du plan, pour refuser un doublon dans le même moment. */
export function validatePlanItem(values: PlanItemFormValues, others: readonly PlanItem[]): PlanItemFormErrors {
  const errors: PlanItemFormErrors = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Nom requis'
  else if (name.length > 120) errors.name = '120 caractères maximum'
  else if (others.some((o) => o.meal === values.meal && normalizeText(o.name) === normalizeText(name))) {
    errors.name = `Déjà dans le plan (${mealLabel(values.meal).toLowerCase()})`
  }
  const category = values.category.trim()
  if (!category) errors.category = 'Catégorie requise'
  else if (category.length > 60) errors.category = '60 caractères maximum'
  if (values.quantity.trim()) {
    const q = parseDecimal(values.quantity)
    // Colonne numeric(7, 2) : au plus 99 999,99, avec 2 décimales (sinon arrondie, voire refusée par la base).
    if (q === null || q <= 0) errors.quantity = 'Quantité invalide'
    else if (/[.,]\d{3,}$/.test(values.quantity.trim())) errors.quantity = '2 décimales au plus'
    else if (q >= 100_000) errors.quantity = 'Quantité trop grande'
  }
  if (values.unit.trim().length > 20) errors.unit = '20 caractères maximum'
  const allowed = values.allowed.trim()
  if (!/^\d+$/.test(allowed) || Number(allowed) < 1 || Number(allowed) > OCCURRENCES_MAX) errors.allowed = `Entre 1 et ${OCCURRENCES_MAX}`
  return errors
}

export function toPlanItemInput(values: PlanItemFormValues): PlanItemInput {
  const unit = values.unit.trim()
  return {
    meal: values.meal,
    category: values.category.trim(),
    name: values.name.trim(),
    quantity: values.quantity.trim() ? parseDecimal(values.quantity) : null,
    unit: unit || null,
    allowed_occurrences: Number(values.allowed.trim()),
  }
}

/** Catégories déjà utilisées, pour l'autocomplétion. */
export function planCategories(items: readonly Pick<PlanItem, 'category'>[]): string[] {
  return [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Position d'un nouvel élément : après les éléments du même moment et de la même catégorie. */
export function nextPosition(items: readonly PlanItem[], meal: FoodMeal, category: string): number {
  const same = items.filter((i) => i.meal === meal && i.category === category)
  const pool = same.length > 0 ? same : items.filter((i) => i.meal === meal)
  if (pool.length === 0) return Math.max(0, ...items.map((i) => i.position)) + 1
  return Math.max(...pool.map((i) => i.position)) + 1
}
