// Notes du projet et photos d'avancement (bucket knit-photos).

import { AppError, toAppError } from '@/api/errors'
import type { ProgressPhoto, ProjectProgress } from '../lib/progress'
import { PROGRESS_BUCKET, SIGNED_URL_TTL_SECONDS, type KnitContext } from './shared'

export function progressApi({ db, uploadWithRow }: KnitContext) {
  return {
    /** Notes du projet et photos d'avancement (les plus récentes d'abord). */
    async getProgress(projectId: string): Promise<ProjectProgress> {
      const [project, photos] = await Promise.all([
        db.from('knit_projects').select('notes').eq('id', projectId).single(),
        db.from('knit_progress_photos').select('id, storage_path, caption, step_id, taken_at').eq('project_id', projectId).order('taken_at', { ascending: false }),
      ])
      if (project.error || photos.error) throw toAppError(project.error ?? photos.error, 'Impossible de charger les notes et photos.')
      return {
        notes: project.data.notes,
        photos: photos.data.map((p) => ({ id: p.id, storagePath: p.storage_path, caption: p.caption, stepId: p.step_id, takenAt: p.taken_at })),
      }
    },

    async saveProjectNotes(projectId: string, notes: string): Promise<void> {
      const { error } = await db.from('knit_projects').update({ notes }).eq('id', projectId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer les notes.')
    },

    /** Photo d'avancement (déjà réduite, en JPEG), rattachée à l'étape en cours. */
    async addProgressPhoto(projectId: string, image: Blob, input: { stepId: string | null; caption: string }): Promise<void> {
      await uploadWithRow(PROGRESS_BUCKET, image, { upload: 'Impossible d’envoyer la photo.', insert: 'Impossible d’enregistrer la photo.' }, (path) =>
        db.from('knit_progress_photos').insert({ project_id: projectId, step_id: input.stepId, storage_path: path, caption: input.caption }),
      )
    },

    async saveCaption(photoId: string, caption: string): Promise<void> {
      const { error } = await db.from('knit_progress_photos').update({ caption }).eq('id', photoId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la légende.')
    },

    async deleteProgressPhoto(photo: Pick<ProgressPhoto, 'id' | 'storagePath'>): Promise<void> {
      const { error } = await db.from('knit_progress_photos').delete().eq('id', photo.id)
      if (error) throw toAppError(error, 'Impossible de supprimer la photo.')
      // Un fichier qui resterait est supprimé par le ménage de nuit.
      await db.storage.from(PROGRESS_BUCKET).remove([photo.storagePath])
    },

    /** URL temporaires des photos du bucket knit-photos : photos d'avancement et photos des patrons. */
    async progressPhotoUrls(paths: string[]): Promise<Record<string, string>> {
      const { data, error } = await db.storage.from(PROGRESS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible de charger les photos.')
      return Object.fromEntries(data.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl]] : [])))
    },
  }
}
