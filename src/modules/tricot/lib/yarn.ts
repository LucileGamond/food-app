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
  /** Couleurs du fil (1 à 3, « #rrggbb ») : vues sur la photo de l'étiquette ou choisies à la main. */
  hues: string[]
}

/** Mailles et rangs pour 10 cm. */
export interface Gauge {
  stitches: number | null
  rows: number | null
}

export const MAX_YARNS = 6
export const YARN_TEXT_MAX = 80

export const EMPTY_YARN: Yarn = { brand: null, name: null, color: null, dye_lot: null, composition: null, weight_g: null, length_m: null, skeins: null, needle_mm: null, hues: [] }

/** Couleurs d'une laine : 3 au plus (un chiné, un dégradé). */
export const MAX_HUES = 3

/** Couleurs « #rrggbb » valides, en minuscules, sans doublon, 3 au plus (mêmes règles que la base). */
export function normalizeHues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const hues = value.filter((h): h is string => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h.trim())).map((h) => h.trim().toLowerCase())
  return [...new Set(hues)].slice(0, MAX_HUES)
}

/** Couleurs d'un projet : celles de la première laine qui en a, sinon aucune (le module garde son indigo). */
export function projectHues(yarns: Yarn[]): string[] {
  return yarns.find((y) => y.hues.length > 0)?.hues ?? []
}

type YarnText = 'brand' | 'name' | 'color' | 'dye_lot' | 'composition'
type YarnNumber = 'weight_g' | 'length_m' | 'skeins' | 'needle_mm'

/** Laine en cours de saisie : tout en texte, sauf les couleurs. */
export type YarnDraft = Record<YarnText | YarnNumber, string> & { hues: string[] }

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
    hues: [...yarn.hues],
  }
}

/** « 3,5 » → 3.5 ; '' → null ; NaN si ce n'est pas un nombre décimal écrit simplement (« 0x32 », « 1e1 » : NaN). */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(',', '.')
  if (trimmed === '') return null
  return /^-?\d+(?:\.\d+)?$|^-?\.\d+$/.test(trimmed) ? Number(trimmed) : NaN
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
  yarn.hues = normalizeHues(draft.hues)
  if (yarn.hues.length === 0 && Object.values(yarn).every((v) => v === null || Array.isArray(v))) return { error: 'Remplis au moins un champ.' }
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
    hues: normalizeHues(r.hues),
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

/** Une information de la bande de pelote (étiquette) : le bain est mis en avant. */
export interface YarnFact {
  label: string
  strong?: boolean
}

/** Infos de la bande de pelote, dans l'ordre où on les lit en magasin : coloris, bain, poids et métrage, composition, aiguilles, pelotes. */
export function yarnFacts(yarn: Yarn): YarnFact[] {
  const facts: (YarnFact | null)[] = [
    yarn.color ? { label: `coloris ${yarn.color}` } : null,
    yarn.dye_lot ? { label: `bain ${yarn.dye_lot}`, strong: true } : null,
    yarn.weight_g || yarn.length_m ? { label: [yarn.weight_g && `${yarn.weight_g} g`, yarn.length_m && `${yarn.length_m} m`].filter(Boolean).join(' · ') } : null,
    yarn.composition ? { label: yarn.composition } : null,
    yarn.needle_mm !== null ? { label: `aig. ${decimal(yarn.needle_mm)}` } : null,
    yarn.skeins !== null ? { label: `× ${decimal(yarn.skeins)}` } : null,
  ]
  return facts.filter((f): f is YarnFact => f !== null)
}

/** Même laine (marque, nom, coloris) notée avec des bains différents : les couleurs peuvent légèrement différer. */
export interface DyeLotWarning {
  title: string
  lots: string[]
}

export function dyeLotWarnings(yarns: Yarn[]): DyeLotWarning[] {
  const groups = new Map<string, { title: string; lots: string[] }>()
  for (const y of yarns) {
    if (!y.dye_lot || (!y.brand && !y.name)) continue
    const key = [y.brand, y.name, y.color].map((v) => (v ?? '').trim().toLowerCase()).join('|')
    const group = groups.get(key) ?? { title: [yarnTitle(y), y.color].filter(Boolean).join(' · '), lots: [] }
    if (!group.lots.includes(y.dye_lot)) group.lots.push(y.dye_lot)
    groups.set(key, group)
  }
  return [...groups.values()].filter((g) => g.lots.length > 1)
}

