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
