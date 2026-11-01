/**
 * Photos partagées depuis la galerie du téléphone (cible de partage du manifeste, en POST).
 * Le service worker (public/share-sw.js) les range dans ce cache, puis ouvre /recettes/nouvelle?photos=partage.
 */
export const SHARED_PHOTOS_CACHE = 'food-shared-photos'

/** Photos passées d'un écran à l'autre (écran de partage → formulaire), sans repasser par le cache. */
let handedOff: File[] = []

/** Confie des photos au formulaire « Nouvelle recette », ouvert ensuite avec ?photos=partage. */
export function handOffPhotos(files: File[]): void {
  handedOff = files
}

/** Récupère les photos partagées (et les retire du cache) ; liste vide si rien n'a été partagé. */
export async function takeSharedPhotos(): Promise<File[]> {
  if (handedOff.length > 0) {
    const files = handedOff
    handedOff = []
    return files
  }
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
