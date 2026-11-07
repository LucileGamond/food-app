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
 * Photo retouchée : tournée d'un quart de tour (sens horaire) puis recadrée (cadre en fractions de l'image tournée).
 * `maxSide` réduit le résultat (aperçu). Rejette si le navigateur ne sait pas lire ou produire l'image.
 */
export async function editImage(
  file: Blob,
  { rotation, crop, maxSide = Infinity }: { rotation: 0 | 90 | 180 | 270; crop: { left: number; top: number; right: number; bottom: number }; maxSide?: number },
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const sideways = rotation === 90 || rotation === 270
  const [width, height] = sideways ? [bitmap.height, bitmap.width] : [bitmap.width, bitmap.height]
  // Image tournée en entier, puis le cadre découpé dedans.
  const turned = document.createElement('canvas')
  turned.width = width
  turned.height = height
  const turnedContext = turned.getContext('2d')
  if (!turnedContext) throw new Error('Retouche impossible.')
  turnedContext.translate(width / 2, height / 2)
  turnedContext.rotate((rotation * Math.PI) / 180)
  turnedContext.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  bitmap.close()

  const sx = Math.round(crop.left * width)
  const sy = Math.round(crop.top * height)
  const sw = Math.max(1, Math.round((crop.right - crop.left) * width))
  const sh = Math.max(1, Math.round((crop.bottom - crop.top) * height))
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  const context = out.getContext('2d')
  if (!context) throw new Error('Retouche impossible.')
  context.drawImage(turned, sx, sy, sw, sh, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Retouche impossible.')
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
}

/**
 * Photo du plat recadrée dans une page de livre photographiée (cadre en fractions de l'image, donné par la lecture),
 * puis réduite comme une photo de recette. Rejette si le navigateur ne sait pas lire l'image.
 */
export async function cropImage(
  file: Blob,
  area: { left: number; top: number; right: number; bottom: number; rotation?: number | null },
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const sx = Math.round(area.left * bitmap.width)
  const sy = Math.round(area.top * bitmap.height)
  const width = Math.max(1, Math.round((area.right - area.left) * bitmap.width))
  const height = Math.max(1, Math.round((area.bottom - area.top) * bitmap.height))
  // Page photographiée de travers ou à l'envers : la photo du plat est remise à l'endroit (quart de tour, sens horaire).
  const rotation = area.rotation === 90 || area.rotation === 180 || area.rotation === 270 ? area.rotation : 0
  const sideways = rotation === 90 || rotation === 270
  const canvas = document.createElement('canvas')
  canvas.width = sideways ? height : width
  canvas.height = sideways ? width : height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Recadrage impossible.')
  if (rotation === 0) {
    context.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height)
  } else {
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(bitmap, sx, sy, width, height, -width / 2, -height / 2, width, height)
  }
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
