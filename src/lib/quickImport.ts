// Choix à l'import d'une recette (partage, « Nouvelle recette ») : l'enregistrer directement (analyse puis
// enregistrement, sans formulaire), ou la garder pour plus tard, sans analyse, dans « De côté » ou « À planifier ».

import type { Api } from '@/api'
import { compressForReading, compressImage, cropImage } from './image'
import { MAX_INBOX_PHOTOS, photosTitle, type InboxList } from './inbox'
import {
  hasErrors,
  importedImageToFile,
  importedToFormValues,
  siteName,
  toSaveRecipeInput,
  validateRecipeForm,
  type ImportedRecipe,
  type RecipeFormErrors,
} from './recipes'

/** Ce qu'on importe : un lien, ou 1 à 3 photos (pages d'un livre, captures d'écran). */
export type ImportSource = { kind: 'link'; url: string; title?: string | null } | { kind: 'photos'; files: File[] }

export type DirectResult =
  /** Recettes enregistrées (une page de livre peut en contenir plusieurs). */
  | { kind: 'saved'; recipes: { id: string; title: string }[] }
  /** Lien déjà enregistré : rien n'est refait. */
  | { kind: 'duplicate'; recipe: { id: string; title: string } }
  /** Recette lue mais incomplète : à finir dans le formulaire. */
  | { kind: 'incomplete'; message: string }

const firstError = (errors: RecipeFormErrors) =>
  errors.title ?? errors.ingredients ?? Object.values(errors.ingredientRows ?? {})[0] ?? Object.values(errors).find((e) => typeof e === 'string')

type QuickApi = Pick<Api, 'recipes' | 'photos' | 'inbox'>

/** Photo ajoutée à une recette enregistrée ; un échec laisse la recette sans photo. */
async function addPhoto(api: QuickApi, recipeId: string, photo: () => Promise<Blob>) {
  try {
    await api.photos.uploadPhoto(recipeId, await photo())
  } catch {
    // La recette est enregistrée : la photo pourra être ajoutée à la main.
  }
}

/**
 * Analyse et enregistre aussitôt, sans formulaire : la photo de la page (lien) ou la photo du plat recadrée (photos)
 * devient celle de la recette. Recette incomplète (titre, ingrédients illisibles) : rien n'est enregistré.
 */
export async function saveDirectly(api: QuickApi, source: ImportSource, tags: string[]): Promise<DirectResult> {
  if (source.kind === 'link') {
    const existing = await api.recipes.findSavedByUrl(source.url)
    if (existing) return { kind: 'duplicate', recipe: existing }
    const result = await api.recipes.importFromUrl(source.url, tags)
    const saved = await save(api, result.recipe, source.url)
    if ('message' in saved) return { kind: 'incomplete', message: saved.message }
    if (result.image) await addPhoto(api, saved.id, () => compressImage(importedImageToFile(result.image!)))
    return { kind: 'saved', recipes: [saved] }
  }

  const files = source.files.slice(0, MAX_INBOX_PHOTOS)
  const result = await api.recipes.importFromPhotos(await Promise.all(files.map(compressForReading)), tags)
  const recipes = result.recipes?.length ? result.recipes : [result.recipe]
  const saved: { id: string; title: string }[] = []
  const incomplete: string[] = []
  for (const recipe of recipes) {
    const outcome = await save(api, recipe, '')
    if ('message' in outcome) {
      incomplete.push(outcome.message)
      continue
    }
    saved.push(outcome)
    const page = recipe.photo ? files[recipe.photo.image] : undefined
    if (page) await addPhoto(api, outcome.id, () => cropImage(page, recipe.photo!))
  }
  return saved.length > 0 ? { kind: 'saved', recipes: saved } : { kind: 'incomplete', message: incomplete[0] ?? 'Recette incomplète' }
}

async function save(api: QuickApi, recipe: ImportedRecipe, url: string): Promise<{ id: string; title: string } | { message: string }> {
  const values = importedToFormValues(recipe, url)
  const errors = validateRecipeForm(values)
  if (hasErrors(errors)) return { message: firstError(errors) ?? 'Recette incomplète' }
  const id = await api.recipes.saveRecipe(toSaveRecipeInput(null, values))
  return { id, title: values.title.trim() }
}

/**
 * Garde la recette pour plus tard, sans l'analyser : le lien (titre de la page récupéré ensuite), ou les photos
 * réduites et envoyées au stockage. Renvoie l'élément créé.
 */
export async function keepForLater(api: QuickApi, source: ImportSource, list: InboxList): Promise<string> {
  if (source.kind === 'link') {
    const title = source.title?.trim() || siteName(source.url)
    const id = await api.inbox.addItem({ url: source.url, title, list })
    if (!source.title?.trim()) {
      // Titre provisoire (nom du site) remplacé par celui de la page, sans attendre.
      void api.inbox.fetchTitle(source.url).then((found) => {
        if (found && found !== title) void api.inbox.renameItem(id, found, title).catch(() => undefined)
      })
    }
    return id
  }
  const photos = await Promise.all(source.files.slice(0, MAX_INBOX_PHOTOS).map(compressForReading))
  const paths = await api.inbox.uploadPhotos(photos)
  try {
    return await api.inbox.addItem({ title: photosTitle(), photos: paths, list })
  } catch (error) {
    await api.inbox.removePhotos(paths).catch(() => undefined)
    throw error
  }
}
