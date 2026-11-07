// Module Tricot : projets (patron + taille), étapes et avancée. Chacun ne voit que ses projets.

import { AppError, functionError, toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import type { AppSupabaseClient } from '@/api/client'
import { compressForReading } from '@/lib/image'
import { describeYarn, yarnFromJson, yarnMeters, yarnsFromJson, type Gauge, type QueueInput, type QueuedPattern, type QueuePriority, type StashItem, type Yarn, type YarnIdea } from './lib/yarn'
import { MAX_PDF_BYTES, type KnitProject, type KnitProjectSummary, type KnitStep, type PatternStep, type ReadPattern, sanitizeSections } from './lib/pattern'

const PATTERN_BUCKET = 'knit-patterns'
/** Lecture d'un long patron : jusqu'à 2 minutes côté modèle. */
const READ_TIMEOUT_MS = 150_000
const SIGNED_URL_TTL_SECONDS = 60 * 60

export type StepProgress = Partial<Pick<KnitStep, 'rowCount' | 'notes' | 'done' | 'sections'>>

/** Contenu du fichier en base64. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  // Par morceaux : String.fromCharCode refuse des dizaines de millions d'arguments.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function checkPdf(file: File): void {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new AppError('Choisis un fichier PDF.')
  if (file.size > MAX_PDF_BYTES) throw new AppError('PDF trop lourd (20 Mo au plus).')
}

interface StepRow {
  id: string
  position: number
  title: string
  instructions: string
  total_rows: number | null
  stitches: number | null
  sections: unknown
  row_count: number
  notes: string
  done: boolean
}

function toStep(row: StepRow): KnitStep {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    instructions: row.instructions,
    totalRows: row.total_rows,
    stitches: row.stitches,
    sections: sanitizeSections(row.sections),
    rowCount: row.row_count,
    notes: row.notes,
    done: row.done,
  }
}

const QUEUE_COLUMNS = 'id, title, pdf_path, url, size, yarn_idea, notes, priority, created_at, meters_needed, needle_mm'

interface QueueRow {
  id: string
  title: string
  pdf_path: string | null
  url: string | null
  size: string | null
  yarn_idea: string
  notes: string
  priority: number
  created_at: string
  meters_needed: number | null
  needle_mm: number | null
}

function toQueued(r: QueueRow): QueuedPattern {
  return {
    id: r.id,
    title: r.title,
    pdfPath: r.pdf_path,
    url: r.url,
    size: r.size,
    yarnIdea: r.yarn_idea,
    notes: r.notes,
    priority: r.priority as QueuePriority,
    createdAt: r.created_at,
    metersNeeded: r.meters_needed,
    needleMm: r.needle_mm,
  }
}

export function createKnittingApi(db: AppSupabaseClient) {
  /** Appelle la fonction knit-pattern (lecture par le modèle) ; `valid` vérifie la forme de la réponse. */
  async function invokeKnit<T>(body: Record<string, unknown>, failure: string, valid: (data: T) => boolean, timeout = 60_000): Promise<T> {
    const { data, error } = await db.functions.invoke<T>('knit-pattern', { body, timeout })
    if (error) throw await functionError(error, failure, 'tricot')
    if (!data || !valid(data)) throw new AppError(failure)
    return data
  }

  /** Envoie le PDF d'un patron dans le dossier de la personne connectée ; renvoie son chemin. */
  async function uploadPdf(pdf: File): Promise<string> {
    checkPdf(pdf)
    const { data: session } = await db.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) throw toAppError({ code: '42501' })
    const path = `${userId}/${crypto.randomUUID()}.pdf`
    const { error } = await db.storage.from(PATTERN_BUCKET).upload(path, pdf, { contentType: 'application/pdf' })
    if (error) throw new AppError('Impossible d’envoyer le PDF.')
    return path
  }

  return {
    async listProjects(): Promise<KnitProjectSummary[]> {
      const { data, error } = await db.from('knit_projects').select('id, title, size, updated_at, knit_steps(done)').order('updated_at', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les projets.')
      return data.map((p) => ({
        id: p.id,
        title: p.title,
        size: p.size,
        updatedAt: p.updated_at,
        stepsDone: p.knit_steps.filter((s) => s.done).length,
        stepsTotal: p.knit_steps.length,
      }))
    },

    async getProject(id: string): Promise<KnitProject | null> {
      const { data, error } = await db
        .from('knit_projects')
        .select(
          'id, title, size, pdf_path, yarns, pattern_gauge_stitches, pattern_gauge_rows, my_gauge_stitches, my_gauge_rows, knit_steps(id, position, title, instructions, total_rows, stitches, sections, row_count, notes, done)',
        )
        .eq('id', id)
        .order('position', { referencedTable: 'knit_steps' })
        .maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger le projet.')
      if (!data) return null
      return {
        id: data.id,
        title: data.title,
        size: data.size,
        pdfPath: data.pdf_path,
        steps: data.knit_steps.map(toStep),
        yarns: yarnsFromJson(data.yarns),
        patternGauge: { stitches: data.pattern_gauge_stitches, rows: data.pattern_gauge_rows },
        myGauge: { stitches: data.my_gauge_stitches, rows: data.my_gauge_rows },
      }
    },

    /** Lit le patron (PDF) pour la taille choisie, sans rien enregistrer. */
    async readPattern(pdf: File, size: string): Promise<ReadPattern> {
      checkPdf(pdf)
      return invokeKnit<ReadPattern>({ pdf: await fileToBase64(pdf), size }, 'La lecture du patron a échoué.', (d) => Array.isArray(d.steps), READ_TIMEOUT_MS)
    },

    /**
     * Enregistre le projet, ses étapes, l'échantillon du patron et le PDF d'origine. Depuis un patron en attente
     * (`queued`) : son PDF déjà envoyé est repris, et il quitte la liste.
     */
    async createProject(input: {
      title: string
      size: string
      pdf: File | null
      steps: PatternStep[]
      gauge?: Gauge | null
      queued?: Pick<QueuedPattern, 'id' | 'pdfPath'> | null
    }): Promise<string> {
      // PDF du patron en attente déjà envoyé ; sinon celui choisi, envoyé maintenant.
      const reused = input.queued?.pdfPath ?? null
      const uploaded = !reused && input.pdf ? await uploadPdf(input.pdf) : null
      const path = reused ?? uploaded
      const { data, error } = await db.rpc('create_knit_project', {
        p_title: input.title,
        p_size: input.size,
        // Sans PDF : null (les types générés ne connaissent pas les paramètres facultatifs sans valeur par défaut).
        p_pdf_path: path as string,
        p_steps: input.steps.map((s) => ({
          title: s.title,
          instructions: s.instructions,
          total_rows: s.totalRows,
          stitches: s.stitches,
          sections: s.sections as unknown as Json,
        })),
        // Facultatifs : null (voir p_pdf_path).
        p_pattern_gauge_stitches: (input.gauge?.stitches ?? null) as number,
        p_pattern_gauge_rows: (input.gauge?.rows ?? null) as number,
        p_queue_id: (input.queued?.id ?? null) as string,
      })
      if (error) {
        if (uploaded) await db.storage.from(PATTERN_BUCKET).remove([uploaded])
        throw toAppError(error, 'Impossible d’enregistrer le projet.')
      }
      return data
    },

    async saveProgress(stepId: string, progress: StepProgress): Promise<void> {
      const { error } = await db
        .from('knit_steps')
        .update({ row_count: progress.rowCount, notes: progress.notes, done: progress.done, sections: progress.sections as unknown as NonNullable<Json> | undefined })
        .eq('id', stepId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer l’avancée.')
    },

    /** Laines et échantillons du projet. */
    async saveProjectInfo(id: string, info: { yarns: Yarn[]; patternGauge: Gauge; myGauge: Gauge }): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({
          yarns: info.yarns as unknown as Json[],
          pattern_gauge_stitches: info.patternGauge.stitches,
          pattern_gauge_rows: info.patternGauge.rows,
          my_gauge_stitches: info.myGauge.stitches,
          my_gauge_rows: info.myGauge.rows,
        })
        .eq('id', id)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la laine et l’échantillon.')
    },

    /** Lit l'étiquette d'une pelote en photo, sans rien enregistrer. */
    async readYarnLabel(photo: File): Promise<Yarn> {
      const image = await compressForReading(photo)
      const read = await invokeKnit<Omit<Yarn, 'skeins'>>(
        { label: await fileToBase64(image), media_type: image.type || 'image/jpeg' },
        'La lecture de l’étiquette a échoué.',
        (d) => typeof d === 'object',
      )
      return { ...read, skeins: null }
    },

    async listQueue(): Promise<QueuedPattern[]> {
      const { data, error } = await db.from('knit_queue').select(QUEUE_COLUMNS).order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger les patrons en attente.')
      return data.map(toQueued)
    },

    async getQueued(id: string): Promise<QueuedPattern | null> {
      const { data, error } = await db.from('knit_queue').select(QUEUE_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger le patron.')
      return data && toQueued(data)
    },

    /** Met un patron de côté (PDF envoyé dans le dossier de la personne). */
    async addToQueue(input: QueueInput): Promise<string> {
      const path = input.pdf ? await uploadPdf(input.pdf) : null
      const { data, error } = await db
        .from('knit_queue')
        .insert({
          title: input.title,
          pdf_path: path,
          url: input.url,
          size: input.size,
          yarn_idea: input.yarnIdea,
          notes: input.notes,
          priority: input.priority,
          meters_needed: input.metersNeeded,
          needle_mm: input.needleMm,
        })
        .select('id')
        .single()
      if (error) {
        if (path) await db.storage.from(PATTERN_BUCKET).remove([path])
        throw toAppError(error, 'Impossible d’enregistrer le patron.')
      }
      return data.id
    },

    async deleteQueued(item: Pick<QueuedPattern, 'id' | 'pdfPath'>): Promise<void> {
      const { error } = await db.from('knit_queue').delete().eq('id', item.id)
      if (error) throw toAppError(error, 'Impossible de retirer le patron.')
      if (item.pdfPath) await db.storage.from(PATTERN_BUCKET).remove([item.pdfPath])
    },

    async listStash(): Promise<StashItem[]> {
      const { data, error } = await db.from('knit_stash').select('id, yarn, notes, created_at').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger le stock de laine.')
      return data.map((r) => ({ id: r.id, yarn: yarnFromJson(r.yarn), notes: r.notes, createdAt: r.created_at }))
    },

    /** Ajoute (sans `id`) ou modifie une laine du stock. */
    async saveStashItem(input: { id: string | null; yarn: Yarn; notes: string }): Promise<void> {
      const yarn = Object.fromEntries(Object.entries(input.yarn).filter(([, v]) => v !== null)) as unknown as NonNullable<Json>
      const { error } = input.id
        ? await db.from('knit_stash').update({ yarn, notes: input.notes, updated_at: new Date().toISOString() }).eq('id', input.id)
        : await db.from('knit_stash').insert({ yarn, notes: input.notes })
      if (error) throw toAppError(error, 'Impossible d’enregistrer la laine.')
    },

    async deleteStashItem(id: string): Promise<void> {
      const { error } = await db.from('knit_stash').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de retirer la laine.')
    },

    /** Idées de modèles pour une laine (aucun patron mis de côté ne convient). */
    async yarnIdeas(yarn: Yarn): Promise<YarnIdea[]> {
      const { ideas } = await invokeKnit<{ ideas: YarnIdea[] }>(
        { ideas: { yarn: describeYarn(yarn), meters: yarnMeters(yarn), needle_mm: yarn.needle_mm } },
        'La recherche d’idées a échoué.',
        (d) => Array.isArray(d.ideas),
      )
      return ideas
    },

    /** PDF d'un patron en attente, pour le lire au moment de commencer. */
    async downloadPdf(path: string, name: string): Promise<File> {
      const { data, error } = await db.storage.from(PATTERN_BUCKET).download(path)
      if (error) throw new AppError('Impossible de récupérer le PDF du patron.')
      return new File([data], `${name}.pdf`, { type: 'application/pdf' })
    },

    async deleteProject(project: Pick<KnitProject, 'id' | 'pdfPath'>): Promise<void> {
      const { error } = await db.from('knit_projects').delete().eq('id', project.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le projet.')
      if (project.pdfPath) await db.storage.from(PATTERN_BUCKET).remove([project.pdfPath])
    },

    /** Adresse temporaire du PDF d'origine. */
    async pdfUrl(path: string): Promise<string> {
      const { data, error } = await db.storage.from(PATTERN_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible d’ouvrir le PDF.')
      return data.signedUrl
    },
  }
}
