import { isValidUrl } from './meals'
import { isUnit, splitUnit, unitLabel } from './units'

export interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
  /** Précision libre : « émincés », « bombée », « à température ambiante »… */
  note: string | null
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
  ingredients: Ingredient[]
  photos: RecipePhoto[]
}

/** Ligne d'ingrédient telle que saisie dans le formulaire (tout en texte). */
export interface IngredientDraft {
  key: string
  name: string
  quantity: string
  unit: string
  note: string
}

export interface RecipeFormValues {
  title: string
  servings: string
  notes: string
  url: string
  tags: string[]
  ingredients: IngredientDraft[]
}

export type RecipeFormErrors = Partial<Record<'title' | 'servings' | 'url' | 'ingredients', string>> & {
  ingredientRows?: Record<string, string>
}

/** « 1,5 » / « 1.5 » / « 2 » → nombre ; vide → null ; invalide → NaN. */
export function parseQuantity(raw: string): number | null {
  const value = raw.trim().replace(',', '.')
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

/** Ingrédients réellement saisis (les lignes entièrement vides sont ignorées). */
export function filledIngredients(rows: readonly IngredientDraft[]): IngredientDraft[] {
  return rows.filter((r) => r.name.trim() !== '' || r.quantity.trim() !== '' || r.unit.trim() !== '' || r.note.trim() !== '')
}

export function validateRecipeForm(values: RecipeFormValues): RecipeFormErrors {
  const errors: RecipeFormErrors = {}
  if (values.title.trim() === '') errors.title = 'Le titre est obligatoire'

  const servings = values.servings.trim()
  if (servings !== '' && !(/^\d+$/.test(servings) && Number(servings) > 0)) {
    errors.servings = 'Nombre de portions invalide'
  }

  const url = values.url.trim()
  if (url !== '' && !isValidUrl(url)) errors.url = 'Lien invalide (http:// ou https://)'

  const rows = filledIngredients(values.ingredients)
  if (rows.length === 0) errors.ingredients = 'Ajoute au moins un ingrédient'

  const rowErrors: Record<string, string> = {}
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
  ingredients: Ingredient[]
}

export function toSaveRecipeInput(id: string | null, values: RecipeFormValues): SaveRecipeInput {
  const servings = values.servings.trim()
  return {
    id,
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    url: values.url.trim() || null,
    servings: servings === '' ? null : Number(servings),
    tags: normalizeTags(values.tags),
    ingredients: filledIngredients(values.ingredients).map((r) => ({
      name: r.name.trim(),
      quantity: parseQuantity(r.quantity),
      unit: r.unit.trim() || null,
      note: r.note.trim() || null,
    })),
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
  }
}

export function recipeToFormValues(recipe: Pick<Recipe, 'title' | 'servings' | 'notes' | 'url' | 'tags'> & { ingredients?: Ingredient[] }): RecipeFormValues {
  const ingredients = recipe.ingredients?.length ? recipe.ingredients.map((i) => newIngredientDraft(i)) : [newIngredientDraft()]
  return {
    title: recipe.title,
    servings: recipe.servings === null ? '' : String(recipe.servings),
    notes: recipe.notes ?? '',
    url: recipe.url ?? '',
    tags: [...recipe.tags],
    ingredients,
  }
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items]
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item as T)
  return copy
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr-FR').trim()
}

export interface RecipeListItem {
  id: string
  title: string
  tags: string[]
  ingredientNames: string[]
  mainPhotoPath: string | null
}

/** Recherche sans accents ni casse dans le titre et les ingrédients, puis filtre par tag. */
export function filterRecipes<T extends Pick<RecipeListItem, 'title' | 'tags' | 'ingredientNames'>>(
  recipes: readonly T[],
  query: string,
  tag: string | null,
): T[] {
  const q = fold(query)
  const t = tag ? fold(tag) : null
  return recipes.filter((r) => {
    if (t && !r.tags.some((x) => fold(x) === t)) return false
    if (!q) return true
    return fold(r.title).includes(q) || r.ingredientNames.some((n) => fold(n).includes(q))
  })
}

/** Tous les tags distincts, triés. */
export function collectTags(recipes: readonly Pick<RecipeListItem, 'tags'>[]): string[] {
  return normalizeTags(recipes.flatMap((r) => r.tags)).sort((a, b) => a.localeCompare(b, 'fr'))
}

export function photoPath(recipeId: string, fileId: string, extension = 'jpg'): string {
  return `${recipeId}/${fileId}.${extension}`
}

// ---------------------------------------------------------------------------
// Import depuis une URL (Edge Function import-recipe)

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: Ingredient[]
  steps: string
  tags: string[]
}

export interface RecipeImport {
  recipe: ImportedRecipe
  source: 'structured' | 'text'
  image: { data: string; type: string } | null
}

/** Le formulaire contient déjà une saisie que l'import écraserait (le titre et le lien seuls ne comptent pas). */
export function formHasContent(values: RecipeFormValues): boolean {
  return values.notes.trim() !== '' || values.tags.length > 0 || filledIngredients(values.ingredients).length > 0
}

/**
 * Unité ramenée à la liste : variante reconnue (« cuillères à soupe » → c. à s., mots en plus dans la précision),
 * sinon quantité et unité déplacées dans la précision (« 1 shot »).
 */
export function normalizeIngredientUnit(ingredient: Ingredient): Ingredient {
  const note = ingredient.note?.trim() || null
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(', ') || null
  if (!ingredient.unit || isUnit(ingredient.unit)) return { ...ingredient, unit: ingredient.unit || null, note }
  const split = splitUnit(ingredient.unit)
  if (split) return { ...ingredient, unit: split.unit, note: join(split.rest, note) }
  const lost = [formatQuantity(ingredient.quantity), ingredient.unit.trim()].filter(Boolean).join(' ')
  return { ...ingredient, quantity: null, unit: null, note: join(lost, note) }
}

/** Remplace le contenu du formulaire par la recette importée ; le lien devient l'adresse importée. */
export function importedToFormValues(imported: ImportedRecipe, url: string): RecipeFormValues {
  return recipeToFormValues({
    title: imported.title,
    servings: imported.servings,
    notes: imported.steps || null,
    url,
    tags: normalizeTags(imported.tags),
    ingredients: imported.ingredients.map(normalizeIngredientUnit),
  })
}

/** Photo renvoyée par l'import (base64) → fichier, comme une photo choisie à la main. */
export function importedImageToFile(image: { data: string; type: string }, name = 'photo-importee'): File {
  const binary = atob(image.data)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([bytes], `${name}.${extension}`, { type: image.type })
}

/** « https://www.marmiton.org/… » → « marmiton.org » */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
