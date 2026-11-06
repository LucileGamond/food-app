// Enregistrement des photos du formulaire de recette, une fois la recette enregistrée.

import type { Api } from '@/api'
import type { PhotoDraft } from '@/components/recipes/PhotoUploader'
import { compressImage } from '@/lib/image'
import type { RecipePhoto } from '@/lib/recipes'

/**
 * Supprime les photos retirées, envoie les nouvelles une par une (réduites), puis enregistre l'ordre (la première est
 * la principale). `onUploaded` : chaque photo envoyée, pour ne pas la renvoyer si l'enregistrement est relancé.
 */
export async function syncRecipePhotos(
  api: Pick<Api, 'photos'>,
  recipeId: string,
  { photos, removed }: { photos: readonly PhotoDraft[]; removed: readonly PhotoDraft[] },
  { onRemoved, onUploaded }: { onRemoved: () => void; onUploaded: (key: string, photo: RecipePhoto) => void },
): Promise<void> {
  for (const photo of removed) if (photo.kind === 'existing') await api.photos.deletePhoto(photo)
  onRemoved()

  const ordered: string[] = []
  for (const photo of photos) {
    if (photo.kind === 'existing') {
      ordered.push(photo.id)
      continue
    }
    const uploaded = await api.photos.uploadPhoto(recipeId, await compressImage(photo.file))
    onUploaded(photo.key, uploaded)
    ordered.push(uploaded.id)
  }
  if (ordered.length > 1) await api.photos.reorderPhotos(ordered)
}
