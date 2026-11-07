// Photo de plat remise à l'endroit : la photo tournée des 4 façons est soumise au modèle, qui choisit la bonne.

import type { Api } from '@/api'
import { compressImage, editImage } from '@/lib/image'
import { FULL_CROP, type Rotation } from '@/lib/photoEdit'

/** Côté long des 4 versions envoyées : assez pour reconnaître le plat, léger (≈ 4 × 150 jetons). */
const CANDIDATE_SIDE = 384
const ROTATIONS: Rotation[] = [0, 90, 180, 270]

/** Rotation (sens horaire) qui remet la photo à l'endroit, d'après le modèle ; 0 en cas de doute. */
export async function detectRotation(api: Pick<Api, 'recipes'>, photo: Blob): Promise<Rotation> {
  const candidates = await Promise.all(ROTATIONS.map((rotation) => editImage(photo, { rotation, crop: FULL_CROP, maxSide: CANDIDATE_SIDE })))
  return (await api.recipes.detectPhotoRotation(candidates)) as Rotation
}

export interface StraightenProgress {
  done: number
  total: number
  /** Photos remises à l'endroit. */
  fixed: number
  /** Photos qui n'ont pas pu être vérifiées (gardées telles quelles). */
  failed: number
}

/**
 * Toutes les photos des recettes enregistrées vérifiées une à une, et remises à l'endroit à la même place si besoin.
 * `onProgress` après chaque photo ; `shouldStop` interrompt entre deux photos.
 */
export async function straightenAllPhotos(
  api: Pick<Api, 'recipes' | 'photos'>,
  onProgress: (progress: StraightenProgress) => void,
  shouldStop: () => boolean = () => false,
): Promise<StraightenProgress> {
  const photos = await api.photos.listAllPhotos()
  const urls = await api.photos.signedUrls(photos.map((p) => p.storage_path))
  const progress: StraightenProgress = { done: 0, total: photos.length, fixed: 0, failed: 0 }
  onProgress({ ...progress })
  for (const photo of photos) {
    if (shouldStop()) break
    try {
      const response = await fetch(urls[photo.storage_path]!)
      if (!response.ok) throw new Error('Photo indisponible.')
      const blob = await response.blob()
      const rotation = await detectRotation(api, blob)
      if (rotation !== 0) {
        await api.photos.replacePhoto(photo, await compressImage(await editImage(blob, { rotation, crop: FULL_CROP })))
        progress.fixed++
      }
    } catch {
      progress.failed++
    }
    progress.done++
    onProgress({ ...progress })
  }
  return progress
}

/** Photo remise à l'endroit si besoin ; un échec (réseau, image illisible) la laisse telle quelle. */
export async function uprightPhoto(api: Pick<Api, 'recipes'>, photo: File): Promise<File> {
  try {
    const rotation = await detectRotation(api, photo)
    return rotation === 0 ? photo : await editImage(photo, { rotation, crop: FULL_CROP })
  } catch {
    return photo
  }
}
