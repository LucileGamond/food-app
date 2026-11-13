// Tricot : laine du projet, échantillon (mailles et rangs pour 10 cm), stock de laine et idées de modèles.

/** Laine utilisée pour un projet (champs facultatifs ; mêmes bornes que la base : knit_yarns_are_valid). */
export interface Yarn {
  brand: string | null
  name: string | null
  color: string | null
  dye_lot: string | null
  composition: string | null
  weight_g: number | null
  length_m: number | null
  skeins: number | null
  needle_mm: number | null
}

/** Mailles et rangs pour 10 cm. */
export interface Gauge {
  stitches: number | null
  rows: number | null
}

export const MAX_YARNS = 6
export const YARN_TEXT_MAX = 80

export const EMPTY_YARN: Yarn = { brand: null, name: null, color: null, dye_lot: null, composition: null, weight_g: null, length_m: null, skeins: null, needle_mm: null }

type YarnText = 'brand' | 'name' | 'color' | 'dye_lot' | 'composition'
type YarnNumber = 'weight_g' | 'length_m' | 'skeins' | 'needle_mm'

/** Laine en cours de saisie : tout en texte. */
export type YarnDraft = Record<YarnText | YarnNumber, string>

const NUMBERS: Record<YarnNumber, { min: number; max: number; step: number; label: string }> = {
  weight_g: { min: 1, max: 1000, step: 1, label: 'Poids : un nombre entier de grammes (1 à 1000).' },
  length_m: { min: 1, max: 5000, step: 1, label: 'Métrage : un nombre entier de mètres (1 à 5000).' },
  skeins: { min: 0, max: 200, step: 0.5, label: 'Pelotes : un nombre, par demi (0 à 200).' },
  needle_mm: { min: 1, max: 30, step: 0.01, label: 'Aiguilles : entre 1 et 30 mm.' },
}

/** 3.5 → « 3,5 ». */
export const decimal = (n: number) => String(n).replace('.', ',')

export function toYarnDraft(yarn: Yarn): YarnDraft {
  const text = (v: string | null) => v ?? ''
  const num = (v: number | null) => (v === null ? '' : decimal(v))
  return {
    brand: text(yarn.brand),
    name: text(yarn.name),
    color: text(yarn.color),
    dye_lot: text(yarn.dye_lot),
    composition: text(yarn.composition),
    weight_g: num(yarn.weight_g),
    length_m: num(yarn.length_m),
    skeins: num(yarn.skeins),
    needle_mm: num(yarn.needle_mm),
  }
}

/** « 3,5 » → 3.5 ; '' → null ; NaN si ce n'est pas un nombre. */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  return trimmed === '' ? null : Number(trimmed)
}

/** Laine saisie → laine enregistrable, ou le premier problème. */
export function parseYarn(draft: YarnDraft): { yarn: Yarn } | { error: string } {
  const yarn: Yarn = { ...EMPTY_YARN }
  for (const key of ['brand', 'name', 'color', 'dye_lot', 'composition'] as const) {
    const value = draft[key].trim()
    if (value.length > YARN_TEXT_MAX) return { error: `${YARN_TEXT_MAX} caractères au plus par champ.` }
    yarn[key] = value || null
  }
  for (const key of Object.keys(NUMBERS) as YarnNumber[]) {
    const { min, max, step, label } = NUMBERS[key]
    const value = parseDecimal(draft[key])
    if (value === null) continue
    const steps = Math.round(value / step)
    if (!Number.isFinite(value) || value < min || value > max || Math.abs(steps * step - value) > 1e-9) return { error: label }
    yarn[key] = step < 1 ? Math.round(value * 100) / 100 : value
  }
  if (Object.values(yarn).every((v) => v === null)) return { error: 'Remplis au moins un champ.' }
  return { yarn }
}

/** Une laine lue en base (jsonb) : les champs inattendus sont ignorés. */
export function yarnFromJson(value: unknown): Yarn {
  const r = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    brand: text(r.brand),
    name: text(r.name),
    color: text(r.color),
    dye_lot: text(r.dye_lot),
    composition: text(r.composition),
    weight_g: num(r.weight_g),
    length_m: num(r.length_m),
    skeins: num(r.skeins),
    needle_mm: num(r.needle_mm),
  }
}

/** Laines lues en base : seules celles bien formées sont gardées. */
export function yarnsFromJson(raw: unknown): Yarn[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((value) => typeof value === 'object' && value !== null).map(yarnFromJson)
}

/** « Phildar Partner 3.5 », ou « Laine » sans marque ni nom. */
export function yarnTitle(yarn: Yarn): string {
  return [yarn.brand, yarn.name].filter(Boolean).join(' ') || 'Laine'
}

