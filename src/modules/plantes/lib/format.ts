// Textes des règles d'arrosage : quantités, fréquences, périodes.

import { blockStartMonth, type IntervalUnit } from '@watering/schedule.ts'
import { MONTH_NAMES } from '@watering/validation.ts'
import { capitalize } from '@/lib/text'
import type { WateringRule } from './plants'

export { MONTH_NAMES }
export const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** 250 → « 250 ml », 1000 → « 1 L », 1500 → « 1,5 L » */
export function formatAmount(ml: number): string {
  return ml >= 1000 ? `${decimal.format(ml / 1000)} L` : `${decimal.format(ml)} ml`
}

/** « tous les jours », « toutes les 2 semaines », « tous les 3 mois » */
export function formatInterval(count: number, unit: IntervalUnit): string {
  switch (unit) {
    case 'day':
      return count === 1 ? 'tous les jours' : `tous les ${count} jours`
    case 'week':
      return count === 1 ? 'toutes les semaines' : `toutes les ${count} semaines`
    case 'month':
      return count === 1 ? 'tous les mois' : `tous les ${count} mois`
  }
}

/** « Toute l’année », « Juin », « Juin → août », « Novembre → février » */
export function formatMonths(months: number[]): string {
  const start = blockStartMonth(months)
  if (start === null) return 'Toute l’année'
  if (months.length === 1) return capitalize(MONTH_NAMES[start - 1]!)
  const end = ((start - 1 + months.length - 1) % 12) + 1
  return `${capitalize(MONTH_NAMES[start - 1]!)} → ${MONTH_NAMES[end - 1]}`
}

/** « 1 L tous les mois » */
export function describeRule(rule: Pick<WateringRule, 'amount_ml' | 'interval_count' | 'interval_unit'>): string {
  return `${formatAmount(rule.amount_ml)} ${formatInterval(rule.interval_count, rule.interval_unit)}`
}

/** 12.5 → « 12,5 cm » */
export function formatCm(value: number): string {
  return `${decimal.format(value)} cm`
}
