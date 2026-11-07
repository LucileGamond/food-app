// Retouche d'une photo de recette : quart de tour et recadrage. Fonctions pures ; le dessin est dans lib/image (editImage).

/** Quart de tour, dans le sens des aiguilles d'une montre. */
export type Rotation = 0 | 90 | 180 | 270

/** Cadre gardé, en fractions de la largeur et de la hauteur de l'image tournée. */
export interface Crop {
  left: number
  top: number
  right: number
  bottom: number
}

export const FULL_CROP: Crop = { left: 0, top: 0, right: 1, bottom: 1 }

/** Plus petit côté du cadre (fraction) : en dessous, un glissé raté plutôt qu'un vrai recadrage. */
export const MIN_CROP_SIDE = 0.1

/** Quart de tour à gauche (-1) ou à droite (+1). */
export function turn(rotation: Rotation, direction: 1 | -1): Rotation {
  return (((rotation + direction * 90) % 360) + 360) % 360 as Rotation
}

/**
 * Cadre tracé du doigt, d'un point à l'autre (fractions de l'image affichée, dans n'importe quel sens). Trop petit :
 * `null` (un simple toucher ne recadre pas).
 */
export function cropFromDrag(from: { x: number; y: number }, to: { x: number; y: number }): Crop | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const [x1, x2] = [clamp(from.x), clamp(to.x)].sort((a, b) => a - b) as [number, number]
  const [y1, y2] = [clamp(from.y), clamp(to.y)].sort((a, b) => a - b) as [number, number]
  if (x2 - x1 < MIN_CROP_SIDE || y2 - y1 < MIN_CROP_SIDE) return null
  return { left: x1, top: y1, right: x2, bottom: y2 }
}

/** Le cadre suit l'image quand on la tourne d'un quart de tour (ce qui était en haut passe à droite, etc.). */
export function rotateCrop(crop: Crop, direction: 1 | -1): Crop {
  return direction === 1
    ? { left: 1 - crop.bottom, top: crop.left, right: 1 - crop.top, bottom: crop.right }
    : { left: crop.top, top: 1 - crop.right, right: crop.bottom, bottom: 1 - crop.left }
}

export const isFullCrop = (crop: Crop): boolean => crop.left <= 0 && crop.top <= 0 && crop.right >= 1 && crop.bottom >= 1

/** Rien à changer : ni tournée ni recadrée. */
export const isUnchanged = (rotation: Rotation, crop: Crop): boolean => rotation === 0 && isFullCrop(crop)
