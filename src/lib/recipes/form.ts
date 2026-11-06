// Formulaire d'une recette : valeurs saisies, validation, conversion pour l'enregistrement.

import { isValidUrl } from '../meals'
import { isUnit } from '../units'
import { DURATION_FIELDS, DURATION_MAX_MINUTES, formatDuration, formatQuantity, MACRO_FIELDS, normalizeTags, parseDuration, parseQuantity, SERVINGS_MAX, type DurationField, type Ingredient, type LinkedRecipe, type Nutrition, type NutritionBasis, type Recipe } from './model'

/**
 * Ligne de la liste d'ingrédients telle que saisie (tout en texte). Une ligne `heading` est le titre d'une
 * sous-partie (« Pour le streusel », dans `name`) : les ingrédients qui la suivent en font partie.
 */
export interface IngredientDraft {
  key: string
  name: string
  quantity: string
  unit: string
  note: string
  heading?: boolean
  linkedRecipe?: LinkedRecipe | null
}

export interface RecipeFormValues {
  title: string
  servings: string
  notes: string
  url: string
  tags: string[]
  /** Livre ou magazine. */
  source: string
  /** Page dans le livre. */
  page: string
  /** Valeurs nutritionnelles saisies (texte), et leur base. */
  nutritionPer: NutritionBasis
  kcal: string
  carbs: string
  protein: string
  fat: string
  /** Durées saisies librement (« 45 min », « 1 h 30 »). */
  prepTime: string
  restTime: string
  cookTime: string
  ingredients: IngredientDraft[]
}

export type RecipeFormErrors = Partial<Record<'title' | 'servings' | 'url' | 'ingredients' | 'source' | 'page' | 'nutrition' | DurationField, string>> & {
  ingredientRows?: Record<string, string>
}

/** Ingrédients réellement saisis (les lignes entièrement vides et les titres de sous-parties sont ignorés). */
export function filledIngredients(rows: readonly IngredientDraft[]): IngredientDraft[] {
  return rows.filter((r) => !r.heading && (r.name.trim() !== '' || r.quantity.trim() !== '' || r.unit.trim() !== '' || r.note.trim() !== ''))
}

export function validateRecipeForm(values: RecipeFormValues): RecipeFormErrors {
  const errors: RecipeFormErrors = {}
  if (values.title.trim() === '') errors.title = 'Le titre est obligatoire'

  const servings = values.servings.trim()
  if (servings !== '' && !(/^\d+$/.test(servings) && Number(servings) > 0 && Number(servings) <= SERVINGS_MAX)) {
    errors.servings = 'Nombre de portions invalide'
  }

  const url = values.url.trim()
  if (url !== '' && !isValidUrl(url)) errors.url = 'Lien invalide (http:// ou https://)'

  if (values.source.trim().length > 200) errors.source = '200 caractères maximum'
  if (values.page.trim().length > 20) errors.page = '20 caractères maximum'
  const kcal = parseQuantity(values.kcal)
  if (kcal !== null && !(Number.isInteger(kcal) && kcal <= 20_000)) errors.nutrition = 'Calories : nombre entier, 20 000 au plus'
  for (const { field, label } of MACRO_FIELDS) {
    const grams = parseQuantity(values[field])
    if (grams !== null && !(grams <= 5000 && /^[^.,]*([.,]\d)?$/.test(values[field].trim()))) {
      errors.nutrition ??= `${label} : en grammes, 1 décimale au plus`
    }
  }
  for (const { field } of DURATION_FIELDS) {
    const minutes = parseDuration(values[field])
    if (minutes !== null && !(minutes <= DURATION_MAX_MINUTES)) errors[field] = 'Durée invalide (ex. 45 min, 1 h 30)'
  }

  const rows = filledIngredients(values.ingredients)
  if (rows.length === 0) errors.ingredients = 'Ajoute au moins un ingrédient'

  const rowErrors: Record<string, string> = {}
  for (const row of values.ingredients) {
    if (row.heading && row.name.trim().length > 80) rowErrors[row.key] = 'Titre trop long (80 caractères maximum)'
  }
  for (const row of rows) {
    if (row.name.trim() === '') rowErrors[row.key] = 'Nom manquant'
    else {
      const quantity = parseQuantity(row.quantity)
      if (quantity !== null && !(quantity > 0)) rowErrors[row.key] = 'Quantité invalide'
      else if (row.unit.trim() !== '' && !isUnit(row.unit.trim())) rowErrors[row.key] = 'Unité inconnue : choisis-en une dans la liste'
      else if (row.note.trim().length > 200) rowErrors[row.key] = 'Précision trop longue (200 caractères maximum)'
    }
  }
  if (Object.keys(rowErrors).length > 0) errors.ingredientRows = rowErrors
  return errors
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0
}

export interface SaveRecipeInput {
  id: string | null
  title: string
  notes: string | null
  url: string | null
  servings: number | null
  tags: string[]
  source?: string | null
  sourcePage?: string | null
  /** null : aucune valeur nutritionnelle. */
  nutrition?: Nutrition | null
  prepMinutes?: number | null
  restMinutes?: number | null
  cookMinutes?: number | null
  ingredients: Ingredient[]
}

