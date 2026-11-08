// Module Tricot : choisir la taille d'un patron selon ses mesures.
//
// À la lecture, le modèle relève le tableau des mesures du patron (mesures du vêtement fini, ou mesures du corps à qui
// chaque taille convient). L'application compare ensuite aux mesures d'une fiche (la sienne ou celle d'un proche,
// pour un cadeau) avec l'aisance voulue, et conseille une taille.

/** Mesures gardées dans une fiche, en cm. */
export type MeasureKey = 'chest' | 'waist' | 'hip' | 'arm' | 'head'

export const MEASURE_KEYS: MeasureKey[] = ['chest', 'waist', 'hip', 'arm', 'head']

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  chest: 'Tour de poitrine',
  waist: 'Tour de taille',
  hip: 'Tour de hanches',
  arm: 'Longueur de bras',
  head: 'Tour de tête',
}

/** Mesures qui sont des tours (l'aisance s'y ajoute) ; la longueur de bras se compare telle quelle. */
const CIRCUMFERENCES: MeasureKey[] = ['chest', 'waist', 'hip', 'head']

/** Ordre de préférence pour choisir la taille : la poitrine d'abord pour un pull, la tête pour un bonnet. */
const PRIORITY: MeasureKey[] = ['chest', 'hip', 'waist', 'head', 'arm']

/** Fiche de mesures : la sienne ou celle d'un proche. */
export interface MeasureProfile {
  id: string
  name: string
  measures: Record<MeasureKey, number | null>
}

/** Une ligne du tableau des mesures du patron : une valeur (cm) par taille, dans l'ordre des tailles. */
export interface SizeChartRow {
  label: string
  measure: MeasureKey | 'other'
  values: (number | null)[]
}

export interface SizeChart {
  /** « finished » : mesures du vêtement fini ; « body » : mesures du corps à qui chaque taille convient. */
  kind: 'finished' | 'body'
  /** Aisance conseillée par le patron (cm), si elle est donnée. */
  easeCm: number | null
  rows: SizeChartRow[]
}

export interface EaseStyle {
  key: 'fitted' | 'classic' | 'loose' | 'oversize'
  label: string
  /** Fourchette affichée. */
  range: string
  cm: number
}

export const EASE_STYLES: EaseStyle[] = [
  { key: 'fitted', label: 'Ajusté', range: '0 à 5 cm', cm: 3 },
  { key: 'classic', label: 'Classique', range: '5 à 10 cm', cm: 8 },
  { key: 'loose', label: 'Ample', range: '10 à 20 cm', cm: 15 },
  { key: 'oversize', label: 'Oversize', range: '20 cm et plus', cm: 25 },
]

/** Aisance de départ : celle du patron s'il en donne une, sinon « classique ». */
export function defaultEase(chart: SizeChart | null | undefined): number {
  return chart?.easeCm ?? EASE_STYLES[1]!.cm
}

/** Style qui correspond à une aisance (pour cocher le bon bouton), ou null pour une aisance à soi. */
export function styleOf(cm: number): EaseStyle['key'] | null {
  return EASE_STYLES.find((s) => s.cm === cm)?.key ?? null
}

export type SizeAdvice =
  | {
      kind: 'size'
      index: number
      measure: MeasureKey
      /** Mesure de la fiche. */
      body: number
      /** Mesure visée (avec l'aisance, pour un tableau de vêtement fini). */
      target: number
      /** Valeur du tableau pour la taille conseillée. */
      value: number
    }
  | { kind: 'no-chart' }
  | { kind: 'no-match' }

const round = (n: number) => Math.round(n * 10) / 10

/**
 * Taille conseillée : la mesure prise est la première (poitrine, hanches, taille, tête, bras) présente à la fois dans
 * le tableau et dans la fiche. Pour un vêtement fini, on vise mesure + aisance (les tours seulement) ; pour un tableau
 * de mesures du corps, la mesure seule. La taille la plus proche gagne ; à égalité, la plus grande.
 */
