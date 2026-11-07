// Import en série : lecture d'une image et enregistrement de ses recettes (la file et les états : lib/batchImport).

import type { Api } from '@/api'
import { AppError } from '@/api/errors'
import type { BatchRecipe, BatchResult } from '@/lib/batchImport'
import { compressForReading, cropImage } from '@/lib/image'
import { hasErrors, importedToFormValues, toSaveRecipeInput, validateRecipeForm, type ImportedRecipe, type RecipeFormErrors } from '@/lib/recipes'
import { recipeKey } from '@/lib/sources'
import { uprightPhoto } from './uprightPhoto'

export interface BatchContext {
  api: Pick<Api, 'recipes' | 'photos'>
  /** Livre saisi pour toute la série. */
  book: string
  tags: string[]
  /** Recettes déjà enregistrées ou importées dans cette série (`recipeKey` : titre et livre) → recette ; complété au fil de l'import. */
  known: Map<string, string>
  /** Relecture demandée par la personne (« C'est une recette ») : le modèle ne doit pas répondre « pas de recette ». */
  insist?: boolean
}

const firstError = (errors: RecipeFormErrors) =>
  errors.title ?? errors.ingredients ?? Object.values(errors.ingredientRows ?? {})[0] ?? Object.values(errors).find((e) => typeof e === 'string')

/** Enregistre une recette lue (sans formulaire ni points à vérifier), sauf doublon ou recette incomplète. */
async function saveRecipe(recipe: ImportedRecipe, { api, book, known }: BatchContext): Promise<BatchRecipe> {
  const values = { ...importedToFormValues(recipe, ''), source: book }
  const title = values.title.trim()
  // Même titre dans un autre livre : une autre recette.
  const key = recipeKey(title, book)
  const existing = known.get(key)
  if (existing !== undefined) return { status: 'duplicate', title, recipeId: existing || undefined, message: 'Déjà enregistrée' }

  const errors = validateRecipeForm(values)
  if (hasErrors(errors)) return { status: 'incomplete', title, message: firstError(errors) ?? 'Recette incomplète' }

  // Réservé avant l'enregistrement : une autre recette du même titre, lue en parallèle, sera un doublon.
  known.set(key, '')
  try {
    const recipeId = await api.recipes.saveRecipe(toSaveRecipeInput(null, values))
    known.set(key, recipeId)
    return { status: 'saved', title, recipeId }
  } catch (error) {
    known.delete(key)
    return { status: 'error', title, message: error instanceof Error ? error.message : 'L’enregistrement a échoué.' }
  }
}

/** Lit une image et enregistre chacune de ses recettes (une page peut en contenir plusieurs). */
export async function importOne(file: File, context: BatchContext): Promise<BatchResult> {
  let image: Blob
  try {
    image = await compressForReading(file)
  } catch {
    return { status: 'error', message: 'Image illisible (essaie en JPEG ou PNG).', recipes: [] }
  }
  // Photo du plat recadrée dans l'image d'origine (plus grande que l'image lue).
  return importPages([image], context, [file])
}

/**
 * Lit des pages déjà prêtes pour la lecture (une recette sur 1 à 4 photos, ou une page) et enregistre chacune de leurs
 * recettes. `originals` : images où recadrer la photo du plat (par défaut, les pages lues).
 */
export async function importPages(pages: Blob[], context: BatchContext, originals: Blob[] = pages): Promise<BatchResult> {
  let read
  try {
    read = context.insist
      ? await context.api.recipes.importFromPhotos(pages, context.tags, { insist: true })
      : await context.api.recipes.importFromPhotos(pages, context.tags)
  } catch (error) {
    // 422 : la page n'est pas une recette (couverture, sommaire…), ou toujours illisible après « C'est une recette ».
    if (error instanceof AppError && error.code === 'import-422') {
      return { status: 'skipped', message: context.insist ? 'Toujours aucune recette lisible : reprends la photo' : 'Pas une recette', recipes: [] }
    }
    return { status: 'error', message: error instanceof Error ? error.message : 'La lecture a échoué.', recipes: [] }
  }

  // Une ancienne version de la fonction ne renvoie que `recipe`.
  const found = read.recipes?.length ? read.recipes : [read.recipe]
  const recipes: BatchRecipe[] = []
  for (const recipe of found) {
    const saved = await saveRecipe(recipe, context)
    const source = recipe.photo ? (originals[recipe.photo.image] ?? originals[0]!) : null
    recipes.push(saved.status === 'saved' && source ? { ...saved, photo: await addDishPhoto(source, recipe, saved.recipeId!, context) } : saved)
  }
  return { status: 'done', recipes }
}

/** Photo du plat imprimée sur la page : recadrée et ajoutée à la recette enregistrée. Un échec ne bloque rien. */
async function addDishPhoto(file: Blob, recipe: ImportedRecipe, recipeId: string, { api }: BatchContext): Promise<boolean> {
  try {
    await api.photos.uploadPhoto(recipeId, await uprightPhoto(api, await cropImage(file, recipe.photo!)))
    return true
  } catch {
    return false
  }
}
