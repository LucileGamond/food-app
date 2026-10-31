// Unités de mesure des ingrédients : une liste fermée, et la reconnaissance des variantes courantes
// (« cuillère à soupe », « cs », « tbsp »… → « c. à s. »).
//
// ⚠ La migration supabase/migrations/20261027000000_ingredient_units.sql contient la même liste et la
// même table de correspondance (UNIT_ALIASES, au format JSON) : un test vérifie qu'elles restent identiques.

export const UNIT_GROUPS = [
  { label: 'Masse', units: ['g', 'kg'] },
  { label: 'Volume', units: ['ml', 'cl', 'dl', 'l'] },
  { label: 'Cuillères', units: ['c. à c.', 'c. à s.'] },
  {
    label: 'Cuisine',
    units: ['pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'botte', 'brin', 'feuille', 'verre', 'tasse', 'bol', 'poignée', 'noix', 'filet', 'morceau'],
  },
] as const

export type Unit = (typeof UNIT_GROUPS)[number]['units'][number]

export const UNITS: readonly Unit[] = UNIT_GROUPS.flatMap((g) => g.units)

export function isUnit(value: string | null | undefined): value is Unit {
  return value !== null && value !== undefined && (UNITS as readonly string[]).includes(value)
}

/**
 * Variante normalisée (voir `unitKey`) → unité de la liste.
 * Une valeur vide signifie « sans unité » (ex. « pièce » : 3 œufs).
 */
export const UNIT_ALIASES: Readonly<Record<string, Unit | ''>> = {
  g: 'g', gr: 'g', gramme: 'g', grammes: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', kilogrammes: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml',
  cl: 'cl', centilitre: 'cl', centilitres: 'cl',
  dl: 'dl', decilitre: 'dl', decilitres: 'dl',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  cac: 'c. à c.', cc: 'c. à c.', cuillereacafe: 'c. à c.', cuilleresacafe: 'c. à c.', cuilacafe: 'c. à c.', cuillacafe: 'c. à c.',
  petitecuillere: 'c. à c.', tsp: 'c. à c.', teaspoon: 'c. à c.', teaspoons: 'c. à c.',
  cas: 'c. à s.', cs: 'c. à s.', cuillereasoupe: 'c. à s.', cuilleresasoupe: 'c. à s.', cuilasoupe: 'c. à s.', cuillasoupe: 'c. à s.',
  grandecuillere: 'c. à s.', tbsp: 'c. à s.', tablespoon: 'c. à s.', tablespoons: 'c. à s.',
  pincee: 'pincée', pincees: 'pincée', pinch: 'pincée',
  gousse: 'gousse', gousses: 'gousse', clove: 'gousse', cloves: 'gousse',
  tranche: 'tranche', tranches: 'tranche', slice: 'tranche', slices: 'tranche',
  sachet: 'sachet', sachets: 'sachet',
  boite: 'boîte', boites: 'boîte', can: 'boîte', cans: 'boîte',
  botte: 'botte', bottes: 'botte', bunch: 'botte',
  brin: 'brin', brins: 'brin', sprig: 'brin', sprigs: 'brin',
  feuille: 'feuille', feuilles: 'feuille', leaf: 'feuille', leaves: 'feuille',
  verre: 'verre', verres: 'verre', glass: 'verre',
  tasse: 'tasse', tasses: 'tasse', cup: 'tasse', cups: 'tasse',
  bol: 'bol', bols: 'bol', bowl: 'bol',
  poignee: 'poignée', poignees: 'poignée', handful: 'poignée',
  noix: 'noix',
  filet: 'filet', filets: 'filet', trait: 'filet',
  morceau: 'morceau', morceaux: 'morceau',
  piece: '', pieces: '', pc: '', pcs: '', unite: '', unites: '',
}

/** « Cuillère(s) à Soupe. » → « cuillereasoupe » */
export function unitKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\(s\)/g, '')
    .replace(/[.\s'’]/g, '')
}

export interface SplitUnit {
  /** Unité reconnue (null : sans unité). */
  unit: Unit | null
  /** Mots en plus (« bombée », « petit »), à mettre dans la précision. */
  rest: string | null
}

/**
 * Reconnaît l'unité d'un texte libre, éventuellement entourée d'autres mots :
 * « c. à s. bombée(s) » → c. à s. + « bombée(s) » ; « petit morceau » → morceau + « petit ».
 * Renvoie null si aucune unité n'est reconnue.
 */
export function splitUnit(raw: string | null | undefined): SplitUnit | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { unit: null, rest: null }
  const words = text.split(' ')
  const known = (part: string[]) => UNIT_ALIASES[unitKey(part.join(' '))]
  // Début du texte, du plus long au plus court
  for (let i = words.length; i >= 1; i--) {
    const unit = known(words.slice(0, i))
    if (unit !== undefined) return { unit: unit || null, rest: words.slice(i).join(' ') || null }
  }
  // Fin du texte
  for (let i = 1; i < words.length; i++) {
    const unit = known(words.slice(i))
    if (unit !== undefined) return { unit: unit || null, rest: words.slice(0, i).join(' ') }
  }
  return null
}

const INVARIABLE = new Set<string>(['g', 'kg', 'ml', 'cl', 'dl', 'l', 'c. à c.', 'c. à s.', 'noix'])

