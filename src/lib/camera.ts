// Scan de livre : caméra arrière du téléphone. Le flux vidéo sert à l'aperçu et à la détection (images réduites en gris) ;
// la photo elle-même est une vraie photo (ImageCapture.takePhoto) quand le navigateur le permet, sinon une image du flux.
// Code navigateur seulement : testé de bout en bout avec une fausse caméra (e2e/book-scan.spec.ts).

import { ANALYSIS_WIDTH, sharpness, toGray, type GrayFrame } from './pageScan'

/** Côté long des images envoyées à la lecture (la taille la plus utile au modèle). */
export const READING_SIZE = 1568
const READING_QUALITY = 0.85
const PHOTO_TIMEOUT_MS = 4000
/** Une vraie photo moins nette que l'aperçu (téléphone bougé pendant la prise) est reprise, 2 essais au plus. */
const PHOTO_ATTEMPTS = 2
const MIN_PHOTO_SHARPNESS = 0.5

interface ImageCaptureLike {
  takePhoto(settings?: { fillLightMode?: 'off' | 'flash' | 'auto' }): Promise<Blob>
}
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike
type TrackCapabilities = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean; zoom?: { min: number; max: number; step?: number } }

/** Zoom de la caméra (si le téléphone le permet) : bornes, pas et valeur actuelle. */
export interface CameraZoom {
  min: number
  max: number
  step: number
  value: number
}

export interface CameraSession {
  /** Image actuelle réduite en gris, pour la détection (null tant que la vidéo n'a pas d'image). */
  analysisFrame(): GrayFrame | null
  /** Prend la photo : une page, ou les deux moitiés d'une double page (téléphone en paysage), prêtes à lire. */
  capture(): Promise<Blob[]>
  /** Téléphone en paysage : double page. */
  isDoublePage(): boolean
  hasTorch: boolean
  setTorch(on: boolean): Promise<void>
  /** Zoom réglable, ou null si le téléphone ne le permet pas. */
  zoom: CameraZoom | null
  setZoom(value: number): Promise<void>
  stop(): void
}

/** Le scan demande la caméra du téléphone et Chrome sur Android (vraie photo, mise au point continue). */
export function canScanBooks(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && Boolean(navigator.mediaDevices?.getUserMedia)
}

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const context = element.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas indisponible.')
  return [element, context]
}

/** Image (vidéo ou photo) réduite à la largeur d'analyse, en gris. */
function grayOf(source: CanvasImageSource, width: number, height: number): GrayFrame {
  const w = ANALYSIS_WIDTH
  const h = Math.max(1, Math.round((height * w) / width))
  const [, context] = canvas(w, h)
  context.drawImage(source, 0, 0, w, h)
  return toGray(context.getImageData(0, 0, w, h).data, w, h)
}

const toJpeg = (element: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => element.toBlob((b) => (b ? resolve(b) : reject(new Error('Photo illisible.'))), 'image/jpeg', READING_QUALITY))

/** Partie de l'image réduite à la taille de lecture, en JPEG. */
async function readingImage(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Promise<Blob> {
  const scale = Math.min(1, READING_SIZE / Math.max(sw, sh))
  const [element, context] = canvas(Math.round(sw * scale), Math.round(sh * scale))
  context.drawImage(source, sx, sy, sw, sh, 0, 0, element.width, element.height)
  return toJpeg(element)
}

/** Une page entière, ou une double page coupée au milieu (repère affiché à l'écran) : gauche puis droite. */
async function readingPages(source: CanvasImageSource, width: number, height: number, double: boolean): Promise<Blob[]> {
  if (!double) return [await readingImage(source, 0, 0, width, height)]
  const half = Math.floor(width / 2)
  return Promise.all([readingImage(source, 0, 0, half, height), readingImage(source, half, 0, width - half, height)])
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai dépassé.')), ms)
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    )
  })
}

/** Ouvre la caméra arrière dans l'élément vidéo (aperçu). Rejette si l'accès est refusé. */
export async function openCamera(video: HTMLVideoElement): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  })
  const track = stream.getVideoTracks()[0]!
  const capabilities: TrackCapabilities = track.getCapabilities?.() ?? {}
  if (capabilities.focusMode?.includes('continuous')) {
    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined)
  }
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play().catch(() => undefined)

  const Capture = (window as Window & { ImageCapture?: ImageCaptureCtor }).ImageCapture
  const imageCapture = Capture ? new Capture(track) : null
  const ready = () => video.readyState >= 2 && video.videoWidth > 0
  const isDoublePage = () => video.videoWidth > video.videoHeight

  /** Vraie photo, si elle a la même orientation que l'aperçu et qu'elle est nette ; sinon null. */
  async function takePhoto(): Promise<ImageBitmap | null> {
    if (!imageCapture) return null
    const preview = sharpness(grayOf(video, video.videoWidth, video.videoHeight))
    for (let attempt = 0; attempt < PHOTO_ATTEMPTS; attempt++) {
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(await withTimeout(imageCapture.takePhoto(), PHOTO_TIMEOUT_MS))
      } catch {
        return null
      }
      const sameOrientation = bitmap.width > bitmap.height === isDoublePage()
      if (!sameOrientation) {
        bitmap.close()
        return null
      }
      if (sharpness(grayOf(bitmap, bitmap.width, bitmap.height)) >= preview * MIN_PHOTO_SHARPNESS) return bitmap
      bitmap.close()
    }
    return null
  }

  return {
    analysisFrame: () => (ready() ? grayOf(video, video.videoWidth, video.videoHeight) : null),
    isDoublePage,
    async capture() {
      const double = isDoublePage()
      const photo = await takePhoto()
      if (photo) {
        try {
          return await readingPages(photo, photo.width, photo.height, double)
        } finally {
          photo.close()
        }
      }
      if (!ready()) throw new Error('La caméra n’est pas prête.')
      return readingPages(video, video.videoWidth, video.videoHeight, double)
    },
    hasTorch: capabilities.torch === true,
    async setTorch(on) {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined)
    },
    zoom:
      capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min
        ? {
            min: capabilities.zoom.min,
            max: capabilities.zoom.max,
            step: capabilities.zoom.step || 0.1,
            value: (track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? capabilities.zoom.min,
          }
        : null,
    async setZoom(value) {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => undefined)
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop())
      // Une autre ouverture a pu prendre l'élément entre-temps (double montage en développement) : on ne la coupe pas.
      if (video.srcObject === stream) video.srcObject = null
    },
  }
}

/** Retour à chaque photo : petit bip et vibration (le flash blanc est affiché par la page). */
export function createShutterFeedback(): () => void {
  let audio: AudioContext | null = null
  try {
    audio = new AudioContext()
  } catch {
    audio = null
  }
  return () => {
    navigator.vibrate?.(60)
    if (!audio) return
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.15, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.12)
  }
}
