// Tricot : notes et photos d'avancement d'un projet.

/** Photo prise au fil du projet, avec l'étape en cours à ce moment-là. */
export interface ProgressPhoto {
  id: string
  storagePath: string
  caption: string
  stepId: string | null
  takenAt: string
}

export interface ProjectProgress {
  notes: string
  /** Les plus récentes d'abord. */
  photos: ProgressPhoto[]
}

export const PROJECT_NOTES_MAX = 5000
export const CAPTION_MAX = 200

/** « 8 nov. 2026 » : date d'une photo. */
export function formatPhotoDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

/** « Dos – côtes · 8 nov. 2026 », ou la date seule (étape supprimée, photo sans étape). */
export function describePhoto(photo: ProgressPhoto, stepTitle: (stepId: string) => string | undefined): string {
  const step = photo.stepId ? stepTitle(photo.stepId) : undefined
  return [step, formatPhotoDate(photo.takenAt)].filter(Boolean).join(' · ')
}
