// Recettes : modèle (recette, ingrédients, avis, historique), quantités, durées, personnes, valeurs nutritionnelles.

import type { IsoDate } from '../dates'
import { findDurations } from '../timers'
import { unitLabel } from '../units'

export interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
  /** Précision libre : « émincés », « bombée », « à température ambiante »… */
  note: string | null
  /** Sous-partie de la recette (« Pour le streusel »), null si aucune. */
  section?: string | null
  /** Sous-recette à laquelle renvoie l'ingrédient (« pâte sucrée » → recette Pâte sucrée). */
  linkedRecipe?: LinkedRecipe | null
}

export interface LinkedRecipe {
  id: string
  title: string
}

export interface RecipePhoto {
  id: string
  storage_path: string
  position: number
}

export interface Recipe {
  id: string
  is_saved: boolean
  title: string
  notes: string | null
  url: string | null
  servings: number | null
  tags: string[]
  /** Livre ou magazine (« Pâtisserie maison »). */
  source?: string | null
  /** Page dans le livre (« 146 », « 146-147 »). */
  source_page?: string | null
  /** Valeurs nutritionnelles indiquées par la recette, et ce à quoi elles se rapportent. */
  nutrition_per?: NutritionBasis | null
  kcal?: number | null
  carbs_g?: number | null
  protein_g?: number | null
  fat_g?: number | null
  prep_minutes?: number | null
  rest_minutes?: number | null
  cook_minutes?: number | null
  ingredients: Ingredient[]
  photos: RecipePhoto[]
  /** Avis de chacun (absent d'une recette chargée sans eux). */
  reviews?: RecipeReview[]
}

/** Note (1 à 5) et / ou commentaire d'une personne sur une recette. */
export interface RecipeReview {
  profileId: string
  rating: number | null
  comment: string | null
  updatedAt: string
}

export const RATING_MAX = 5
export const REVIEW_COMMENT_MAX = 1000

/** Repas du planning avec cette recette. */
export interface RecipeHistory {
  timesCooked: number
  lastCooked: IsoDate | null
  nextPlanned: IsoDate | null
}

export type DurationField = 'prepTime' | 'restTime' | 'cookTime'

/** Base des valeurs nutritionnelles : une portion, toute la recette, ou 100 g. */
export type NutritionBasis = 'portion' | 'recette' | '100 g'

export const NUTRITION_BASES: readonly { value: NutritionBasis; label: string }[] = [
  { value: 'portion', label: 'par portion' },
  { value: 'recette', label: 'pour toute la recette' },
  { value: '100 g', label: 'pour 100 g' },
]

export interface Nutrition {
  per: NutritionBasis
  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
}

type MacroField = 'carbs' | 'protein' | 'fat'

export const MACRO_FIELDS: readonly { field: MacroField; label: string; column: 'carbs_g' | 'protein_g' | 'fat_g' }[] = [
  { field: 'carbs', label: 'Glucides', column: 'carbs_g' },
  { field: 'protein', label: 'Protéines', column: 'protein_g' },
  { field: 'fat', label: 'Lipides', column: 'fat_g' },
]

export const isNutritionBasis = (v: unknown): v is NutritionBasis => NUTRITION_BASES.some((b) => b.value === v)

export const DURATION_FIELDS: readonly {
  field: DurationField
  label: string
  column: 'prep_minutes' | 'rest_minutes' | 'cook_minutes'
  example: string
}[] = [
  { field: 'prepTime', label: 'Préparation', column: 'prep_minutes', example: '20 min' },
  { field: 'restTime', label: 'Repos', column: 'rest_minutes', example: '2 h' },
  { field: 'cookTime', label: 'Cuisson', column: 'cook_minutes', example: '1 h 15' },
]

/** Une semaine au plus (limite de la base). */
export const DURATION_MAX_MINUTES = 7 * 24 * 60

/** « 1,5 » / « 1.5 » / « 2 » → nombre ; vide → null ; invalide → NaN. */
export function parseQuantity(raw: string): number | null {
  // Espaces de milliers (« 1 500 », espace fine insécable de toLocaleString) ignorées.
  const value = raw.replace(/[\s  ]/g, '').replace(',', '.')
  if (value === '') return null
  if (!/^\d+(\.\d+)?$/.test(value)) return Number.NaN
  return Number(value)
}

export function formatQuantity(quantity: number | null): string {
  if (quantity === null) return ''
  return quantity.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
}

/** « 3 gousses ail (écrasées) », « 200 g farine », « sel » */
export function formatIngredient(ingredient: Ingredient): string {
  const unit = ingredient.unit ? unitLabel(ingredient.unit, ingredient.quantity) : ''
  const amount = [formatQuantity(ingredient.quantity), unit].filter(Boolean).join(' ')
  const text = amount ? `${amount} ${ingredient.name}` : ingredient.name
  return ingredient.note ? `${text} (${ingredient.note})` : text
}

