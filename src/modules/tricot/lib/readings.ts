// Lectures d'un patron gardées dans la bibliothèque, une par taille : un nouveau projet dans une taille déjà lue reprend
// la lecture sans rappeler le modèle. Logique pure ; l'enregistrement est dans api.ts.

import { sanitizeHints } from './chart'
import { sanitizeAbbreviations } from './glossary'
import { sanitizeNeedles } from './needles'
import { readTimes } from './passes'
import { readMissingParts, sanitizeSections, type PatternStep, type ReadPattern } from './pattern'
import { sizeIndexOf } from './sizes'
import { sanitizeSizeChart } from './sizing'

export interface StoredReading {
  /** Position de la taille lue parmi celles du patron (null : taille unique). */
  sizeIndex: number | null
  /** « M », « Unique ». */
  sizeLabel: string
  readAt: string
  reading: ReadPattern
}

/** Nom de la taille lue, pour l'affichage. */
export function readingSizeLabel(read: Pick<ReadPattern, 'sizes' | 'sizeIndex'>): string {
  return (read.sizeIndex !== null && read.sizeIndex !== undefined ? read.sizes[read.sizeIndex] : undefined)?.trim().slice(0, 40) || 'Unique'
}

/**
 * Lecture gardée qui vaut pour la taille demandée : même taille parmi celles du patron (« m » = « M »), la première si
 * aucune taille n'est demandée (comme le modèle), n'importe laquelle pour un patron en taille unique.
 */
export function findReading(readings: StoredReading[], size: string): StoredReading | null {
  const wanted = size.trim()
  return (
    readings.find((r) => {
      if (r.reading.sizes.length <= 1) return true
      const index = wanted ? sizeIndexOf(r.reading.sizes, wanted) : 0
      return index !== null && index === r.sizeIndex
    }) ?? null
  )
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function count(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max ? value : null
}

function gaugeFromJson(value: unknown): ReadPattern['gauge'] {
  if (typeof value !== 'object' || value === null) return null
  const g = value as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 100 ? v : null)
  const gauge = { stitches: n(g.stitches), rows: n(g.rows) }
  return gauge.stitches === null && gauge.rows === null ? null : gauge
}

function stepFromJson(value: unknown): PatternStep[] {
  if (typeof value !== 'object' || value === null) return []
  const s = value as Record<string, unknown>
  const title = str(s.title, 200).trim()
  if (!title) return []
  return [
    {
      title,
      instructions: str(s.instructions, 20_000),
      totalRows: count(s.totalRows, 2000),
      stitches: count(s.stitches, 5000),
      sections: sanitizeSections(s.sections),
      times: readTimes(s.times),
    },
  ]
}

/** Lecture gardée en base → lecture utilisable, ou null si elle est abîmée (alors on relit le patron). */
export function readingFromJson(raw: unknown): ReadPattern | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.steps) || !Array.isArray(r.sizes)) return null
  const steps = r.steps.flatMap(stepFromJson)
  if (steps.length === 0) return null
  const sizes = r.sizes.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.slice(0, 40)).slice(0, 30)
  const sizeIndex = typeof r.sizeIndex === 'number' && Number.isInteger(r.sizeIndex) && r.sizeIndex >= 0 && r.sizeIndex < sizes.length ? r.sizeIndex : null
  return {
    title: str(r.title, 200).trim() || 'Patron',
    sizes,
    sizeIndex,
    steps,
    gauge: gaugeFromJson(r.gauge),
    charts: sanitizeHints(r.charts),
    abbreviations: sanitizeAbbreviations(r.abbreviations),
    sizeChart: sanitizeSizeChart(r.sizeChart, sizes.length),
    missingParts: readMissingParts(r.missingParts),
    needles: sanitizeNeedles(r.needles),
  }
}
