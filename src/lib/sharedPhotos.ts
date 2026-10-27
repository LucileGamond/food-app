/**
 * Photos partagées depuis la galerie du téléphone (cible de partage du manifeste, en POST).
 * Le service worker (public/share-sw.js) les range dans ce cache, puis ouvre /recettes/nouvelle?photos=partage.
 */
export const SHARED_PHOTOS_CACHE = 'food-shared-photos'

/** Récupère les photos partagées (et les retire du cache) ; liste vide si rien n'a été partagé. */
export async function takeSharedPhotos(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  try {
    const cache = await caches.open(SHARED_PHOTOS_CACHE)
    const requests = await cache.keys()
    const files: File[] = []
    for (const [index, request] of requests.entries()) {
      const response = await cache.match(request)
      if (!response) continue
      const blob = await response.blob()
      files.push(new File([blob], `page-${index + 1}`, { type: blob.type || 'image/jpeg' }))
    }
    await caches.delete(SHARED_PHOTOS_CACHE)
    return files
  } catch {
    return []
  }
}
