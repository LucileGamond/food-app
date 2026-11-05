// Formulaire d'une plante : valeurs saisies (texte), validation (mêmes contrôles que la base, avec des messages)
// et conversion en données à enregistrer.

import { isCivilDate, makeDate, parts } from '@watering/civil-date.ts'
import { blockStartMonth } from '@watering/schedule.ts'
import { monthsAreContiguous, validateRules, type RuleIssue } from '@watering/validation.ts'
import type { IntervalUnit, Plant, PlantInput, RuleInput } from './plants'

export type AmountUnit = 'ml' | 'L'

export interface RuleFormValues {
  months: number[]
  first_watering_on: string
  interval_count: string
  interval_unit: IntervalUnit
  amount: string
  amount_unit: AmountUnit
  note: string
}

export interface PlantFormValues {
  name: string
  species: string
  location: string
  planted_on: string
  planted_height_cm: string
  pot_diameter_cm: string
  notes: string
  rules: RuleFormValues[]
}

export type PlantField = Exclude<keyof PlantFormValues, 'rules'>
export type RuleField = 'months' | 'first_watering_on' | 'interval_count' | 'amount' | 'note'

export interface PlantFormErrors {
  fields: Partial<Record<PlantField, string>>
  /** Erreurs de chaque règle, dans l'ordre. */
  rules: Partial<Record<RuleField, string>>[]
}

export interface PlantFormOutput {
  plant: PlantInput
  rules: RuleInput[]
}

const RULE_FIELD: Record<RuleIssue['field'], RuleField> = {
  months: 'months',
  firstWateringOn: 'first_watering_on',
  intervalCount: 'interval_count',
  amountMl: 'amount',
}

/** Champ numérique facultatif saisi en texte (« 12,5 » accepté) ; NaN si ce n'est pas un nombre. */
export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  return trimmed === '' ? null : Number(trimmed)
}

function toMl(amount: string, unit: AmountUnit): number {
  const value = parseOptionalNumber(amount) ?? Number.NaN
  return Math.round(unit === 'L' ? value * 1000 : value)
}

export function toRuleInput(rule: RuleFormValues): RuleInput {
  return {
    months: rule.months.toSorted((a, b) => a - b),
    first_watering_on: rule.first_watering_on,
    interval_count: Number(rule.interval_count),
    interval_unit: rule.interval_unit,
    amount_ml: toMl(rule.amount, rule.amount_unit),
    note: rule.note.trim() || null,
  }
}

function validMeasure(value: string): boolean {
  const n = parseOptionalNumber(value)
  return n === null || (Number.isFinite(n) && n > 0 && n < 10_000)
}

function maxLength(value: string, max: number): string | undefined {
  return value.length > max ? `${max} caractères maximum.` : undefined
}

export function validatePlantForm(values: PlantFormValues): PlantFormErrors {
  const fields: PlantFormErrors['fields'] = {
    name: values.name.trim() === '' ? 'Donne un nom à la plante.' : maxLength(values.name.trim(), 80),
    species: maxLength(values.species, 120),
    location: maxLength(values.location, 80),
    planted_on: values.planted_on === '' || isCivilDate(values.planted_on) ? undefined : 'Date invalide.',
    planted_height_cm: validMeasure(values.planted_height_cm) ? undefined : 'Indique un nombre positif.',
    pot_diameter_cm: validMeasure(values.pot_diameter_cm) ? undefined : 'Indique un nombre positif.',
    notes: maxLength(values.notes, 4000),
  }
  const rules: PlantFormErrors['rules'] = values.rules.map((rule) => ({ note: maxLength(rule.note, 500) }))
  const engineRules = values.rules.map(toRuleInput).map((r) => ({
    months: r.months,
    firstWateringOn: r.first_watering_on,
    intervalCount: r.interval_count,
    intervalUnit: r.interval_unit,
    amountMl: r.amount_ml,
  }))
  for (const issue of validateRules(engineRules)) {
    const field = RULE_FIELD[issue.field]
    rules[issue.index]![field] ??= issue.message
  }
  return { fields, rules }
}

export function hasFormErrors(errors: PlantFormErrors): boolean {
  return Object.values(errors.fields).some(Boolean) || errors.rules.some((r) => Object.values(r).some(Boolean))
}

/** Données à enregistrer (formulaire valide). */
export function toPlantFormOutput(values: PlantFormValues): PlantFormOutput {
  return {
    plant: {
      name: values.name.trim(),
      species: values.species.trim() || null,
      location: values.location.trim() || null,
      planted_on: values.planted_on || null,
      planted_height_cm: parseOptionalNumber(values.planted_height_cm),
      pot_diameter_cm: parseOptionalNumber(values.pot_diameter_cm),
      notes: values.notes.trim() || null,
    },
    rules: values.rules.map(toRuleInput),
  }
}

export function emptyRule(today: string): RuleFormValues {
  return {
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    first_watering_on: today,
    interval_count: '1',
    interval_unit: 'week',
    amount: '250',
    amount_unit: 'ml',
    note: '',
  }
}

/**
 * Valeurs proposées pour une nouvelle règle : toute l'année s'il n'y en a pas encore, sinon les mois restants
 * (s'ils se suivent) avec un 1er arrosage au début de cette période.
 */
export function nextRuleDefaults(existing: Pick<RuleFormValues, 'months'>[], today: string): RuleFormValues {
  const base = emptyRule(today)
  const used = new Set(existing.flatMap((r) => r.months))
  if (used.size === 0) return base

  const free = base.months.filter((m) => !used.has(m))
  if (free.length === 0 || !monthsAreContiguous(free)) return { ...base, months: [] }

  const start = blockStartMonth(free) ?? free[0]!
  const { year, month } = parts(today)
  const first = free.includes(month) ? today : makeDate(start >= month ? year : year + 1, start, 1)
  return { ...base, months: free, first_watering_on: first }
}

const decimal = (n: number) => String(n).replace('.', ',')

/** Valeurs initiales du formulaire (nouvelle plante ou modification). */
export function toFormValues(plant: Plant | null): PlantFormValues {
  if (!plant) {
    return { name: '', species: '', location: '', planted_on: '', planted_height_cm: '', pot_diameter_cm: '', notes: '', rules: [] }
  }
  return {
    name: plant.name,
    species: plant.species ?? '',
    location: plant.location ?? '',
    planted_on: plant.planted_on ?? '',
    planted_height_cm: plant.planted_height_cm === null ? '' : decimal(plant.planted_height_cm),
    pot_diameter_cm: plant.pot_diameter_cm === null ? '' : decimal(plant.pot_diameter_cm),
    notes: plant.notes ?? '',
    rules: plant.rules.map((rule) => {
      const inLitres = rule.amount_ml >= 1000 && rule.amount_ml % 100 === 0
      return {
        months: rule.months,
        first_watering_on: rule.first_watering_on,
        interval_count: String(rule.interval_count),
        interval_unit: rule.interval_unit,
        amount: inLitres ? decimal(rule.amount_ml / 1000) : String(rule.amount_ml),
        amount_unit: inLitres ? 'L' : 'ml',
        note: rule.note ?? '',
      }
    }),
  }
}