export function adviseSize(chart: SizeChart | null | undefined, profile: MeasureProfile, easeCm: number): SizeAdvice {
  if (!chart || chart.rows.length === 0) return { kind: 'no-chart' }
  for (const measure of PRIORITY) {
    const body = profile.measures[measure]
    const row = chart.rows.find((r) => r.measure === measure && r.values.some((v) => v !== null))
    if (body === null || !row) continue
    const target = round(chart.kind === 'finished' && CIRCUMFERENCES.includes(measure) ? body + easeCm : body)
    let best: { index: number; value: number } | null = null
    for (const [index, value] of row.values.entries()) {
      if (value === null) continue
      const gap = Math.abs(value - target)
      const bestGap = best ? Math.abs(best.value - target) : Infinity
      if (gap < bestGap || (gap === bestGap && best && value > best.value)) best = { index, value }
    }
    if (best) return { kind: 'size', measure, body, target, index: best.index, value: best.value }
  }
  return { kind: 'no-match' }
}

/** Phrase d'explication : « Tour de poitrine 92 cm + 8 cm d'aisance = 100 cm → M (101 cm, aisance réelle 9 cm). » */
export function describeAdvice(advice: Extract<SizeAdvice, { kind: 'size' }>, sizes: string[], chart: SizeChart): string {
  const cm = (n: number) => `${String(n).replace('.', ',')} cm`
  const label = MEASURE_LABELS[advice.measure]
  const size = sizes[advice.index] ?? `taille ${advice.index + 1}`
  if (chart.kind === 'body') return `${label} ${cm(advice.body)} → ${size} (tableau du patron : ${cm(advice.value)}).`
  if (advice.target === advice.body) return `${label} ${cm(advice.body)} → ${size} (${cm(advice.value)} dans le patron).`
  const ease = round(advice.target - advice.body)
  return `${label} ${cm(advice.body)} + ${cm(ease)} d’aisance = ${cm(advice.target)} → ${size} (${cm(advice.value)} fini, aisance réelle ${cm(round(advice.value - advice.body))}).`
}

const MEASURES = new Set<string>([...MEASURE_KEYS, 'other'])

function cmValue(value: unknown, max = 400): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? round(value) : null
}

/** Tableau des mesures lu (ou gardé) : bien formé et aligné sur les tailles, sinon null. */
export function sanitizeSizeChart(raw: unknown, sizeCount: number): SizeChart | null {
  if (typeof raw !== 'object' || raw === null || sizeCount === 0) return null
  const c = raw as Record<string, unknown>
  if (c.kind !== 'finished' && c.kind !== 'body') return null
  const rows = (Array.isArray(c.rows) ? c.rows : [])
    .flatMap((value): SizeChartRow[] => {
      if (typeof value !== 'object' || value === null) return []
      const r = value as Record<string, unknown>
      const label = typeof r.label === 'string' ? r.label.trim().slice(0, 80) : ''
      const measure = typeof r.measure === 'string' && MEASURES.has(r.measure) ? (r.measure as SizeChartRow['measure']) : 'other'
      const values = Array.from({ length: sizeCount }, (_, i) => cmValue(Array.isArray(r.values) ? r.values[i] : null))
      return label && values.some((v) => v !== null) ? [{ label, measure, values }] : []
    })
    .slice(0, 20)
  if (rows.length === 0) return null
  const ease = typeof c.easeCm === 'number' && Number.isFinite(c.easeCm) && c.easeCm >= -20 && c.easeCm <= 60 ? round(c.easeCm) : null
  return { kind: c.kind, easeCm: ease, rows }
}

/** Mesure saisie (« 92,5 ») : un nombre de cm plausible, null si vide ; undefined si invalide. */
export function parseMeasure(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 10 && n <= 300 ? round(n) : undefined
}

/** Résumé d'une fiche : « poitrine 92 · hanches 98 ». */
export function describeProfile(profile: MeasureProfile): string {
  const parts = MEASURE_KEYS.filter((k) => profile.measures[k] !== null).map((k) => `${MEASURE_LABELS[k].replace(/^(Tour|Longueur) de /, '').toLowerCase()} ${String(profile.measures[k]).replace('.', ',')}`)
  return parts.length ? parts.join(' · ') + ' cm' : 'Aucune mesure notée'
}
