import type { Api } from '@/api'
import { AppError } from '@/api/errors'
import { compressForReading } from './image'
import { hasErrors, importedToFormValues, toSaveRecipeInput, validateRecipeForm, type RecipeFormErrors } from './recipes'
import { normalizeName } from './shopping'

/** Images lues en même temps : plus rapide, sans trop solliciter le service d'analyse. */
export const BATCH_CONCURRENCY = 2

export type BatchStatus = 'pending' | 'reading' | 'saved' | 'duplicate' | 'skipped' | 'incomplete' | 'error'

export interface BatchItem {
  key: string
  file: File
  status: BatchStatus
  /** Titre lu (enregistrée, doublon, à compléter). */
  title?: string
  /** Recette créée, ou recette existante pour un doublon. */
  recipeId?: string
  message?: string
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i

/** Chemin affiché et trié : dans un dossier, le chemin relatif ; sinon le nom. */
export function fileLabel(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}

/** Images seulement (un dossier contient aussi d'autres fichiers), triées par nom en ordre naturel (page2 avant page10). */
export function imageFiles(files: Iterable<File>): File[] {
  return [...files]
    .filter((f) => f.type.startsWith('image/') || IMAGE_EXTENSION.test(f.name))
    .sort((a, b) => fileLabel(a).localeCompare(fileLabel(b), 'fr', { numeric: true, sensitivity: 'base' }))
}

/**
 * Traite les éléments `concurrency` à la fois, dans l'ordre. En pause, plus aucun n'est lancé ; ceux en cours se
 * terminent, puis la promesse se résout. Une erreur du traitement d'un élément n'arrête pas les autres.
 */
export async function runQueue<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  { concurrency, isPaused }: { concurrency: number; isPaused: () => boolean },
): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length && !isPaused()) {
      const item = items[next++]!
      await worker(item).catch(() => undefined)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane))
}

export interface BatchContext {
  api: Pick<Api, 'recipes'>
  /** Livre saisi pour toute la série. */
  book: string
  tags: string[]
  /** Titres déjà enregistrés ou importés dans cette série (normalisés) → recette ; complété au fil de l'import. */
  known: Map<string, string>
}

const firstError = (errors: RecipeFormErrors) =>
  errors.title ?? errors.ingredients ?? Object.values(errors.ingredientRows ?? {})[0] ?? Object.values(errors).find((e) => typeof e === 'string')

/** Lit une image et enregistre la recette (sans formulaire ni points à vérifier) ; renvoie le résultat à afficher. */
export async function importOne(file: File, { api, book, tags, known }: BatchContext): Promise<Omit<BatchItem, 'key' | 'file'>> {
  let image: Blob
  try {
    image = await compressForReading(file)
  } catch {
    return { status: 'error', message: 'Image illisible (essaie en JPEG ou PNG).' }
  }

  let recipe
  try {
    recipe = (await api.recipes.importFromPhotos([image], tags)).recipe
  } catch (error) {
    // 422 : la page n'est pas une recette (couverture, sommaire…).
    if (error instanceof AppError && error.code === 'import-422') return { status: 'skipped', message: 'Pas une recette' }
    return { status: 'error', message: error instanceof Error ? error.message : 'La lecture a échoué.' }
  }

  const values = { ...importedToFormValues(recipe, ''), source: book }
  const title = values.title.trim()
  const key = normalizeName(title)
  const existing = known.get(key)
  if (existing !== undefined) return { status: 'duplicate', title, recipeId: existing || undefined, message: 'Déjà enregistrée' }

  const errors = validateRecipeForm(values)
  if (hasErrors(errors)) return { status: 'incomplete', title, message: firstError(errors) ?? 'Recette incomplète' }

  // Réservé avant l'enregistrement : une autre image du même titre, lue en parallèle, sera un doublon.
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
