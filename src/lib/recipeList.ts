import { addDays, formatShortDate, type IsoDate } from './dates'
import { guessAisle, normalizeName } from './shopping'
import { filterRecipes, type NutritionBasis, type RecipeHistory, type RecipeListItem } from './recipes'

// ---------------------------------------------------------------------------
// Tri et filtres de l'écran des recettes

export type RecipeSort = 'title' | 'recent' | 'quick' | 'forgotten' | 'rating' | 'book'

export const RECIPE_SORTS: readonly { value: RecipeSort; label: string }[] = [
  { value: 'title', label: 'Nom (A → Z)' },
  { value: 'recent', label: 'Ajoutées récemment' },
  { value: 'quick', label: 'Plus rapides' },
  { value: 'forgotten', label: 'Pas cuisinées depuis longtemps' },
  { value: 'rating', label: 'Mieux notées' },
  { value: 'book', label: 'Livre et page' },
]

export type QuickFilter = 'quick' | 'vegetarian' | 'forgotten'

/** Recette rapide : 30 min au plus, repos compris. */
export const QUICK_MINUTES = 30
/** Recette oubliée : pas cuisinée depuis un mois (ou jamais). */
export const FORGOTTEN_DAYS = 30

export const QUICK_FILTERS: readonly { value: QuickFilter; label: string }[] = [
  { value: 'quick', label: `${QUICK_MINUTES} min max` },
  { value: 'vegetarian', label: 'Végé' },
  { value: 'forgotten', label: 'Pas cuisinée depuis 1 mois' },
]

export interface RecipeListOptions {
  query: string
  tag: string | null
  book: string | null
  filters: readonly QuickFilter[]
  sort: RecipeSort
}

export const DEFAULT_LIST_OPTIONS: RecipeListOptions = { query: '', tag: null, book: null, filters: [], sort: 'title' }

/** Temps total (préparation, repos, cuisson) ; null si aucun n'est renseigné. */
export function totalMinutes(times: { prep: number | null; rest: number | null; cook: number | null }): number | null {
  const known = [times.prep, times.rest, times.cook].filter((m): m is number => m !== null)
  return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null
}

const VEGETARIAN_TAG = /^(vege|veg(e|gie|an)|vegetarien(ne)?|vegan|vegetal(e)?)s?$/
const MEAT_TAG = /^(viande|poisson|volaille|boeuf|porc|poulet|agneau|veau|fruits de mer)s?$/
/** Ingrédients carnés que le classement par rayon ne range pas en boucherie (conserves, épicerie, charcuterie). */
const MEAT_WORDS = /(^|[^a-z])(thon|anchois|sardine|maquereau|volaille|pancetta|speck|coppa|magret|foie gras|rillettes|boudin|andouille|gelatine|poulpe|seiche|crabe|homard|surimi|jambon|lardon|saucisson)s?([^a-z]|$)/

/** Tag « végé », « végétarien »… : le filtre rapide « Végé » le remplace dans la liste des tags. */
export function isVegetarianTag(tag: string): boolean {
  return VEGETARIAN_TAG.test(normalizeName(tag))
}

/**
 * Végétarienne : un tag le dit (« végé », « végétarien »…), sinon aucun ingrédient de viande ou de poisson n'est
 * reconnu. Un tag « viande » ou « poisson » l'exclut.
 */
export function isVegetarian(recipe: Pick<RecipeListItem, 'tags' | 'ingredientNames'>): boolean {
  const tags = recipe.tags.map(normalizeName)
  if (recipe.tags.some(isVegetarianTag)) return true
  if (tags.some((t) => MEAT_TAG.test(t))) return false
  return recipe.ingredientNames.length > 0 && !recipe.ingredientNames.some((name) => guessAisle(name) === 'BOUCHERIE_POISSON' || MEAT_WORDS.test(normalizeName(name)))
}

/** Pas cuisinée depuis `FORGOTTEN_DAYS` jours (ou jamais), et rien de prévu. */
export function isForgotten(recipe: Pick<RecipeListItem, 'lastCooked' | 'nextPlanned'>, today: IsoDate): boolean {
  if (recipe.nextPlanned) return false
  return recipe.lastCooked === null || recipe.lastCooked < addDays(today, -FORGOTTEN_DAYS)
}

