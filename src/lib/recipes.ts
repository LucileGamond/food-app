import { isValidUrl } from './meals'

export interface Ingredient {
  name: string
  quantity: number | null
  unit: string | null
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

export function formatIngredient(ingredient: Ingredient): string {
  const amount = [formatQuantity(ingredient.quantity), ingredient.unit ?? ''].filter(Boolean).join(' ')
  return amount ? `${amount} ${ingredient.name}` : ingredient.name
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
  return rows.filter((r) => r.name.trim() !== '' || r.quantity.trim() !== '' || r.unit.trim() !== '')
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
