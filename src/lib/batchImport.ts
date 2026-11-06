import { foldText } from './text'

/** Images lues en même temps : plus rapide, sans trop solliciter le service d'analyse. */
export const BATCH_CONCURRENCY = 2

/** État d'une image : lue (`done`, avec une ou plusieurs recettes), sans recette, ou en erreur. */
export type BatchStatus = 'pending' | 'reading' | 'done' | 'skipped' | 'error'

/** Résultat pour chaque recette lue sur l'image (une page peut en contenir plusieurs). */
export type RecipeOutcome = 'saved' | 'duplicate' | 'incomplete' | 'error'

export interface BatchRecipe {
  status: RecipeOutcome
  title: string
  /** Recette créée, ou recette existante pour un doublon. */
  recipeId?: string
  message?: string
  /** Photo du plat recadrée dans la page et ajoutée à la recette. */
  photo?: boolean
}

export interface BatchItem {
  key: string
  file: File
  status: BatchStatus
  /** Image sans recette ou en erreur. */
  message?: string
  recipes: BatchRecipe[]
}

export type BatchResult = Pick<BatchItem, 'status' | 'message' | 'recipes'>

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

/** Une image à relire : erreur de lecture, ou une de ses recettes n'a pas pu être enregistrée. */
export function needsRetry(item: Pick<BatchItem, 'status' | 'recipes'>): boolean {
  return item.status === 'error' || item.recipes.some((r) => r.status === 'error')
}

/**
 * Résultat d'une image relue : ce qui avait abouti reste tel quel (une recette déjà enregistrée par la première lecture
 * ne devient pas « déjà enregistrée »), les autres recettes prennent le nouveau résultat.
 */
export function mergeRetry(previous: readonly BatchRecipe[], next: BatchResult): BatchResult {
  const kept = previous.filter((r) => r.status !== 'error')
  // Relecture en échec : l'image garde son premier résultat (et ses erreurs, à réessayer encore).
  if (next.status !== 'done') return previous.length > 0 ? { status: 'done', recipes: [...previous] } : next
  const done = new Set(kept.map((r) => foldText(r.title)))
  return { status: 'done', recipes: [...kept, ...next.recipes.filter((r) => !done.has(foldText(r.title)))] }
}

export type Tally = Record<RecipeOutcome | 'skipped', number>

/** Décompte des recettes (enregistrées, doublons, à compléter, erreurs) et des images sans recette. */
export function tally(items: readonly Pick<BatchItem, 'status' | 'recipes'>[]): Tally {
  const counts: Tally = { saved: 0, duplicate: 0, incomplete: 0, error: 0, skipped: 0 }
  for (const item of items) {
    if (item.status === 'skipped') counts.skipped += 1
    if (item.status === 'error') counts.error += 1
    for (const recipe of item.recipes) counts[recipe.status] += 1
  }
  return counts
}
