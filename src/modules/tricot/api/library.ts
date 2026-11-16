// Bibliothèque de patrons : fiches, PDF (bucket knit-patterns), photos (bucket knit-photos), lectures gardées.

import { AppError, toAppError } from '@/api/errors'
import { patternFilesToRemove, patternLinkFromResponse, placePhotos, type KnitPattern, type PatternFields, type PatternFiles, type PatternLink, type PatternLinkResponse } from '../lib/library'
import { readingFromJson, type StoredReading } from '../lib/readings'
import { PATTERN_BUCKET, PROGRESS_BUCKET, SIGNED_URL_TTL_SECONDS, type KnitContext } from './shared'

/** Patron de la bibliothèque, avec ses projets (les plus récents d'abord). */
const PATTERN_COLUMNS = 'id, title, pdf_path, photos, url, size, yarn_idea, notes, meters_needed, needle_mm, tags, created_at, knit_projects(id, title, size, updated_at), knit_pattern_readings(size_index, size_label)'

interface PatternRow {
  id: string
  title: string
  pdf_path: string | null
  photos: string[]
  url: string | null
  size: string | null
  yarn_idea: string
  notes: string
  meters_needed: number | null
  needle_mm: number | null
  tags: string[]
  created_at: string
  knit_projects: { id: string; title: string; size: string; updated_at: string }[]
  knit_pattern_readings: { size_index: number | null; size_label: string }[]
}

function toPattern(r: PatternRow): KnitPattern {
  return {
    id: r.id,
    title: r.title,
    pdfPath: r.pdf_path,
    photos: r.photos,
    url: r.url,
    size: r.size,
    yarnIdea: r.yarn_idea,
    notes: r.notes,
    metersNeeded: r.meters_needed,
    needleMm: r.needle_mm,
    tags: r.tags,
    createdAt: r.created_at,
    projects: r.knit_projects.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at)).map((p) => ({ id: p.id, title: p.title, size: p.size })),
    readSizes: r.knit_pattern_readings.toSorted((a, b) => (a.size_index ?? -1) - (b.size_index ?? -1)).map((reading) => reading.size_label),
  }
}

function toPatternColumns(fields: PatternFields) {
  return {
    title: fields.title,
    url: fields.url,
    size: fields.size,
    yarn_idea: fields.yarnIdea,
    notes: fields.notes,
    meters_needed: fields.metersNeeded,
    needle_mm: fields.needleMm,
    tags: fields.tags,
  }
}