/** Livres des recettes, triés. */
export function collectBooks(recipes: readonly Pick<RecipeListItem, 'source'>[]): string[] {
  return [...new Set(recipes.flatMap((r) => (r.source ? [r.source] : [])))].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Première page d'un numéro (« 146-147 » → 146) ; null s'il n'y en a pas. */
function firstPage(page: string | null): number | null {
  const match = page ? /\d+/.exec(page) : null
  return match ? Number(match[0]) : null
}

const byTitle = (a: RecipeListItem, b: RecipeListItem) => a.title.localeCompare(b.title, 'fr')

/** Valeurs absentes en dernier, quel que soit le sens du tri. */
function nullsLast<T>(a: T | null, b: T | null, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1
  return compare(a, b)
}

const COMPARE: Record<RecipeSort, (a: RecipeListItem, b: RecipeListItem) => number> = {
  title: byTitle,
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt) || byTitle(a, b),
  quick: (a, b) => nullsLast(a.totalMinutes, b.totalMinutes, (x, y) => x - y) || byTitle(a, b),
  // Jamais cuisinées d'abord, puis la plus ancienne.
  forgotten: (a, b) => (a.lastCooked ?? '').localeCompare(b.lastCooked ?? '') || byTitle(a, b),
  rating: (a, b) => nullsLast(a.rating, b.rating, (x, y) => y - x) || byTitle(a, b),
  book: (a, b) =>
    nullsLast(a.source, b.source, (x, y) => x.localeCompare(y, 'fr')) ||
    nullsLast(firstPage(a.sourcePage), firstPage(b.sourcePage), (x, y) => x - y) ||
    byTitle(a, b),
}

/** Recettes affichées : recherche, tag, livre, filtres rapides, puis tri. */
export function applyListOptions(recipes: readonly RecipeListItem[], options: RecipeListOptions, today: IsoDate): RecipeListItem[] {
  const { filters } = options
  return filterRecipes(recipes, options.query, options.tag)
    .filter((r) => !options.book || r.source === options.book)
    .filter((r) => !filters.includes('quick') || (r.totalMinutes !== null && r.totalMinutes <= QUICK_MINUTES))
    .filter((r) => !filters.includes('vegetarian') || r.vegetarian)
    .filter((r) => !filters.includes('forgotten') || isForgotten(r, today))
    .sort(COMPARE[options.sort])
}

const isSort = (v: string | null): v is RecipeSort => RECIPE_SORTS.some((s) => s.value === v)
const isFilter = (v: string): v is QuickFilter => QUICK_FILTERS.some((f) => f.value === v)

/** Options lues dans l'adresse (retour depuis une fiche : la liste est comme on l'a laissée). */
export function readListOptions(params: URLSearchParams): RecipeListOptions {
  const sort = params.get('tri')
  return {
    query: params.get('q') ?? '',
    tag: params.get('tag') || null,
    book: params.get('livre') || null,
    filters: (params.get('filtres') ?? '').split(',').filter(isFilter),
    sort: isSort(sort) ? sort : DEFAULT_LIST_OPTIONS.sort,
  }
}

export function writeListOptions(options: RecipeListOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (options.query) params.set('q', options.query)
  if (options.tag) params.set('tag', options.tag)
  if (options.book) params.set('livre', options.book)
  if (options.filters.length > 0) params.set('filtres', options.filters.join(','))
  if (options.sort !== DEFAULT_LIST_OPTIONS.sort) params.set('tri', options.sort)
  return params
}

// ---------------------------------------------------------------------------
// Historique et avis

/** Moyenne des notes, arrondie au dixième ; null sans note. */
export function averageRating(ratings: readonly (number | null)[]): number | null {
  const known = ratings.filter((r): r is number => r !== null)
  return known.length > 0 ? Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10 : null
}

/** « 4,5 » */
export function formatRating(rating: number): string {
  return rating.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}

/** « 320 kcal / portion », « 180 kcal / 100 g » ; vide sans calories. */
export function formatKcal(kcal: number | null, per: NutritionBasis | null): string {
  return kcal === null ? '' : `${kcal} kcal / ${per ?? 'portion'}`
}

/**
 * « Cuisinée 4 fois, la dernière le 12 octobre », « Jamais cuisinée » ; avec un repas prévu, « · prévue le 5 novembre ».
 * Ici, cuisinée = un repas du planning, jusqu'à aujourd'hui inclus.
 */
export function formatHistory(history: RecipeHistory): string {
  const { timesCooked, lastCooked, nextPlanned } = history
  const past =
    timesCooked === 0 || !lastCooked
      ? 'Jamais cuisinée'
      : timesCooked === 1
        ? `Cuisinée le ${formatShortDate(lastCooked)}`
        : `Cuisinée ${timesCooked} fois, la dernière le ${formatShortDate(lastCooked)}`
  return nextPlanned ? `${past} · prévue le ${formatShortDate(nextPlanned)}` : past
}