/** Métrage total du projet (pelotes × métrage) ; null s'il manque le métrage ou les pelotes d'une laine (total trop bas). */
export function totalLength(yarns: Yarn[]): number | null {
  if (yarns.length === 0 || yarns.some((y) => y.skeins === null || y.length_m === null)) return null
  return Math.round(yarns.reduce((sum, y) => sum + y.skeins! * y.length_m!, 0))
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
  const hues = [...new Set(yarn.hues.map(hueName).filter((n): n is string => n !== null))]
  // Le bain ne dit rien au modèle ; les teintes, si, en mots (associations de couleurs, motifs).
  return [yarnTitle(yarn), yarnDetails({ ...yarn, skeins: null, dye_lot: null }), hues.length > 0 && `teintes : ${hues.join(', ')}`].filter(Boolean).join(', ')
}

/** Noms des teintes, par tranches de teinte (degrés) : rouge, orange, jaune, vert, bleu, violet, rose, rouge. */
const HUE_NAMES: [number, string][] = [
  [15, 'rouge'],
  [45, 'orange'],
  [70, 'jaune'],
  [165, 'vert'],
  [255, 'bleu'],
  [290, 'violet'],
  [340, 'rose'],
  [360, 'rouge'],
]

/** « #1e3a5f » → « bleu foncé », « #d9d9d9 » → « gris clair » ; null si ce n'est pas une couleur. */
export function hueName(hex: string): string | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return null
  const [r, g, b] = match.slice(1).map((h) => parseInt(h, 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = (max + min) / 2
  const chroma = max - min
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1))
  const shade = light < 0.3 ? ' foncé' : light > 0.75 ? ' clair' : ''
  if (light < 0.12) return 'noir'
  if (light > 0.94) return 'blanc'
  if (saturation < 0.15) return `gris${shade}`
  let hue = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4
  hue = (hue * 60 + 360) % 360
  // Orangés sombres ou peu saturés : marron, beige.
  if (hue >= 15 && hue < 50 && light < 0.45) return 'marron'
  if (hue >= 20 && hue < 60 && saturation < 0.65 && light > 0.6) return 'beige'
  const name = HUE_NAMES.find(([limit]) => hue < limit)![1]
  return `${name}${shade}`
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

/** Patron trouvé sur internet pour une idée (adresse vérifiée dans les résultats de recherche). */
export interface FoundPattern {
  title: string
  url: string
  /** Gratuit, payant, ou inconnu. */
  free: boolean | null
  /** Langue (« fr », « en »), si connue. */
  language: string | null
  /** Métrage demandé (plus petite taille) et jusqu'à combien (plus grande), connus pour les patrons de Ravelry. */
  meters: number | null
  metersMax: number | null
}

/** Idée de modèle proposée par le modèle pour une ou plusieurs laines. */
export interface YarnIdea {
  title: string
  why: string
  /** Pour qui, quelle taille (« adulte », « enfant 4 ans »), ou ''. */
  size: string
  meters: number | null
  needleMm: number | null
  search: string
  /** Vrais patrons trouvés sur internet ; vide tant qu'on n'en a pas cherché. */
  patterns: FoundPattern[]
}

/** Idées pour un ensemble de laines du stock, gardées pour les revoir sans repayer. */
export interface StashIdeas {
  /** Laines du stock concernées, triées. */
  stashIds: string[]
  wish: string
  ideas: YarnIdea[]
  /** Grosseur de la laine (catégorie Ravelry), pour filtrer la recherche. */
  weight: string | null
  updatedAt: string
}

/** Laine trouvée sur Ravelry (aperçu de la recherche). */
export interface RavelryYarnHit {
  id: number
  brand: string | null
  name: string
  weightG: number | null
  lengthM: number | null
  /** Grosseur selon Ravelry (« DK »). */
  category: string | null
}