export function toSaveRecipeInput(id: string | null, values: RecipeFormValues): SaveRecipeInput {
  const servings = values.servings.trim()
  // Chaque ingrédient prend la sous-partie du dernier titre qui le précède.
  let section: string | null = null
  const ingredients: Ingredient[] = []
  for (const row of values.ingredients) {
    if (row.heading) {
      section = row.name.trim() || null
      continue
    }
    if (filledIngredients([row]).length === 0) continue
    ingredients.push({
      name: row.name.trim(),
      quantity: parseQuantity(row.quantity),
      unit: row.unit.trim() || null,
      note: row.note.trim() || null,
      section,
      ...(row.linkedRecipe ? { linkedRecipe: row.linkedRecipe } : {}),
    })
  }
  return {
    id,
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    url: values.url.trim() || null,
    servings: servings === '' ? null : Number(servings),
    tags: normalizeTags(values.tags),
    source: values.source.trim() || null,
    sourcePage: values.page.trim() || null,
    nutrition: formNutrition(values),
    prepMinutes: parseDuration(values.prepTime),
    restMinutes: parseDuration(values.restTime),
    cookMinutes: parseDuration(values.cookTime),
    ingredients,
  }
}

let draftCounter = 0
export function newIngredientDraft(ingredient?: Ingredient): IngredientDraft {
  draftCounter += 1
  return {
    key: `ing-${draftCounter}`,
    name: ingredient?.name ?? '',
    quantity: ingredient ? formatQuantity(ingredient.quantity) : '',
    unit: ingredient?.unit ?? '',
    note: ingredient?.note ?? '',
    linkedRecipe: ingredient?.linkedRecipe ?? null,
  }
}

/** Titre d'une sous-partie dans la liste d'ingrédients du formulaire. */
export function newHeadingDraft(title = ''): IngredientDraft {
  return { ...newIngredientDraft(), name: title, heading: true }
}

/** Lignes du formulaire : un titre de sous-partie est inséré à chaque changement de sous-partie. */
function ingredientRows(ingredients: readonly Ingredient[]): IngredientDraft[] {
  const rows: IngredientDraft[] = []
  let section: string | null = null
  for (const ingredient of ingredients) {
    const current = ingredient.section?.trim() || null
    // Un titre vide termine la sous-partie précédente : l'ingrédient n'appartient à aucune.
    if (current !== section) rows.push(newHeadingDraft(current ?? ''))
    section = current
    rows.push(newIngredientDraft(ingredient))
  }
  return rows.length > 0 ? rows : [newIngredientDraft()]
}

type RecipeFormSource = Pick<
  Recipe,
  | 'title'
  | 'servings'
  | 'notes'
  | 'url'
  | 'tags'
  | 'source'
  | 'source_page'
  | 'prep_minutes'
  | 'rest_minutes'
  | 'cook_minutes'
  | 'nutrition_per'
  | 'kcal'
  | 'carbs_g'
  | 'protein_g'
  | 'fat_g'
> & {
  ingredients?: Ingredient[]
}

export function recipeToFormValues(recipe: RecipeFormSource): RecipeFormValues {
  return {
    title: recipe.title,
    servings: recipe.servings === null ? '' : String(recipe.servings),
    notes: recipe.notes ?? '',
    url: recipe.url ?? '',
    tags: [...recipe.tags],
    source: recipe.source ?? '',
    page: recipe.source_page ?? '',
    nutritionPer: recipe.nutrition_per ?? 'portion',
    kcal: formatQuantity(recipe.kcal ?? null),
    carbs: formatQuantity(recipe.carbs_g ?? null),
    protein: formatQuantity(recipe.protein_g ?? null),
    fat: formatQuantity(recipe.fat_g ?? null),
    prepTime: formatDuration(recipe.prep_minutes),
    restTime: formatDuration(recipe.rest_minutes),
    cookTime: formatDuration(recipe.cook_minutes),
    ingredients: ingredientRows(recipe.ingredients ?? []),
  }
}

/** Valeurs nutritionnelles du formulaire, ou null si aucune n'est saisie. */
function formNutrition(values: RecipeFormValues): Nutrition | null {
  const read = (raw: string) => {
    const n = parseQuantity(raw)
    return n === null || Number.isNaN(n) ? null : n
  }
  const nutrition = { per: values.nutritionPer, kcal: read(values.kcal), carbs: read(values.carbs), protein: read(values.protein), fat: read(values.fat) }
  return [nutrition.kcal, nutrition.carbs, nutrition.protein, nutrition.fat].some((n) => n !== null) ? nutrition : null
}

/** Le formulaire contient déjà une saisie que l'import écraserait (le titre et le lien seuls ne comptent pas). */
export function formHasContent(values: RecipeFormValues): boolean {
  return values.notes.trim() !== '' || values.tags.length > 0 || filledIngredients(values.ingredients).length > 0
}
