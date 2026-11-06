// Recette lue par le modèle : forme attendue et validation (jamais de confiance dans la réponse).

import { HttpError } from '../_shared/anthropic.ts'
import { asRecord, str } from '../_shared/sanitize.ts'

/** Unités acceptées par l'application (identiques à src/lib/units.ts, vérifié par un test). */
export const UNITS = [
  'g', 'kg', 'ml', 'cl', 'dl', 'l', 'c. à c.', 'c. à s.', 'pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'botte',
  'brin', 'feuille', 'verre', 'tasse', 'bol', 'poignée', 'noix', 'filet', 'morceau',
] as const

/** Unités anglaises recopiées telles quelles : l'application les convertit (identiques à src/lib/units.ts, vérifié par un test). */
export const ENGLISH_UNITS = ['oz', 'lb', 'fl oz', 'cup', 'pint', 'quart', 'gallon', 'stick'] as const

export interface ImportedIngredient {
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  /** Sous-partie de la recette (« Pour le streusel »). */
  section: string | null
}

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: ImportedIngredient[]
  steps: string
  tags: string[]
  /** Points à vérifier signalés par le modèle (ingrédient : position dans `ingredients`, ou null). */
  checks: ImportCheck[]
  /** Livre ou magazine (photo seulement). */
  source: string | null
  /** Numéro de page (photo seulement : « 146 »). */
  page: string | null
  /** Valeurs nutritionnelles indiquées par la recette. */
  nutrition: Nutrition | null
  prep_minutes: number | null
  rest_minutes: number | null
  cook_minutes: number | null
  /** Photo seulement : cadre de la photo du plat sur l'image envoyée, à recadrer par l'application. */
  photo?: PhotoArea | null
}

/** Cadre d'une photo dans une image : numéro de l'image (à partir de 0) et bords en fractions de sa largeur et hauteur. */
export interface PhotoArea {
  image: number
  left: number
  top: number
  right: number
  bottom: number
}

/** Plus petit cadre gardé (fraction de la largeur et de la hauteur) : en dessous, une vignette ou un pictogramme. */
export const MIN_PHOTO_SIDE = 0.15

export const NUTRITION_BASES = ['portion', 'recette', '100 g'] as const

export interface Nutrition {
  per: (typeof NUTRITION_BASES)[number]
  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
}

export interface ImportCheck {
  ingredient: number | null
  message: string
}

/** Recettes lues au plus sur une photo (une page de livre en contient rarement plus). */
export const MAX_PHOTO_RECIPES = 4

/** Valeurs nutritionnelles plausibles (bornées comme en base), ou null si aucune. */
export function sanitizeNutrition(input: unknown): Nutrition | null {
  const data = asRecord(input)
  const amount = (v: unknown, max: number, digits: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10 ** digits) / 10 ** digits : null
  const nutrition: Nutrition = {
    per: (NUTRITION_BASES as readonly unknown[]).includes(data.per) ? (data.per as Nutrition['per']) : 'portion',
    kcal: amount(data.kcal, 20_000, 0),
    carbs: amount(data.carbs, 5000, 1),
    protein: amount(data.protein, 5000, 1),
    fat: amount(data.fat, 5000, 1),
  }
  return [nutrition.kcal, nutrition.carbs, nutrition.protein, nutrition.fat].some((v) => v !== null) ? nutrition : null
}