/** « Coloris 0012 Ciel · bain 4471 · 50 g / 125 m · 6 pelotes · aiguilles 3,5 mm ». */
export function yarnDetails(yarn: Yarn): string {
  return [
    yarn.color && `coloris ${yarn.color}`,
    yarn.dye_lot && `bain ${yarn.dye_lot}`,
    yarn.composition,
    (yarn.weight_g || yarn.length_m) && [yarn.weight_g && `${yarn.weight_g} g`, yarn.length_m && `${yarn.length_m} m`].filter(Boolean).join(' / '),
    yarn.skeins !== null && `${decimal(yarn.skeins)} pelote${yarn.skeins > 1 ? 's' : ''}`,
    yarn.needle_mm !== null && `aiguilles ${decimal(yarn.needle_mm)} mm`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Métrage total du projet (pelotes × métrage), si connu pour toutes les laines comptées. */
export function totalLength(yarns: Yarn[]): number | null {
  const counted = yarns.filter((y) => y.skeins !== null && y.length_m !== null)
  return counted.length === 0 ? null : Math.round(counted.reduce((sum, y) => sum + y.skeins! * y.length_m!, 0))
}

// ---------------------------------------------------------------------------
// Échantillon
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Stock de laine et « Quel patron pour ma laine ? »
// ---------------------------------------------------------------------------

/** Laine du stock : `skeins` = pelotes à la maison. */
export interface StashItem {
  id: string
  yarn: Yarn
  notes: string
  createdAt: string
}

/** Métrage disponible (pelotes × métrage), si connu. */
export function yarnMeters(yarn: Yarn): number | null {
  return yarn.skeins !== null && yarn.length_m !== null ? Math.round(yarn.skeins * yarn.length_m) : null
}

/** Écart d'aiguilles toléré entre la laine et le patron. */
export const NEEDLE_TOLERANCE_MM = 0.5

/** Description d'une laine pour le modèle (idées de modèles). */
export function describeYarn(yarn: Yarn): string {
  return [yarnTitle(yarn), yarnDetails({ ...yarn, skeins: null })].filter(Boolean).join(', ')
}

/** Tailles d'aiguilles du filtre « needles » de Ravelry, en mm. */
export const RAVELRY_NEEDLES_MM = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10, 12.75, 15, 19, 25,
]
const METERS_PER_YARD = 0.9144

export interface PatternSearchFilters {
  /** Grosseur de la laine (catégorie Ravelry). */
  weight?: string | null
  /** Métrage disponible : patrons qui en demandent au plus autant. */
  meters?: number | null
  /** Taille d'aiguilles de la laine : tailles Ravelry à 0,5 mm près. */
  needleMm?: number | null
}

/** 4 → « 4.0mm », 3.75 → « 3.75mm » (valeurs du filtre Ravelry). */
function ravelryNeedle(mm: number): string {
  return `${Number.isInteger(mm) ? mm.toFixed(1) : String(mm)}mm`
}

/**
 * Recherche de patrons sur Ravelry : tricot seulement, mots-clés proposés par le modèle et, si connus, grosseur de
 * la laine, métrage disponible (en yards pour Ravelry) et aiguilles proches de celles de la laine.
 */
export function patternSearchUrl(search: string, { weight = null, meters = null, needleMm = null }: PatternSearchFilters = {}): string {
  const needles = needleMm === null ? [] : RAVELRY_NEEDLES_MM.filter((mm) => Math.abs(mm - needleMm) <= NEEDLE_TOLERANCE_MM + 1e-9)
  const filters = [
    'craft=knitting',
    weight && `weight=${encodeURIComponent(weight)}`,
    meters !== null && meters > 0 && `yardage=0%7C${Math.floor(meters / METERS_PER_YARD)}`,
    needles.length > 0 && `needles=${needles.map(ravelryNeedle).join('%7C')}`,
    `query=${encodeURIComponent(search)}`,
  ]
  return `https://www.ravelry.com/patterns/search#${filters.filter(Boolean).join('&')}`
}

/** « ravelry.com », « garnstudio.com » : le site d'un patron trouvé. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Idée de modèle proposée par le modèle pour une laine. */
export interface YarnIdea {
  title: string
  why: string
  meters: number | null
  needleMm: number | null
  search: string
  /** Vrais patrons trouvés sur internet (adresses vérifiées dans les résultats de recherche). */
  patterns: { title: string; url: string }[]
  /** Grosseur de la laine (catégorie Ravelry), pour filtrer la recherche. */
  weight: string | null
}

/** « 350 » → 350 ; '' → null ; undefined si invalide (1 à 20 000 m). */
export function parseMeters(value: string): number | null | undefined {
  const n = parseDecimal(value)
  if (n === null) return null
  return Number.isInteger(n) && n >= 1 && n <= 20_000 ? n : undefined
}
