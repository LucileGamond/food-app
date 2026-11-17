// Module Tricot : l'échantillon (mailles et rangs pour 10 cm) et les échantillons du projet, une seule liste.
//
// Un projet garde l'échantillon du patron (imprimé sur le modèle) à part, puis autant d'échantillons que la tricoteuse
// veut, chacun avec la taille d'aiguille sur laquelle elle l'a tricoté. Un échantillon sans aiguille vaut par défaut.
// Pour un calcul (cm → rangs, mailles estimées), on prend celui de l'aiguille de la sous-étape, sinon celui par défaut,
// sinon celui du patron. Valider une conversion vaut pour toutes les sous-étapes de la même aiguille ; si l'échantillon
// de cette aiguille change, elles sont à revérifier.

import { rowGauge } from './measure'
import type { MeasuredRows } from './pattern'
import { decimal } from '@/lib/text'
import { parseDecimal } from './yarn'

/** Mailles et rangs pour 10 cm. */
export interface Gauge {
  stitches: number | null
  rows: number | null
}

export const MIN_GAUGE = 1
export const MAX_GAUGE = 100

/** « 22 » ou « 22,5 » (pour 10 cm) → nombre ; '' → null ; undefined si invalide. */
export function parseGauge(value: string): number | null | undefined {
  const n = parseDecimal(value)
  if (n === null) return null
  return Number.isFinite(n) && n >= MIN_GAUGE && n <= MAX_GAUGE ? Math.round(n * 10) / 10 : undefined
}

/**
 * Nombre du patron ramené à l'échantillon de la tricoteuse (arrondi) : 64 m. pour 22 m./10 cm, tricotées à 24 m./10 cm
 * → 70 m. pour la même largeur. null si l'un des deux échantillons manque ou s'ils sont identiques.
 */
export function adjustCount(count: number | null, pattern: number | null, mine: number | null): number | null {
  if (count === null || pattern === null || mine === null || pattern === mine) return null
  return Math.max(1, Math.round((count * mine) / pattern))
}

/** Échantillon renseigné (patron et tricoteuse) qui change les mailles ou les rangs. */
export function gaugeDiffers(pattern: Gauge, mine: Gauge): boolean {
  return adjustCount(100, pattern.stitches, mine.stitches) !== null || adjustCount(100, pattern.rows, mine.rows) !== null
}

export function formatGauge(gauge: Gauge): string | null {
  const parts = [gauge.stitches !== null && `${decimal(gauge.stitches)} m.`, gauge.rows !== null && `${decimal(gauge.rows)} rangs`].filter(Boolean)
  return parts.length ? `${parts.join(' × ')} pour 10 cm` : null
}

/** Nombre d'échantillons gardés pour un projet (une aiguille chacun, plus celui par défaut). */
export const MAX_GAUGES = 11

export interface ProjectGauge {
  /** Aiguille (mm) sur laquelle il a été tricoté ; null : vaut pour toutes les aiguilles. */
  needle: number | null
  stitches: number | null
  rows: number | null
  /** Conversions de cette aiguille vérifiées. */
  checked: boolean
}

const gaugeValue = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 100 ? Math.round(v * 10) / 10 : null)

/** Lu en base : entrées bien formées, une par aiguille, la plus petite d'abord (celle par défaut en tête). */
export function sanitizeGauges(raw: unknown): ProjectGauge[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number | null>()
  const gauges = raw.flatMap((value): ProjectGauge[] => {
    if (typeof value !== 'object' || value === null) return []
    const v = value as Record<string, unknown>
    const needle = typeof v.needle === 'number' && v.needle >= 0.5 && v.needle <= 30 ? Math.round(v.needle * 100) / 100 : v.needle === null ? null : undefined
    if (needle === undefined || seen.has(needle)) return []
    seen.add(needle)
    return [{ needle, stitches: gaugeValue(v.stitches), rows: gaugeValue(v.rows), checked: v.checked === true }]
  })
  return sortGauges(gauges).slice(0, MAX_GAUGES)
}

/** Celui par défaut (sans aiguille) en tête, puis les aiguilles de la plus fine à la plus grosse. */
export const sortGauges = (gauges: ProjectGauge[]): ProjectGauge[] =>
  [...gauges].sort((a, b) => (a.needle === null ? -1 : b.needle === null ? 1 : a.needle - b.needle))

export const gaugeOf = (gauges: ProjectGauge[], needle: number | null): ProjectGauge | null => gauges.find((g) => g.needle === needle) ?? null

/** L'échantillon à suivre pour une aiguille : le sien, sinon celui par défaut (sans aiguille). */
export const gaugeFor = (gauges: ProjectGauge[], needle: number | null): ProjectGauge | null => gaugeOf(gauges, needle) ?? gaugeOf(gauges, null)

/** Mailles et rangs à suivre pour une aiguille : son échantillon, sinon celui par défaut, sinon celui du patron. */
export function countsFor(gauges: ProjectGauge[], needle: number | null, pattern: Gauge): Gauge {
  const mine = gaugeFor(gauges, needle)
  return { stitches: mine?.stitches ?? pattern.stitches, rows: mine?.rows ?? pattern.rows }
}

/** Rangs pour 10 cm pour une aiguille, avec d'où ils viennent (pour l'expliquer à l'écran). */
export function rowGaugeFor(needle: number | null, gauges: { gauges: ProjectGauge[]; pattern: Gauge }): MeasuredRows | null {
  const mine = gaugeFor(gauges.gauges, needle)
  if (mine?.rows) return { rowsPer10: mine.rows, source: 'mine' }
  return rowGauge({ mine: { stitches: null, rows: null }, pattern: gauges.pattern })
}

/** Les conversions de cette aiguille ont-elles été vérifiées ? (sinon, celles de l'échantillon par défaut) */
export const isChecked = (gauges: ProjectGauge[], needle: number | null): boolean => (gaugeOf(gauges, needle) ?? gaugeOf(gauges, null))?.checked === true

/** Conversions de l'aiguille vérifiées (l'entrée est créée au besoin). */
export function withChecked(gauges: ProjectGauge[], needle: number | null): ProjectGauge[] {
  const target = gaugeOf(gauges, needle) ? needle : gaugeOf(gauges, null) ? null : needle
  return gaugeOf(gauges, target)
    ? gauges.map((g) => (g.needle === target ? { ...g, checked: true } : g))
    : sortGauges([...gauges, { needle: target, stitches: null, rows: null, checked: true }])
}

/** Échantillon ajouté ou modifié : s'il change de rangs, ses conversions sont à revérifier. */
export function withGauge(gauges: ProjectGauge[], gauge: ProjectGauge): ProjectGauge[] {
  const before = gaugeOf(gauges, gauge.needle)
  const next = { ...gauge, checked: before && before.rows === gauge.rows ? before.checked : false }
  return sortGauges(before ? gauges.map((g) => (g.needle === gauge.needle ? next : g)) : [...gauges, next])
}

/** Échantillon retiré de la liste. */
export const withoutGauge = (gauges: ProjectGauge[], needle: number | null): ProjectGauge[] => gauges.filter((g) => g.needle !== needle)

/** L'échantillon qui vaut pour tout le projet : celui sans aiguille, sinon le premier noté (pour l'IA et les « ≈ »). */
export function defaultGauge(gauges: ProjectGauge[]): Gauge {
  const chosen = gaugeOf(gauges, null) ?? gauges.find((g) => g.stitches !== null || g.rows !== null) ?? null
  return { stitches: chosen?.stitches ?? null, rows: chosen?.rows ?? null }
}