/** Ne garde que des valeurs sûres et bornées, quel que soit ce que renvoie le modèle. */
export function sanitizeRecipe(input: unknown, fallbackTitle: string | null, notFound = 'Aucune recette trouvée sur cette page.'): ImportedRecipe {
  const data = asRecord(input)
  if (data.is_recipe === false) throw new HttpError(notFound, 422)

  // Position d'origine de chaque ingrédient gardé : les points à vérifier y font référence.
  const kept: number[] = []
  const ingredients = (Array.isArray(data.ingredients) ? data.ingredients : [])
    .slice(0, 60)
    .map((raw, index): ImportedIngredient | null => {
      const item = asRecord(raw)
      const name = str(item.name, 120)
      if (!name) return null
      kept.push(index)
      const q = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity < 100_000 ? item.quantity : null
      return {
        name,
        quantity: q === null ? null : Math.round(q * 1000) / 1000,
        unit: str(item.unit, 30) || null,
        note: str(item.note, 200) || null,
        section: str(item.section, 80) || null,
      }
    })
    .filter((i): i is ImportedIngredient => i !== null)

  if (ingredients.length === 0) throw new HttpError(notFound, 422)

  const servings = typeof data.servings === 'number' && Number.isInteger(data.servings) && data.servings >= 1 && data.servings <= 99 ? data.servings : null
  const steps =
    typeof data.steps === 'string'
      ? data.steps
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000)
      : ''
  const tags = [
    ...new Set(
      (Array.isArray(data.tags) ? data.tags : [])
        .map((t) => str(t, 30).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5)

  // Ingrédients sans sous-partie d'abord, puis chaque sous-partie d'un seul tenant (dans l'ordre d'apparition) :
  // dans le formulaire, un ingrédient appartient au dernier titre de sous-partie qui le précède.
  const sections = [...new Set(ingredients.map((i) => i.section))].sort((a, b) => (a === null ? -1 : b === null ? 1 : 0))
  const order = sections.flatMap((section) => ingredients.flatMap((i, index) => (i.section === section ? [index] : [])))
  const grouped = order.map((index) => ingredients[index]!)

  // Ingrédient désigné par son nom (exact, sinon une seule correspondance partielle), ou -1.
  const byName = (v: unknown) => {
    const key = str(v, 120).toLowerCase()
    if (!key) return -1
    const names = grouped.map((i) => i.name.toLowerCase())
    const exact = names.indexOf(key)
    if (exact >= 0) return exact
    const partial = names.flatMap((name, index) => (name.includes(key) || key.includes(name) ? [index] : []))
    return partial.length === 1 ? partial[0]! : -1
  }
  const checks = (Array.isArray(data.checks) ? data.checks : [])
    .slice(0, 8)
    .flatMap((raw): ImportCheck[] => {
      const item = asRecord(raw)
      const message = str(item.message, 160)
      if (!message) return []
      // Le modèle se trompe parfois de numéro : le nom recopié, s'il désigne un ingrédient, fait foi.
      const named = byName(item.ingredient_name)
      const position = named >= 0 ? named : typeof item.ingredient === 'number' ? order.indexOf(kept.indexOf(item.ingredient)) : -1
      return [{ ingredient: position >= 0 ? position : null, message }]
    })

  const minutes = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 10_080 ? v : null)
  const page = str(data.page, 20).replace(/^p(?:age)?\.?\s*/i, '') || null

  return {
    title: str(data.title, 200) || str(fallbackTitle, 200) || 'Recette importée',
    servings,
    ingredients: grouped,
    steps,
    tags,
    checks,
    source: str(data.source, 200) || null,
    page,
    nutrition: sanitizeNutrition(data.nutrition),
    prep_minutes: minutes(data.prep_minutes),
    rest_minutes: minutes(data.rest_minutes),
    cook_minutes: minutes(data.cook_minutes),
  }
}

const NOT_FOUND_ON_PHOTO = 'Aucune recette lisible sur cette photo. Essaie une photo plus nette, bien droite.'

/** Cadre de photo plausible : image existante, bords dans l'image et dans l'ordre, assez grand ; sinon null. */
export function sanitizePhotoArea(input: unknown, images: number): PhotoArea | null {
  if (typeof input !== 'object' || input === null) return null
  const d = input as Record<string, unknown>
  const fraction = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null)
  const [left, top, right, bottom] = [d.left, d.top, d.right, d.bottom].map(fraction)
  if (!Number.isInteger(d.image) || (d.image as number) < 0 || (d.image as number) >= images) return null
  if (left === null || top === null || right === null || bottom === null) return null
  if (right - left < MIN_PHOTO_SIDE || bottom - top < MIN_PHOTO_SIDE) return null
  const round = (n: number) => Math.round(n * 1000) / 1000
  return { image: d.image as number, left: round(left), top: round(top), right: round(right), bottom: round(bottom) }
}

/** Recettes lues sur une photo : chacune validée ; celles qui ne sont pas des recettes (ou sans ingrédient) sont écartées. */
export function sanitizeRecipes(input: unknown, images = 1): ImportedRecipe[] {
  const data = asRecord(input)
  const recipes = (Array.isArray(data.recettes) ? data.recettes : []).slice(0, MAX_PHOTO_RECIPES).flatMap((raw) => {
    try {
      const photo = sanitizePhotoArea((raw as Record<string, unknown> | null)?.photo, images)
      return [{ ...sanitizeRecipe(raw, null, NOT_FOUND_ON_PHOTO), photo }]
    } catch {
      return []
    }
  })
  if (recipes.length === 0) throw new HttpError(NOT_FOUND_ON_PHOTO, 422)
  return recipes
}
