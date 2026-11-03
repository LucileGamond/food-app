// Module Tricot : projets (patron + taille), étapes et avancée. Chacun ne voit que ses projets.

import { AppError, functionError, toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import type { AppSupabaseClient } from '@/lib/supabase'
import { MAX_PDF_BYTES, type KnitProject, type KnitProjectSummary, type KnitStep, type PatternStep, type ReadPattern, sanitizeSections } from './lib/pattern'

export const PATTERN_BUCKET = 'knit-patterns'
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

export function createKnittingApi(db: AppSupabaseClient) {
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
        .select('id, title, size, pdf_path, knit_steps(id, position, title, instructions, total_rows, stitches, sections, row_count, notes, done)')
        .eq('id', id)
        .order('position', { referencedTable: 'knit_steps' })
        .maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger le projet.')
      if (!data) return null
      return { id: data.id, title: data.title, size: data.size, pdfPath: data.pdf_path, steps: data.knit_steps.map(toStep) }
    },

    /** Lit le patron (PDF) pour la taille choisie, sans rien enregistrer. */
    async readPattern(pdf: File, size: string): Promise<ReadPattern> {
      checkPdf(pdf)
      const { data, error } = await db.functions.invoke<ReadPattern>('knit-pattern', { body: { pdf: await fileToBase64(pdf), size }, timeout: READ_TIMEOUT_MS })
      if (error) throw await functionError(error, 'La lecture du patron a échoué.', 'tricot')
      if (!data || !Array.isArray(data.steps)) throw new AppError('La lecture du patron a échoué.')
      return data
    },

    /** Enregistre le projet, ses étapes et le PDF d'origine. */
    async createProject(input: { title: string; size: string; pdf: File | null; steps: PatternStep[] }): Promise<string> {
      let path: string | null = null
      if (input.pdf) {
        checkPdf(input.pdf)
        const { data: session } = await db.auth.getSession()
        const userId = session.session?.user.id
        if (!userId) throw toAppError({ code: '42501' })
        path = `${userId}/${crypto.randomUUID()}.pdf`
        const { error } = await db.storage.from(PATTERN_BUCKET).upload(path, input.pdf, { contentType: 'application/pdf' })
        if (error) throw new AppError('Impossible d’envoyer le PDF.')
      }
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
      })
      if (error) {
        if (path) await db.storage.from(PATTERN_BUCKET).remove([path])
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

export type KnittingApi = ReturnType<typeof createKnittingApi>