/** Unité accordée à la quantité : « 3 gousses », « 2 morceaux », « 2 c. à s. ». */
export function unitLabel(unit: string, quantity: number | null): string {
  if (quantity === null || quantity < 2 || INVARIABLE.has(unit) || !isUnit(unit)) return unit
  return unit === 'morceau' ? 'morceaux' : `${unit}s`
}

/**
 * Unités anglaises que la fonction d'import recopie telles quelles : l'application les convertit (`toMetric`).
 * ⚠ Même liste dans supabase/functions/import-recipe/model.ts (vérifié par un test).
 */
export const ENGLISH_UNITS = ['oz', 'lb', 'fl oz', 'cup', 'pint', 'quart', 'gallon', 'stick'] as const

/** Variante normalisée (voir `unitKey`) → unité métrique et facteur. Une tasse américaine : 240 ml ; un « stick » de beurre : 113 g. */
const ENGLISH: Readonly<Record<string, { unit: 'g' | 'ml'; factor: number }>> = {
  oz: { unit: 'g', factor: 28.35 }, ounce: { unit: 'g', factor: 28.35 }, ounces: { unit: 'g', factor: 28.35 },
  lb: { unit: 'g', factor: 453.6 }, lbs: { unit: 'g', factor: 453.6 }, pound: { unit: 'g', factor: 453.6 }, pounds: { unit: 'g', factor: 453.6 },
  stick: { unit: 'g', factor: 113 }, sticks: { unit: 'g', factor: 113 },
  floz: { unit: 'ml', factor: 29.57 }, fluidounce: { unit: 'ml', factor: 29.57 }, fluidounces: { unit: 'ml', factor: 29.57 },
  cup: { unit: 'ml', factor: 240 }, cups: { unit: 'ml', factor: 240 },
  pint: { unit: 'ml', factor: 473 }, pints: { unit: 'ml', factor: 473 }, pt: { unit: 'ml', factor: 473 },
  quart: { unit: 'ml', factor: 946 }, quarts: { unit: 'ml', factor: 946 }, qt: { unit: 'ml', factor: 946 },
  gallon: { unit: 'ml', factor: 3785 }, gallons: { unit: 'ml', factor: 3785 }, gal: { unit: 'ml', factor: 3785 },
}

/** Valeur arrondie comme en cuisine : 7 g, 28 g, 115 g (au 5 près à partir de 50). */
function roundMetric(value: number): number {
  if (value < 1) return Math.round(value * 10) / 10
  if (value < 50) return Math.round(value)
  return Math.round(value / 5) * 5
}

export interface MetricAmount {
  quantity: number | null
  unit: Unit
  /** Mots en plus (« packed », « softened »), à mettre dans la précision. */
  rest: string | null
}

/**
 * Quantité en unité anglaise convertie en métrique : 4 oz → 115 g, 2 lb → 905 g, 3 lb → 1,35 kg, ½ cup → 120 ml,
 * 1 quart → 945 ml. Reconnaît l'unité en début de texte (« cups packed »). Renvoie null si l'unité n'est pas anglaise.
 */
export function toMetric(quantity: number | null, raw: string | null | undefined): MetricAmount | null {
  const words = (raw ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  for (let i = Math.min(words.length, 2); i >= 1; i--) {
    const english = ENGLISH[unitKey(words.slice(0, i).join(' '))]
    if (!english) continue
    const rest = words.slice(i).join(' ') || null
    if (quantity === null) return { quantity: null, unit: english.unit, rest }
    const value = quantity * english.factor
    if (value >= 1000) return { quantity: Math.round(value / 50) / 20, unit: english.unit === 'g' ? 'kg' : 'l', rest }
    return { quantity: roundMetric(value), unit: english.unit, rest }
  }
  return null
}

/** Fahrenheit → Celsius, au 5 près (350 °F → 175 °C). */
function celsius(fahrenheit: number): number {
  return Math.round((((fahrenheit - 32) * 5) / 9) / 5) * 5
}

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const FAHRENHEIT = new RegExp(String.raw`(\d{2,3})\s*(?:°\s*F|º\s*F|degrees?\s*F(?:ahrenheit)?|degrés?\s*F(?:ahrenheit)?)(?![\p{L}])(\s*\(\s*\d{2,3}\s*°?\s*C\s*\))?`, 'giu')
const INCHES = new RegExp(String.raw`(${NUMBER})(?:\s*[x×]\s*(${NUMBER}))?(?:\s*-\s*|\s*)(?:inch(?:es)?|pouces?)(?![\p{L}])`, 'giu')

const toNumber = (value: string) => Number(value.replace(',', '.'))
const cm = (inches: string) => Math.round(toNumber(inches) * 2.54)

/** Températures et dimensions anglaises d'un texte (étapes, précisions) : « 350°F » → « 175 °C », « 9x13-inch » → « 23 x 33 cm ». */
export function metricText(text: string): string {
  return text
    .replace(FAHRENHEIT, (_, f: string, given?: string) => (given ? given.trim().replace(/^\(\s*|\s*\)$/g, '').replace(/\s*°?\s*C$/i, ' °C') : `${celsius(Number(f))} °C`))
    .replace(INCHES, (_, a: string, b?: string) => (b ? `${cm(a)} x ${cm(b)} cm` : `${cm(a)} cm`))
}