export function libraryApi({ db, invokeKnit, requireUserId, uploadPdf, downloadFrom }: KnitContext) {
  /** Envoie des photos de patron (déjà réduites, en JPEG) ; renvoie leurs chemins. Rien ne reste si l'une échoue. */
  async function uploadPatternPhotos(photos: Blob[]): Promise<string[]> {
    if (photos.length === 0) return []
    const userId = await requireUserId()
    const paths = photos.map(() => `${userId}/${crypto.randomUUID()}.jpg`)
    const results = await Promise.all(photos.map((photo, i) => db.storage.from(PROGRESS_BUCKET).upload(paths[i]!, photo, { contentType: 'image/jpeg' })))
    if (results.some((r) => r.error)) {
      await db.storage.from(PROGRESS_BUCKET).remove(paths)
      throw new AppError('Impossible d’envoyer les photos.')
    }
    return paths
  }

  /**
   * Un PDF de patron peut-il être supprimé ? Relu en base au moment de supprimer : un projet a pu être commencé d'après
   * ce patron depuis l'ouverture de la fiche (autre onglet, autre appareil). Dans le doute, il est gardé (ménage de nuit).
   */
  async function pdfUnused(path: string): Promise<boolean> {
    const { count, error } = await db.from('knit_projects').select('id', { count: 'exact', head: true }).eq('pdf_path', path)
    return !error && count === 0
  }

  return {
    /** Bibliothèque de patrons (triée par l'écran). */
    async listPatterns(): Promise<KnitPattern[]> {
      const { data, error } = await db.from('knit_patterns').select(PATTERN_COLUMNS).order('created_at', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les patrons.')
      return data.map(toPattern)
    },

    /** Lectures gardées d'un patron (une par taille) ; les lectures abîmées sont écartées. */
    async listReadings(patternId: string): Promise<StoredReading[]> {
      const { data, error } = await db.from('knit_pattern_readings').select('size_index, size_label, reading, read_at').eq('pattern_id', patternId).order('read_at', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les lectures du patron.')
      return data.flatMap((r) => {
        const reading = readingFromJson(r.reading)
        return reading ? [{ sizeIndex: r.size_index, sizeLabel: r.size_label, readAt: r.read_at, reading }] : []
      })
    },

    async getPattern(id: string): Promise<KnitPattern | null> {
      const { data, error } = await db.from('knit_patterns').select(PATTERN_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger le patron.')
      return data && toPattern(data)
    },

    /**
     * Ajoute un patron (`existing` null) ou le modifie : les nouveaux fichiers sont envoyés, ceux retirés supprimés.
     * Le PDF d'un patron déjà commencé n'est pas supprimé ici (ses projets le lisent) : le ménage de nuit s'en charge.
     */
    async savePattern(fields: PatternFields, files: PatternFiles, existing: Pick<KnitPattern, 'id' | 'pdfPath' | 'photos' | 'projects'> | null): Promise<string> {
      const newPdf = files.newPdf ? await uploadPdf(files.newPdf) : null
      let newPhotos: string[]
      try {
        newPhotos = await uploadPatternPhotos(files.photos.filter((p): p is Blob => typeof p !== 'string'))
      } catch (e) {
        if (newPdf) await db.storage.from(PATTERN_BUCKET).remove([newPdf])
        throw e
      }
      const row = { ...toPatternColumns(fields), pdf_path: newPdf ?? files.pdfPath, photos: placePhotos(files.photos, newPhotos) }
      const { data, error } = existing
        ? await db.from('knit_patterns').update(row).eq('id', existing.id).select('id').single()
        : await db.from('knit_patterns').insert(row).select('id').single()
      if (error) {
        if (newPdf) await db.storage.from(PATTERN_BUCKET).remove([newPdf])
        if (newPhotos.length) await db.storage.from(PROGRESS_BUCKET).remove(newPhotos)
        throw toAppError(error, 'Impossible d’enregistrer le patron.')
      }
      if (existing) {
        const removed = patternFilesToRemove(existing, { pdfPath: row.pdf_path, photos: row.photos })
        if (removed.photos.length) await db.storage.from(PROGRESS_BUCKET).remove(removed.photos)
        if (removed.pdf && (await pdfUnused(removed.pdf))) await db.storage.from(PATTERN_BUCKET).remove([removed.pdf])
      }
      return data.id
    },

    /** Supprime un patron ; ses projets restent (avec leur PDF), seuls ses fichiers inutilisés sont supprimés. */
    async deletePattern(pattern: Pick<KnitPattern, 'id' | 'pdfPath' | 'photos' | 'projects'>): Promise<void> {
      const { error } = await db.from('knit_patterns').delete().eq('id', pattern.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le patron.')
      if (pattern.photos.length) await db.storage.from(PROGRESS_BUCKET).remove(pattern.photos)
      if (pattern.pdfPath && pattern.projects.length === 0 && (await pdfUnused(pattern.pdfPath))) await db.storage.from(PATTERN_BUCKET).remove([pattern.pdfPath])
    },

    /** Patron ajouté par un lien : PDF (le lien lui-même, ou trouvé dans la page), nom et image de la page, sans le modèle. */
    async readPatternLink(url: string): Promise<PatternLink> {
      return patternLinkFromResponse(await invokeKnit<PatternLinkResponse>({ link: { url } }, 'Impossible de lire ce lien.', (d) => typeof d.url === 'string'))
    },

    /** PDF d'un patron de la bibliothèque (lecture par l'IA, diagrammes, lecteur). */
    async downloadPdf(path: string, name: string): Promise<File> {
      const data = await downloadFrom(PATTERN_BUCKET, path, 'Impossible de récupérer le PDF du patron.')
      return new File([data], `${name}.pdf`, { type: 'application/pdf' })
    },

    /** Adresse temporaire du PDF d'origine. */
    async pdfUrl(path: string): Promise<string> {
      const { data, error } = await db.storage.from(PATTERN_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible d’ouvrir le PDF.')
      return data.signedUrl
    },
  }
}
