// Scan de livre : détection d'une page nette, immobile et nouvelle sur les images de la caméra (réduites, en gris).
// Fonctions pures : la caméra fournit les images (lib/camera), la page décide quand prendre la photo.

/** Image en niveaux de gris (0 à 255), une valeur par pixel, ligne par ligne. */
export interface GrayFrame {
  width: number
  height: number
  data: Uint8Array
}

/** Largeur des images analysées : assez pour juger la netteté du texte, assez petit pour 8 analyses par seconde. */
export const ANALYSIS_WIDTH = 160

/** Seuils de la détection (réglables sur le téléphone avec ?debug=1). */
export const SCAN_CONFIG = {
  /** Écart moyen entre deux images (0 à 255) sous lequel la page est immobile. */
  stillMotion: 4,
  /** Au-delà, la page bouge vraiment : c'est le signe qu'on la tourne. */
  turnMotion: 12,
  /** Durée d'immobilité avant la photo (le temps de retirer les mains de la page). */
  stillMs: 3000,
  /** Netteté minimale (variance du laplacien) : en dessous, page floue ou vide. */
  minSharpness: 30,
  /** Netteté comparée à la meilleure récente : la mise au point est faite. */
  relativeSharpness: 0.6,
  /** Oubli progressif de la meilleure netteté, à chaque image (la lumière change). */
  sharpnessDecay: 0.995,
  /** Délai minimal entre deux photos. */
  minIntervalMs: 1500,
  /**
   * Distance d'empreinte au-delà de laquelle la page n'est plus la même (après l'avoir tournée). Bas : deux pages d'un
   * même livre se ressemblent beaucoup en 32×24 ; une page prise en double coûte moins qu'une page manquée.
   */
  newPage: 0.15,
  /** Sans mouvement vu, il faut une page franchement différente. */
  newPageWithoutTurn: 0.5,
}

export type ScanConfig = typeof SCAN_CONFIG

/** Image RGBA (canvas) → gris, avec les poids de la luminance. */
export function toGray(rgba: ArrayLike<number>, width: number, height: number): GrayFrame {
  const data = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8
  return { width, height, data }
}

/** Netteté : variance du laplacien (bords francs du texte → valeurs élevées ; flou → valeurs faibles). */
export function sharpness({ width, height, data }: GrayFrame): number {
  if (width < 3 || height < 3) return 0
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = 4 * data[i]! - data[i - 1]! - data[i + 1]! - data[i - width]! - data[i + width]!
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Mouvement : écart moyen entre deux images de même taille (Infinity si la taille diffère). */
export function motion(a: GrayFrame, b: GrayFrame): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity
  let total = 0
  for (let i = 0; i < a.data.length; i++) total += Math.abs(a.data[i]! - b.data[i]!)
  return total / a.data.length
}

export const SIGNATURE_WIDTH = 32
export const SIGNATURE_HEIGHT = 24

/** Empreinte d'une page : image réduite à 32×24, centrée et normalisée (peu sensible à la lumière). */
export function signature({ width, height, data }: GrayFrame): Float32Array {
  const out = new Float32Array(SIGNATURE_WIDTH * SIGNATURE_HEIGHT)
  for (let sy = 0; sy < SIGNATURE_HEIGHT; sy++) {
    const y0 = Math.floor((sy * height) / SIGNATURE_HEIGHT)
    const y1 = Math.max(y0 + 1, Math.floor(((sy + 1) * height) / SIGNATURE_HEIGHT))
    for (let sx = 0; sx < SIGNATURE_WIDTH; sx++) {
      const x0 = Math.floor((sx * width) / SIGNATURE_WIDTH)
      const x1 = Math.max(x0 + 1, Math.floor(((sx + 1) * width) / SIGNATURE_WIDTH))
      let total = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) total += data[y * width + x] ?? 0
      out[sy * SIGNATURE_WIDTH + sx] = total / ((y1 - y0) * (x1 - x0))
    }
  }
  const mean = out.reduce((a, v) => a + v, 0) / out.length
  const std = Math.sqrt(out.reduce((a, v) => a + (v - mean) ** 2, 0) / out.length) || 1
  return out.map((v) => (v - mean) / Math.max(std, 1))
}

