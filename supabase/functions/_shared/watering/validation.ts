import { isCivilDate, parts } from './civil-date.ts'
import type { WateringRule } from './schedule.ts'

export interface RuleIssue {
  /** Indice de la règle concernée dans la liste. */
  index: number
  field: 'months' | 'firstWateringOn' | 'intervalCount' | 'amountMl'
  message: string
}

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Un seul bloc de mois consécutifs, décembre → janvier compris. */
export function monthsAreContiguous(months: number[]): boolean {
  const set = new Set(months)
  return months.filter((m) => !set.has((m % 12) + 1)).length <= 1
}

/** Mêmes contrôles que la base (supabase/migrations/*_watering.sql), avec des messages pour le formulaire. */
export function validateRules(rules: Omit<WateringRule, 'id'>[]): RuleIssue[] {
  const issues: RuleIssue[] = []
  const owner = new Map<number, number>()

  rules.forEach((rule, index) => {
    const months = rule.months
    if (months.length === 0) {
      issues.push({ index, field: 'months', message: 'Choisis au moins un mois.' })
    } else if (new Set(months).size !== months.length || months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
      issues.push({ index, field: 'months', message: 'Mois invalides.' })
    } else if (!monthsAreContiguous(months)) {
      issues.push({ index, field: 'months', message: 'Les mois doivent se suivre : crée une autre règle pour une autre période.' })
    } else {
      const taken = months.find((m) => owner.has(m))
      if (taken !== undefined) {
        const name = MONTH_NAMES[taken - 1]
        issues.push({ index, field: 'months', message: `${name.charAt(0).toUpperCase()}${name.slice(1)} est déjà couvert par la règle ${owner.get(taken)! + 1}.` })
      }
      for (const m of months) if (!owner.has(m)) owner.set(m, index)
    }

    if (!isCivilDate(rule.firstWateringOn)) {
      issues.push({ index, field: 'firstWateringOn', message: 'Indique la date du 1er arrosage.' })
    } else if (months.length > 0 && !months.includes(parts(rule.firstWateringOn).month)) {
      issues.push({ index, field: 'firstWateringOn', message: 'Le 1er arrosage doit tomber dans un des mois choisis.' })
    }

    if (!Number.isInteger(rule.intervalCount) || rule.intervalCount < 1 || rule.intervalCount > 365) {
      issues.push({ index, field: 'intervalCount', message: 'Fréquence entre 1 et 365.' })
    }
    if (!Number.isInteger(rule.amountMl) || rule.amountMl < 1 || rule.amountMl > 100_000) {
      issues.push({ index, field: 'amountMl', message: 'Quantité entre 1 ml et 100 L.' })
    }
  })

  return issues
}