/**
 * « 45 », « 45 min », « 1 h », « 1h30 », « 1 h 30 min » → minutes ; et, comme les minuteurs, « 1,5 h »,
 * « 2 heures et 15 min », « 1 hour » ; vide → null ; illisible → NaN.
 */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase()
  if (text === '') return null
  const match = /^(?:(\d+)\s*h(?:eures?)?)?\s*(?:(\d+)\s*(?:min(?:utes?)?|mn)?)?$/.exec(text)
  if (match && (match[1] !== undefined || match[2] !== undefined)) return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
  // Sinon, la lecture des minuteurs, si le texte n'est qu'une durée.
  const [found, ...others] = findDurations(text)
  if (!found || others.length > 0 || found.start !== 0 || found.end !== text.length) return Number.NaN
  return Math.round(found.seconds / 60)
}

/** 45 → « 45 min », 90 → « 1 h 30 », 120 → « 2 h » */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`
}

export const SERVINGS_MAX = 99

/** Arrondi lisible d'une quantité recalculée : 2 décimales sous 10, 1 sous 100, entier au-delà. */
export function roundQuantity(quantity: number): number {
  if (quantity >= 100) return Math.round(quantity)
  if (quantity >= 10) return Math.round(quantity * 10) / 10
  return Math.round(quantity * 100) / 100
}

/** Quantités adaptées à un autre nombre de personnes (les ingrédients sans quantité restent tels quels). */
export function scaleIngredients(ingredients: readonly Ingredient[], from: number, to: number): Ingredient[] {
  if (from <= 0 || to === from) return ingredients.map((i) => ({ ...i }))
  return ingredients.map((i) => ({ ...i, quantity: i.quantity === null ? null : roundQuantity((i.quantity * to) / from) }))
}

/** Personnes demandées dans l'adresse (`?personnes=`) si le nombre est valide, sinon celles de la recette (null : sans portions). */
export function servingsFromParam(recipeServings: number | null, param: string | null): number | null {
  if (recipeServings === null) return null
  const asked = Number(param)
  return Number.isInteger(asked) && asked >= 1 && asked <= SERVINGS_MAX ? asked : recipeServings
}

/** Ingrédients pour `servings` personnes (quantités adaptées), avec leur position dans la recette. */
export function ingredientsFor(recipe: { servings: number | null; ingredients: readonly Ingredient[] }, servings: number | null): (Ingredient & { position: number })[] {
  const scaled = recipe.servings !== null && servings !== null ? scaleIngredients(recipe.ingredients, recipe.servings, servings) : recipe.ingredients
  return scaled.map((ingredient, position) => ({ ...ingredient, position }))
}

/** Tags nettoyés : espaces retirés, vides ignorés, doublons supprimés sans tenir compte de la casse. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tag of tags) {
    const clean = tag.trim().replace(/\s+/g, ' ')
    const key = clean.toLocaleLowerCase('fr-FR')
    if (clean === '' || seen.has(key)) continue
    seen.add(key)
    result.push(clean)
  }
  return result
}

/** « 450 kcal · glucides 52 g · protéines 18 g · lipides 14 g (par portion) » ; vide sans valeur. */
export function formatNutrition(recipe: Pick<Recipe, 'nutrition_per' | 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g'>): string {
  const parts = [
    recipe.kcal != null ? `${formatQuantity(recipe.kcal)} kcal` : null,
    ...MACRO_FIELDS.map(({ label, column }) => (recipe[column] != null ? `${label.toLowerCase()} ${formatQuantity(recipe[column]!)} g` : null)),
  ].filter(Boolean)
  if (parts.length === 0) return ''
  const basis = NUTRITION_BASES.find((b) => b.value === (recipe.nutrition_per ?? 'portion'))!
  return `${parts.join(' · ')} (${basis.label})`
}

/** « Pâtisserie maison, p. 146 », « p. 146 » ou « Pâtisserie maison » ; vide sans livre ni page. */
export function formatSource(source: string | null | undefined, page: string | null | undefined): string {
  return [source?.trim(), page?.trim() && `p. ${page.trim()}`].filter(Boolean).join(', ')
}

/** Ingrédients regroupés par sous-partie, dans l'ordre (sous-partie null : sans titre). */
export function groupBySection<T extends Pick<Ingredient, 'section'>>(ingredients: readonly T[]): { section: string | null; items: T[] }[] {
  const groups: { section: string | null; items: T[] }[] = []
  for (const ingredient of ingredients) {
    const section = ingredient.section?.trim() || null
    const last = groups.at(-1)
    if (last && last.section === section) last.items.push(ingredient)
    else groups.push({ section, items: [ingredient] })
  }
  return groups
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items]
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item as T)
  return copy
}

export function photoPath(recipeId: string, fileId: string, extension = 'jpg'): string {
  return `${recipeId}/${fileId}.${extension}`
}
