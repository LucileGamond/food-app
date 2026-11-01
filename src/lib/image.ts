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
 * Photo du plat recadrée dans une page de livre photographiée (cadre en fractions de l'image, donné par la lecture),
 * puis réduite comme une photo de recette. Rejette si le navigateur ne sait pas lire l'image.
 */
export async function cropImage(file: Blob, area: { left: number; top: number; right: number; bottom: number }): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const sx = Math.round(area.left * bitmap.width)
  const sy = Math.round(area.top * bitmap.height)
  const width = Math.max(1, Math.round((area.right - area.left) * bitmap.width))
  const height = Math.max(1, Math.round((area.bottom - area.top) * bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Recadrage impossible.')
  context.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height)
  bitmap.close()
  const cropped = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!cropped) throw new Error('Recadrage impossible.')
  const reduced = await compressImage(new File([cropped], 'photo-du-plat.jpg', { type: 'image/jpeg' }))
  return new File([reduced], 'photo-du-plat.jpg', { type: 'image/jpeg' })
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
