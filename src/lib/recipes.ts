import { isValidUrl } from './meals'
import { isUnit, splitUnit, unitLabel } from './units'

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
}

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

export type MacroField = 'carbs' | 'protein' | 'fat'

export const MACRO_FIELDS: readonly { field: MacroField; label: string; column: 'carbs_g' | 'protein_g' | 'fat_g' }[] = [
  { field: 'carbs', label: 'Glucides', column: 'carbs_g' },
  { field: 'protein', label: 'Protéines', column: 'protein_g' },
  { field: 'fat', label: 'Lipides', column: 'fat_g' },
]

const isNutritionBasis = (v: unknown): v is NutritionBasis => NUTRITION_BASES.some((b) => b.value === v)

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

export type RecipeFormErrors = Partial<Record<'title' | 'servings' | 'url' | 'ingredients' | 'source' | 'page' | 'nutrition' | DurationField, string>> & {
  ingredientRows?: Record<string, string>
}

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

/** « 45 », « 45 min », « 1 h », « 1h30 », « 1 h 30 min » → minutes ; vide → null ; illisible → NaN. */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase()
  if (text === '') return null
  const match = /^(?:(\d+)\s*h(?:eures?)?)?\s*(?:(\d+)\s*(?:min(?:utes?)?|mn)?)?$/.exec(text)
  if (!match || (match[1] === undefined && match[2] === undefined)) return Number.NaN
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)
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

const PAGE_REFERENCE = /\b(?:voir\s+)?(?:p\.|page)\s*(\d+)/i

/** Renvoi à une autre page du livre (« voir p. 208 ») dans le nom ou la précision : « p. 208 », sinon null. */
export function pageReference(ingredient: Pick<Ingredient, 'name' | 'note'>): string | null {
  const match = PAGE_REFERENCE.exec(`${ingredient.name} ${ingredient.note ?? ''}`)
  return match ? `p. ${match[1]}` : null
}

/** Sous-recette à importer ou à lier : ingrédient qui renvoie à une autre page, pas encore lié. */
export interface PendingLink {
  /** Position de l'ingrédient dans la recette. */
  position: number
  name: string
  page: string
}

export function pendingLinks(ingredients: readonly Ingredient[]): PendingLink[] {
  return ingredients.flatMap((ingredient, position) => {
    const page = ingredient.linkedRecipe ? null : pageReference(ingredient)
    return page ? [{ position, name: ingredient.name, page }] : []
  })
}

/** Source d'une sous-recette : celle de la recette principale, à la page indiquée (« Pâtisserie maison, p. 208 »). */
export function linkedSource(parentSource: string | null | undefined, page: string): { source: string; page: string } {
  return { source: parentSource?.trim() ?? '', page: page.replace(/^p\.\s*/i, '') }
}

const SOURCE_WITH_PAGE = /^(.*?)\b(?:p\.|pp\.|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)$/i

/** « Pâtisserie maison, p. 146 » → livre et page ; null si le texte ne finit pas par une page (comme split_source en base). */
export function splitSource(text: string): { source: string; page: string } | null {
  const match = SOURCE_WITH_PAGE.exec(text.trim())
  if (!match) return null
  return { source: match[1]!.replace(/[\s,;–-]+$/, '').trim(), page: match[2]! }
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

/** Formulaire de nouvelle recette pour importer la sous-recette d'un ingrédient. */
export function linkedImportPath(parentId: string, reference: PendingLink): string {
  const params = new URLSearchParams({ lier: parentId, ingredient: String(reference.position), nom: reference.name, page: reference.page })
  return `/recettes/nouvelle?${params}`
}

/** Paramètres d'un formulaire ouvert par `linkedImportPath`, ou null. */
export function parseLinkedImport(params: URLSearchParams): { parentId: string; reference: PendingLink } | null {
  const parentId = params.get('lier') ?? ''
  const position = params.get('ingredient') ? Number(params.get('ingredient')) : Number.NaN
  const name = params.get('nom')?.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId) || !Number.isInteger(position) || position < 0 || !name) return null
  return { parentId, reference: { position, name, page: params.get('page')?.trim() ?? '' } }
}

/** Titre proposé pour une sous-recette à partir du nom de l'ingrédient (« pâte sucrée » → « Pâte sucrée »). */
export function linkedTitle(name: string): string {
  const clean = name.trim()
  return clean.charAt(0).toLocaleUpperCase('fr-FR') + clean.slice(1)
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
  /** Points signalés par le modèle (`ingredient` : position dans `ingredients`). Absent avec une ancienne version. */
  checks?: { ingredient: number | null; message: string }[]
  /** Livre lu sur la photo (une ancienne version de la fonction y met aussi la page : « Pâtisserie maison, p. 146 »). */
  source?: string | null
  /** Page lue sur la photo (« 146 »). Absente avec une ancienne version de la fonction. */
  page?: string | null
  /** Valeurs nutritionnelles indiquées par la recette. Absentes avec une ancienne version de la fonction. */
  nutrition?: { per: string | null; kcal: number | null; carbs: number | null; protein: number | null; fat: number | null } | null
  prep_minutes?: number | null
  rest_minutes?: number | null
  cook_minutes?: number | null
}

export interface RecipeImport {
  /** La recette (la première de la page pour une photo). */
  recipe: ImportedRecipe
  /** Photo : toutes les recettes de la page, dans l'ordre. Absent avec une ancienne version de la fonction. */
  recipes?: ImportedRecipe[]
  source: 'structured' | 'text' | 'photo'
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

/** Livre et page d'une recette importée (découpés si la fonction les a réunis dans la source). */
function importedSource(imported: ImportedRecipe): { source: string | null; source_page: string | null } {
  const source = imported.source?.trim() || null
  const page = imported.page?.trim() || null
  if (page || !source) return { source, source_page: page }
  const split = splitSource(source)
  return split ? { source: split.source || null, source_page: split.page } : { source, source_page: null }
}

/** Remplace le contenu du formulaire par la recette importée ; le lien devient l'adresse importée. */
export function importedToFormValues(imported: ImportedRecipe, url: string): RecipeFormValues {
  return recipeToFormValues({
    title: imported.title,
    servings: imported.servings !== null && imported.servings <= SERVINGS_MAX ? imported.servings : null,
    notes: imported.steps || null,
    url,
    tags: normalizeTags(imported.tags),
    ...importedSource(imported),
    prep_minutes: imported.prep_minutes ?? null,
    rest_minutes: imported.rest_minutes ?? null,
    cook_minutes: imported.cook_minutes ?? null,
    nutrition_per: isNutritionBasis(imported.nutrition?.per) ? imported.nutrition.per : null,
    kcal: imported.nutrition?.kcal ?? null,
    carbs_g: imported.nutrition?.carbs ?? null,
    protein_g: imported.nutrition?.protein ?? null,
    fat_g: imported.nutrition?.fat ?? null,
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
