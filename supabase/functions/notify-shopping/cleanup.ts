// Ménage de nuit des fichiers que plus rien n'utilise : photos temporaires (pending/) d'un élément planifié puis
// remplacé, d'un repas supprimé ou d'une recette enregistrée ; photos d'une recette supprimée dont l'effacement a
// échoué ; PDF d'un projet de tricot ; photos d'une plante supprimée ; envois interrompus.

/** Buckets nettoyés. */
export const CLEANED_BUCKETS = ['recipe-photos', 'knit-patterns', 'knit-charts', 'knit-photos', 'plant-photos'] as const
export type CleanedBucket = (typeof CLEANED_BUCKETS)[number]

export interface StoredFile {
  /** Chemin dans le bucket : « pending/<uuid>.jpg », « <recette>/<uuid>.jpg », « <personne>/<uuid>.pdf ». */
  path: string
  createdAt: string | null
}

/** Âge minimal d'un fichier supprimé : un envoi en cours n'est pas encore rattaché à sa recette ou son élément. */
export const CLEANUP_MIN_AGE_MS = 24 * 3600 * 1000

/** Fichiers à supprimer : ni utilisés ni récents. */
export function orphanFiles(files: StoredFile[], referenced: Iterable<string>, now: number, minAgeMs = CLEANUP_MIN_AGE_MS): string[] {
  const used = new Set(referenced)
  return files
    .filter((f) => !used.has(f.path))
    .filter((f) => f.createdAt !== null && now - Date.parse(f.createdAt) >= minAgeMs)
    .map((f) => f.path)
}