/** « Garnstudio · 50 g / 105 m · DK » : aperçu d'une laine trouvée sur Ravelry. */
export function ravelryYarnDetails(hit: RavelryYarnHit): string {
  const size = [hit.weightG !== null && `${decimal(hit.weightG)} g`, hit.lengthM !== null && `${hit.lengthM} m`].filter(Boolean).join(' / ')
  return [hit.brand, size, hit.category].filter(Boolean).join(' · ')
}

/** Laines associées au plus pour des idées. */
export const MAX_IDEA_YARNS = 4
/** Longueur maximale de l'envie (« un pull pour bébé »). */
export const MAX_WISH = 120

/** Clé d'un ensemble de laines : identifiants triés, sans doublon. */
export function ideasKey(stashIds: readonly string[]): string[] {
  return [...new Set(stashIds)].sort()
}

/** Une laine telle que décrite au modèle. */
export function ideaYarn(yarn: Yarn): { yarn: string; meters: number | null; needle_mm: number | null } {
  return { yarn: describeYarn(yarn), meters: yarnMeters(yarn), needle_mm: yarn.needle_mm }
}

/** Métrage disponible pour plusieurs laines ; null si l'un manque. */
export function stashMeters(yarns: readonly Yarn[]): number | null {
  let total = 0
  for (const yarn of yarns) {
    const meters = yarnMeters(yarn)
    if (meters === null) return null
    total += meters
  }
  return yarns.length ? total : null
}

/**
 * Assez de laine pour l'idée ? « Assez de laine (reste ≈ 150 m) », ou « Il manque ≈ 200 m (2 pelotes) » (pelotes
 * comptées pour une seule laine au métrage connu). null si le métrage de l'idée ou du stock est inconnu.
 */
export function ideaFit(ideaMeters: number | null, yarns: readonly Yarn[]): { enough: boolean; label: string } | null {
  const available = stashMeters(yarns)
  if (ideaMeters === null || available === null) return null
  if (ideaMeters <= available) {
    const spare = available - ideaMeters
    return { enough: true, label: spare > 0 ? `Assez de laine (reste ≈ ${spare} m)` : 'Assez de laine, tout juste' }
  }
  const missing = ideaMeters - available
  const length = yarns.length === 1 ? yarns[0]!.length_m : null
  const skeins = length ? Math.ceil(missing / length) : null
  return { enough: false, label: `Il manque ≈ ${missing} m${skeins ? ` (${skeins} pelote${skeins > 1 ? 's' : ''})` : ''}` }
}

/** « Gratuit · FR · 300 à 600 m », « Payant · EN », ou ''. */
export function patternNote(pattern: Pick<FoundPattern, 'free' | 'language' | 'meters' | 'metersMax'>): string {
  const meters = pattern.meters === null ? null : pattern.metersMax !== null ? `${pattern.meters} à ${pattern.metersMax} m` : `${pattern.meters} m`
  return [pattern.free === true && 'Gratuit', pattern.free === false && 'Payant', pattern.language?.toUpperCase(), meters].filter(Boolean).join(' · ')
}

/** Idées lues en base (ou renvoyées par le modèle) : champs manquants complétés. */
export function ideasFromJson(raw: unknown): YarnIdea[] {
  if (!Array.isArray(raw)) return []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return raw
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).title === 'string')
    .map((i) => ({
      title: str(i.title),
      why: str(i.why),
      size: str(i.size),
      meters: num(i.meters),
      needleMm: num(i.needleMm),
      search: str(i.search),
      patterns: (Array.isArray(i.patterns) ? i.patterns : [])
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).url === 'string')
        .map((p) => ({
          title: str(p.title) || str(p.url),
          url: str(p.url),
          free: typeof p.free === 'boolean' ? p.free : null,
          language: str(p.language) || null,
          meters: num(p.meters),
          metersMax: num(p.metersMax),
        })),
    }))
}

/** « 350 » → 350 ; '' → null ; undefined si invalide (1 à 20 000 m). */
export function parseMeters(value: string): number | null | undefined {
  const n = parseDecimal(value)
  if (n === null) return null
  return Number.isInteger(n) && n >= 1 && n <= 20_000 ? n : undefined
}
