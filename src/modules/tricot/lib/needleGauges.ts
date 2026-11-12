// Module Tricot : échantillon par aiguille, et conversions cm → rangs vérifiées une fois par aiguille.
//
// Chaque sous-étape est convertie avec l'échantillon de son aiguille : celui noté pour cette aiguille, sinon
// l'échantillon général de la tricoteuse, sinon celui du patron. Valider une conversion vaut pour toutes les
// sous-étapes de la même aiguille (dans toutes les étapes) ; changer l'échantillon de l'aiguille la fait revérifier.

import { rowGauge } from './measure'
import type { MeasuredRows } from './pattern'
import type { Gauge } from './yarn'

export interface NeedleGauge {
  /** Aiguille (mm) ; null : projet sans aiguille choisie. */
  needle: number | null
  stitches: number | null
  rows: number | null
  /** Conversions de cette aiguille vérifiées. */
  checked: boolean
}

const gaugeValue = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 100 ? Math.round(v * 10) / 10 : null)

/** Lu en base : entrées bien formées, une par aiguille. */
export function sanitizeNeedleGauges(raw: unknown): NeedleGauge[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number | null>()
  return raw.flatMap((value): NeedleGauge[] => {
    if (typeof value !== 'object' || value === null) return []
    const v = value as Record<string, unknown>
    const needle = typeof v.needle === 'number' && v.needle >= 0.5 && v.needle <= 30 ? v.needle : v.needle === null ? null : undefined
    if (needle === undefined || seen.has(needle)) return []
    seen.add(needle)
    return [{ needle, stitches: gaugeValue(v.stitches), rows: gaugeValue(v.rows), checked: v.checked === true }]
  }).slice(0, 11)
}

export const gaugeOf = (gauges: NeedleGauge[], needle: number | null) => gauges.find((g) => g.needle === needle) ?? null

/** Rangs pour 10 cm pour une aiguille : son échantillon, sinon le général, sinon celui du patron. */
export function rowGaugeFor(needle: number | null, gauges: { needleGauges: NeedleGauge[]; mine: Gauge; pattern: Gauge }): MeasuredRows | null {
  const own = gaugeOf(gauges.needleGauges, needle)
  if (own?.rows) return { rowsPer10: own.rows, source: 'mine' }
  return rowGauge({ mine: gauges.mine, pattern: gauges.pattern })
}

/** Les conversions de cette aiguille ont-elles été vérifiées ? */
export const isChecked = (gauges: NeedleGauge[], needle: number | null) => gaugeOf(gauges, needle)?.checked === true

/** Conversions de l'aiguille vérifiées (l'entrée est créée au besoin). */
export function withChecked(gauges: NeedleGauge[], needle: number | null): NeedleGauge[] {
  return gaugeOf(gauges, needle) ? gauges.map((g) => (g.needle === needle ? { ...g, checked: true } : g)) : [...gauges, { needle, stitches: null, rows: null, checked: true }]
}

/**
 * Échantillons par aiguille modifiés : une aiguille dont les rangs changent est à revérifier ; si l'échantillon
 * général (ou du patron) change, les aiguilles sans échantillon propre aussi.
 */
export function withGauges(previous: NeedleGauge[], next: NeedleGauge[], generalChanged: boolean): NeedleGauge[] {
  return next.map((g) => {
    const before = gaugeOf(previous, g.needle)
    const changed = (before?.rows ?? null) !== g.rows || (generalChanged && g.rows === null)
    return { ...g, checked: changed ? false : (before?.checked ?? g.checked) }
  })
}
