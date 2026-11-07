// Tricot : laine du projet, échantillon (mailles et rangs pour 10 cm) et patrons à faire plus tard.

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

const decimal = (n: number) => String(n).replace('.', ',')

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
// Patrons à faire plus tard
// ---------------------------------------------------------------------------

export type QueuePriority = 1 | 2 | 3

export const PRIORITIES: { value: QueuePriority; label: string }[] = [
  { value: 1, label: 'Bientôt' },
  { value: 2, label: 'Un jour' },
  { value: 3, label: 'Peut-être' },
]

export interface QueuedPattern {
  id: string
  title: string
  pdfPath: string | null
  url: string | null
  size: string | null
  yarnIdea: string
  notes: string
  priority: QueuePriority
  createdAt: string
  /** Besoins du patron (taille visée), s'ils sont connus. */
  metersNeeded: number | null
  needleMm: number | null
}

export interface QueueInput {
  title: string
  pdf: File | null
  url: string | null
  size: string | null
  yarnIdea: string
  notes: string
  priority: QueuePriority
  metersNeeded: number | null
  needleMm: number | null
}

export interface QueueDraft {
  title: string
  url: string
  size: string
  yarnIdea: string
  notes: string
  priority: QueuePriority
  metersNeeded: string
  needleMm: string
}

/** Patron saisi → patron enregistrable (PDF à part), ou le premier problème. */
export function parseQueueDraft(draft: QueueDraft, pdf: File | null): { input: QueueInput } | { error: string } {
  const title = draft.title.trim()
  const url = draft.url.trim()
  if (!title) return { error: 'Donne un nom au patron.' }
  if (title.length > 200) return { error: 'Nom : 200 caractères au plus.' }
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { error: 'Le lien doit commencer par http:// ou https://.' }
  if (!pdf && !url) return { error: 'Ajoute le PDF du patron ou un lien.' }
  if (draft.size.trim().length > 40) return { error: 'Taille : 40 caractères au plus.' }
  if (draft.yarnIdea.trim().length > 200) return { error: 'Laine envisagée : 200 caractères au plus.' }
  if (draft.notes.trim().length > 2000) return { error: 'Notes : 2000 caractères au plus.' }
  const metersNeeded = parseMeters(draft.metersNeeded)
  if (metersNeeded === undefined) return { error: 'Métrage : un nombre entier de mètres (1 à 20 000).' }
  const needle = parseDecimal(draft.needleMm)
  if (needle !== null && (!Number.isFinite(needle) || needle < 1 || needle > 30)) return { error: 'Aiguilles : entre 1 et 30 mm.' }
  return {
    input: {
      title,
      pdf,
      url: url || null,
      size: draft.size.trim() || null,
      yarnIdea: draft.yarnIdea.trim(),
      notes: draft.notes.trim(),
      priority: draft.priority,
      metersNeeded,
      needleMm: needle === null ? null : Math.round(needle * 100) / 100,
    },
  }
}

/** Les plus pressés d'abord, puis les plus anciens. */
export function sortQueue(items: QueuedPattern[]): QueuedPattern[] {
  return items.toSorted((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
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

export interface PatternMatch {
  item: QueuedPattern
  /** « 350 m nécessaires, 750 m en stock », « aiguilles 4 mm (laine : 3,5 mm) ». */
  reasons: string[]
}

/**
 * Patrons mis de côté comparés à une laine : ceux qui conviennent (métrage suffisant, aiguilles proches) et ceux qu'on
 * ne peut pas juger (besoins du patron ou de la laine inconnus). Les patrons qui ne conviennent pas sont écartés.
 */
export function matchPatterns(yarn: Yarn, queue: QueuedPattern[]): { fits: PatternMatch[]; unknown: QueuedPattern[] } {
  const available = yarnMeters(yarn)
  const fits: PatternMatch[] = []
  const unknown: QueuedPattern[] = []
  for (const item of sortQueue(queue)) {
    const reasons: string[] = []
    let judged = false
    let fails = false
    if (item.metersNeeded !== null && available !== null) {
      judged = true
      if (item.metersNeeded > available) fails = true
      else reasons.push(`${item.metersNeeded} m nécessaires, ${available} m en stock`)
    }
    if (item.needleMm !== null && yarn.needle_mm !== null) {
      judged = true
      if (Math.abs(item.needleMm - yarn.needle_mm) > NEEDLE_TOLERANCE_MM) fails = true
      else reasons.push(`aiguilles ${decimal(item.needleMm)} mm (laine : ${decimal(yarn.needle_mm)} mm)`)
    }
    if (!judged) unknown.push(item)
    else if (!fails) fits.push({ item, reasons })
  }
  return { fits, unknown }
}

/** Description d'une laine pour le modèle (idées de modèles). */
export function describeYarn(yarn: Yarn): string {
  return [yarnTitle(yarn), yarnDetails({ ...yarn, skeins: null })].filter(Boolean).join(', ')
}

/**
 * Recherche de patrons sur Ravelry : tricot seulement, grosseur de la laine (catégorie Ravelry, si connue) et
 * mots-clés proposés par le modèle.
 */
export function patternSearchUrl(search: string, weight: string | null = null): string {
  const filters = ['craft=knitting', weight && `weight=${encodeURIComponent(weight)}`, `query=${encodeURIComponent(search)}`]
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
