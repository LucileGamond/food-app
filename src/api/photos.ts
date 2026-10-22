import { photoPath, type RecipePhoto } from '@/lib/recipes'
import type { AppSupabaseClient } from '@/lib/supabase'
import { toAppError } from './errors'

export const PHOTO_BUCKET = 'recipe-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function createPhotosApi(db: AppSupabaseClient) {
  return {
    /** Envoie une photo (déjà compressée) et l'ajoute en dernière position. */
    async uploadPhoto(recipeId: string, file: Blob): Promise<RecipePhoto> {
      const extension = EXTENSIONS[file.type]
      if (!extension) throw toAppError(null, 'Format de photo non pris en charge (JPEG, PNG ou WebP).')

      const path = photoPath(recipeId, crypto.randomUUID(), extension)
      const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type })
      if (uploadError) throw toAppError(null, "Impossible d'envoyer la photo.")

      const { data: last, error: lastError } = await db
        .from('recipe_photos')
        .select('position')
        .eq('recipe_id', recipeId)
        .order('position', { ascending: false })
        .limit(1)
      if (lastError) throw toAppError(lastError, "Impossible d'enregistrer la photo.")

      const { data, error } = await db
        .from('recipe_photos')
        .insert({ recipe_id: recipeId, storage_path: path, position: (last[0]?.position ?? -1) + 1 })
        .select('id, storage_path, position')
        .single()
      if (error) {
        await db.storage.from(PHOTO_BUCKET).remove([path])
        throw toAppError(error, "Impossible d'enregistrer la photo.")
      }
      return data
    },

    async deletePhoto(photo: Pick<RecipePhoto, 'id' | 'storage_path'>): Promise<void> {
      const { error } = await db.from('recipe_photos').delete().eq('id', photo.id)
      if (error) throw toAppError(error, 'Impossible de supprimer la photo.')
      await db.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
    },

    /** Réordonne les photos : la première devient la photo principale. */
    async reorderPhotos(orderedIds: string[]): Promise<void> {
      const results = await Promise.all(
        orderedIds.map((id, position) => db.from('recipe_photos').update({ position }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw toAppError(failed.error, "Impossible de changer l'ordre des photos.")
    },

    /** URL temporaires pour afficher des photos du bucket privé. */
    async signedUrls(paths: string[]): Promise<Record<string, string>> {
      if (paths.length === 0) return {}
      const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw toAppError(null, 'Impossible de charger les photos.')
      const urls: Record<string, string> = {}
      for (const item of data) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
      return urls
    },
  }
}

export type PhotosApi = ReturnType<typeof createPhotosApi>
