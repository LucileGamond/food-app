// Outils communs de l'API Tricot : buckets, appel à la fonction knit-pattern, envoi de fichiers dans le dossier de la
// personne connectée.

import { AppError, functionError, toAppError } from '@/api/errors'
import type { AppSupabaseClient } from '@/api/client'
import { MAX_PDF_BYTES, PDF_TOO_LARGE } from '../lib/pattern'

export const PATTERN_BUCKET = 'knit-patterns'
export const CHART_BUCKET = 'knit-charts'
/** Photos d'avancement et photos des patrons : dossier par personne (<uid>/<uuid>.jpg). */
export const PROGRESS_BUCKET = 'knit-photos'
/** Lecture d'un long patron : jusqu'à 2 minutes côté modèle. */
export const READ_TIMEOUT_MS = 150_000
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Contenu du fichier en base64. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  // Par morceaux : String.fromCharCode refuse des dizaines de millions d'arguments.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function checkPdf(file: File): void {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new AppError('Choisis un fichier PDF.')
  if (file.size > MAX_PDF_BYTES) throw new AppError(PDF_TOO_LARGE)
}

/** Lignes dont la colonne tableau `column` contient exactement les valeurs `key` (ni plus ni moins, dans n'importe quel ordre). */
export function sameSet<Q extends { contains(column: string, value: string[]): Q; containedBy(column: string, value: string[]): Q }>(query: Q, column: string, key: string[]): Q {
  return query.contains(column, key).containedBy(column, key)
}

export type KnitContext = ReturnType<typeof createKnitContext>

export function createKnitContext(db: AppSupabaseClient) {
  /** Appelle la fonction knit-pattern (lecture par le modèle) ; `valid` vérifie la forme de la réponse. */
  async function invokeKnit<T>(body: Record<string, unknown>, failure: string, valid: (data: T) => boolean, timeout = 60_000): Promise<T> {
    const { data, error } = await db.functions.invoke<T>('knit-pattern', { body, timeout })
    if (error) throw await functionError(error, failure, 'tricot')
    if (!data || !valid(data)) throw new AppError(failure)
    return data
  }

  /** Identifiant de la personne connectée (refus sinon, comme la base). */
  async function requireUserId(): Promise<string> {
    const { data: session } = await db.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) throw toAppError({ code: '42501' })
    return userId
  }

  /** Nouveau fichier dans le dossier de la personne connectée : « <uid>/<uuid>.<ext> ». */
  const newUserPath = async (ext: string) => `${await requireUserId()}/${crypto.randomUUID()}.${ext}`

  /** Envoie une image JPEG puis enregistre sa ligne ; si la ligne échoue, l'image envoyée est retirée. */
  async function uploadWithRow(bucket: string, image: Blob, failures: { upload: string; insert: string }, insert: (path: string) => PromiseLike<{ error: unknown }>): Promise<void> {
    const path = await newUserPath('jpg')
    const { error: uploadError } = await db.storage.from(bucket).upload(path, image, { contentType: 'image/jpeg' })
    if (uploadError) throw new AppError(failures.upload)
    const { error } = await insert(path)
    if (error) {
      await db.storage.from(bucket).remove([path])
      throw toAppError(error, failures.insert)
    }
  }

  /** Envoie le PDF d'un patron dans le dossier de la personne connectée ; renvoie son chemin. */
  async function uploadPdf(pdf: File): Promise<string> {
    checkPdf(pdf)
    const path = await newUserPath('pdf')
    const { error } = await db.storage.from(PATTERN_BUCKET).upload(path, pdf, { contentType: 'application/pdf' })
    if (error) throw new AppError('Impossible d’envoyer le PDF.')
    return path
  }

  async function downloadFrom(bucket: string, path: string, failure: string): Promise<Blob> {
    const { data, error } = await db.storage.from(bucket).download(path)
    if (error) throw new AppError(failure)
    return data
  }

  return { db, invokeKnit, requireUserId, uploadWithRow, uploadPdf, downloadFrom }
}
