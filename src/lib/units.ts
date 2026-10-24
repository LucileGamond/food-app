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
