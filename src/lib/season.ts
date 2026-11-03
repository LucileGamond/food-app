// Saisonnalité des recettes : fruits et légumes reconnus dans les ingrédients, comparés au calendrier de l'ADEME.

import { SEASON_CALENDAR, type Produce } from './seasonCalendar'
import { foldText } from './text'

export type { Produce }

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const

/** Mois (1 à 12) d'une date AAAA-MM-JJ. */
export const monthOf = (date: string): number => Number(date.slice(5, 7))

/** Mot ramené au singulier, sans accents : « Tomates » → « tomate », « choux » → « chou », « pois » → « poi ». */
function tokens(text: string): string[] {
  return foldText(text)
    .replace(/[-'’]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
}

/**
 * Noms qui désignent un produit du calendrier (slug), ou rien (null : pomme de terre n'est pas une pomme).
 * Le nom du produit lui-même est toujours reconnu.
 */
const ALIASES: Readonly<Record<string, string | null>> = {
  'pomme de terre': null,
  'patate douce': null,
  'noix de coco': null,
  bette: 'blette',
  butternut: 'courge',
  potimarron: 'courge',
  citrouille: 'potiron',
  salade: 'laitue',
  sucrine: 'laitue',
  batavia: 'laitue',
  romaine: 'laitue',
  mirabelle: 'prune',
  quetsche: 'prune',
}

const PATTERNS: readonly { words: string[]; produce: Produce | null }[] = [
  ...SEASON_CALENDAR.map((p) => ({ words: tokens(p.name), produce: p as Produce | null })),
  ...Object.entries(ALIASES).map(([name, slug]) => ({ words: tokens(name), produce: slug === null ? null : SEASON_CALENDAR.find((p) => p.slug === slug)! })),
  // Les plus longs d'abord : à position égale, « chou de Bruxelles » plutôt que « chou ».
].sort((a, b) => b.words.length - a.words.length)

/** Formes conservées : elles se trouvent toute l'année (tomates pelées, petits pois surgelés, raisins secs). */
const PRESERVED = new Set(
  tokens('conserve boite bocal pelee concasse concassee concentre coulis pulpe surgele surgelee congele seche sec confit sirop jus confiture compote puree deshydrate lyophilise poudre'),
)

const position = (haystack: string[], needle: string[]) =>
  haystack.findIndex((_, i) => needle.every((word, j) => haystack[i + j] === word))

/**
 * Fruit ou légume du calendrier désigné par un ingrédient ; null sinon. Le premier nom reconnu l'emporte, comme en
 * français : « tomates cerises » → tomate, « courge butternut » → courge ; à égalité, le plus long (chou-fleur).
 */
export function findProduce(ingredient: string): Produce | null {
  const words = tokens(ingredient)
  if (words.some((w) => PRESERVED.has(w))) return null
  let best: { at: number; produce: Produce | null } | null = null
  for (const pattern of PATTERNS) {
    const at = position(words, pattern.words)
    if (at !== -1 && (best === null || at < best.at)) best = { at, produce: pattern.produce }
  }
  return best?.produce ?? null
}

export const isInSeason = (produce: Produce, month: number) => produce.months.includes(month)

export interface RecipeSeason {
  /** in : tous ses fruits et légumes sont de saison ; out : au moins un ne l'est pas ; none : aucun n'est suivi. */
  status: 'in' | 'out' | 'none'
  /** Fruits et légumes reconnus, sans doublon. */
  produce: Produce[]
  outOfSeason: Produce[]
}

export function recipeSeason(ingredientNames: readonly string[], month: number): RecipeSeason {
  const produce = [...new Map(ingredientNames.flatMap((name) => findProduce(name) ?? []).map((p) => [p.slug, p])).values()]
  const outOfSeason = produce.filter((p) => !isInSeason(p, month))
  return { status: produce.length === 0 ? 'none' : outOfSeason.length > 0 ? 'out' : 'in', produce, outOfSeason }
}

/** Fruits et légumes de saison ce mois-là, par ordre alphabétique. */
export function produceOfMonth(month: number): Produce[] {
  return SEASON_CALENDAR.filter((p) => isInSeason(p, month)).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** « tomate, courgette » : noms en minuscules, pour une phrase. */
export const produceList = (produce: readonly Produce[]) => produce.map((p) => p.name.toLowerCase()).join(', ')
