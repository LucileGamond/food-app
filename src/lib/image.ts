import imageCompression from 'browser-image-compression'

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Réduit une photo (≈ 200 Ko, 1600 px max) avant envoi, au format JPEG. */
export async function compressImage(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1600,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
    // Pas de web worker : la bibliothèque le chargerait depuis un CDN.
    useWebWorker: false,
  })
}

/**
 * Prépare une photo de page de livre (ou un scan) pour la lecture par le modèle : assez grande pour lire
 * le texte (1568 px, la taille la plus utile au modèle), assez légère pour l'envoi (≈ 600 Ko).
 */
export async function compressForReading(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1568,
    fileType: 'image/jpeg',
    initialQuality: 0.85,
    useWebWorker: false,
  })
}