/** Distance entre deux empreintes : 0 pour la même page, ~1 et plus pour une autre. */
export function signatureDistance(a: Float32Array, b: Float32Array): number {
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i]! - b[i]!)
  return total / a.length
}

/** Ce que l'écran affiche : pourquoi la photo n'est pas (encore) prise. */
export type ScanHint = 'moving' | 'same-page' | 'blurry' | 'steadying' | 'ready'

export interface ScanState {
  previous: GrayFrame | null
  /** Début de l'immobilité en cours. */
  stillSince: number | null
  /** Meilleure netteté récente (oubliée peu à peu). */
  best: number
  lastCaptureAt: number
  /** Empreinte de la dernière page prise. */
  lastSignature: Float32Array | null
  /** Un vrai mouvement (page tournée) a été vu depuis la dernière photo. */
  turned: boolean
}

export const initialScanState = (): ScanState => ({ previous: null, stillSince: null, best: 0, lastCaptureAt: -Infinity, lastSignature: null, turned: false })

export interface ScanStep {
  state: ScanState
  /** Prendre la photo maintenant. */
  capture: boolean
  hint: ScanHint
  metrics: { sharpness: number; motion: number; distance: number }
}

/** Une image analysée de plus : faut-il prendre la photo ? Page immobile depuis assez longtemps, nette, et nouvelle. */
export function nextScanState(state: ScanState, frame: GrayFrame, now: number, config: ScanConfig = SCAN_CONFIG): ScanStep {
  const sharp = sharpness(frame)
  const move = state.previous ? motion(state.previous, frame) : Infinity
  const print = signature(frame)
  const distance = state.lastSignature ? signatureDistance(print, state.lastSignature) : Infinity
  const best = Math.max(sharp, state.best * config.sharpnessDecay)
  // Page tournée : grand mouvement entre deux images, ou vue passée loin de la page prise (main devant, page en l'air).
  const turned =
    state.turned || (Number.isFinite(move) && move > config.turnMotion) || (state.lastSignature !== null && distance > config.newPageWithoutTurn)
  const still = move <= config.stillMotion
  const stillSince = still ? (state.stillSince ?? now) : null

  const isNew = state.lastSignature === null || (turned && distance > config.newPage) || distance > config.newPageWithoutTurn
  const sharpEnough = sharp >= config.minSharpness && sharp >= best * config.relativeSharpness
  const steady = stillSince !== null && now - stillSince >= config.stillMs
  const hint: ScanHint = !still ? 'moving' : !isNew ? 'same-page' : !sharpEnough ? 'blurry' : !steady ? 'steadying' : 'ready'
  const capture = hint === 'ready' && now - state.lastCaptureAt >= config.minIntervalMs

  const next: ScanState = capture
    ? { previous: frame, stillSince: null, best, lastCaptureAt: now, lastSignature: print, turned: false }
    : { previous: frame, stillSince, best, lastCaptureAt: state.lastCaptureAt, lastSignature: state.lastSignature, turned }
  return { state: next, capture, hint, metrics: { sharpness: sharp, motion: move, distance } }
}

/** Photo prise à la main : la page affichée compte comme prise (pas de photo automatique en double). */
export function registerCapture(state: ScanState, frame: GrayFrame | null, now: number): ScanState {
  return { ...state, stillSince: null, lastCaptureAt: now, lastSignature: frame ? signature(frame) : state.lastSignature, turned: false }
}

/** La page de la dernière photo est encore devant la caméra (rien n'a été tourné depuis). */
export function samePageInView(state: ScanState): boolean {
  return state.lastSignature !== null && !state.turned
}
