// Module Tricot : projets (patron + taille), étapes et avancée. Chacun ne voit que ses projets.

import { AppError, functionError, toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import type { AppSupabaseClient } from '@/api/client'
import { compressForReading } from '@/lib/image'
import type { ProgressPhoto, ProjectProgress } from './lib/progress'
import { describeYarn, yarnFromJson, yarnMeters, yarnsFromJson, type Gauge, type QueueInput, type QueuedPattern, type QueuePriority, type StashItem, type Yarn, type YarnIdea } from './lib/yarn'
import { sanitizeHighlights } from './lib/sizes'
import { readTimes } from './lib/passes'
import { adaptationToJson, sanitizeAdaptation, type Adaptation, type AdaptedStep } from './lib/adapt'
import { sanitizeAbbreviations, type Abbreviation, type BaseGlossary } from './lib/glossary'
import { sanitizeYarnChecks, type YarnCheck } from './lib/yarnLeft'
import { sanitizeSizeChart, type MeasureProfile } from './lib/sizing'
import { sanitizeHints, sanitizeSetup, type ChartHint, type ChartSetup, type KnitChart } from './lib/chart'
import { MAX_PDF_BYTES, type KnitProject, type KnitProjectSummary, type KnitStep, type PatternStep, type ReadPattern, sanitizeSections } from './lib/pattern'

const PATTERN_BUCKET = 'knit-patterns'
const CHART_BUCKET = 'knit-charts'
/** Lecture d'un long patron : jusqu'à 2 minutes côté modèle. */
const READ_TIMEOUT_MS = 150_000
const SIGNED_URL_TTL_SECONDS = 60 * 60
/** Photos d'avancement : dossier par personne (<uid>/<uuid>.jpg). */
const PROGRESS_BUCKET = 'knit-photos'

export type StepProgress = Partial<Pick<KnitStep, 'rowCount' | 'times' | 'pass' | 'notes' | 'done' | 'sections' | 'highlights' | 'translation'>>

/** Contenu du fichier en base64. */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  // Par morceaux : String.fromCharCode refuse des dizaines de millions d'arguments.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

interface ChartRow {
  id: string
  step_id: string | null
  title: string
  image_path: string
  grid_top: number
  grid_bottom: number
  rows: number
  start_row: number
  repeats: boolean
  flat: boolean
  odd_only: boolean
}

const CHART_COLUMNS = 'id, step_id, title, image_path, grid_top, grid_bottom, rows, start_row, repeats, flat, odd_only, created_at'

function chartColumns(setup: ChartSetup) {
  return {
    step_id: setup.stepId,
    title: setup.title,
    grid_top: setup.gridTop,
    grid_bottom: setup.gridBottom,
    rows: setup.rows,
    start_row: setup.startRow,
    repeats: setup.repeats,
    flat: setup.flat,
    odd_only: setup.flat && setup.oddOnly,
  }
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
  times: number
  pass: number
  notes: string
  done: boolean
  highlights: unknown
  translation: string | null
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
    times: row.times,
    pass: row.pass,
    notes: row.notes,
    done: row.done,
    highlights: sanitizeHighlights(row.highlights),
    translation: row.translation,
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

  /** Diagrammes lus en base, avec l'adresse temporaire de leur image (null si elle n'a pas pu être obtenue). */
  async function signCharts(rows: ChartRow[]): Promise<KnitChart[]> {
    if (rows.length === 0) return []
    const { data } = await db.storage.from(CHART_BUCKET).createSignedUrls(
      rows.map((r) => r.image_path),
      SIGNED_URL_TTL_SECONDS,
    )
    const urls = new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])))
    return rows.map((r) => ({
      id: r.id,
      stepId: r.step_id,
      title: r.title,
      imagePath: r.image_path,
      imageUrl: urls.get(r.image_path) ?? null,
      repeats: r.repeats,
      flat: r.flat,
      oddOnly: r.flat && r.odd_only,
      ...sanitizeSetup(r),
    }))
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

    /** Glossaire des abréviations classiques, par langue des patrons. */
    async getGlossary(): Promise<BaseGlossary> {
      const { data, error } = await db.from('knit_glossary').select('lang, abbr, meaning').order('abbr')
      if (error) throw toAppError(error, 'Impossible de charger le glossaire.')
      const of = (lang: string) => sanitizeAbbreviations(data.filter((a) => a.lang === lang))
      return { fr: of('fr'), en: of('en') }
    },

    async getProject(id: string): Promise<KnitProject | null> {
      const { data, error } = await db
        .from('knit_projects')
        .select(
          `id, title, size, sizes, size_index, pdf_path, chart_hints, abbreviations, yarn_checks, yarns, pattern_gauge_stitches, pattern_gauge_rows, my_gauge_stitches, my_gauge_rows, adaptation, knit_steps(id, position, title, instructions, total_rows, stitches, sections, row_count, times, pass, notes, done, highlights, translation), knit_charts(${CHART_COLUMNS})`,
        )
        .eq('id', id)
        .order('position', { referencedTable: 'knit_steps' })
        .order('created_at', { referencedTable: 'knit_charts' })
        .maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger le projet.')
      if (!data) return null
      return {
        id: data.id,
        title: data.title,
        size: data.size,
        sizes: data.sizes,
        // Une donnée abîmée ne fait que retirer la mise en valeur.
        sizeIndex: data.size_index !== null && data.size_index < data.sizes.length ? data.size_index : null,
        pdfPath: data.pdf_path,
        steps: data.knit_steps.map(toStep),
        charts: await signCharts(data.knit_charts),
        chartHints: sanitizeHints(data.chart_hints),
        abbreviations: sanitizeAbbreviations(data.abbreviations),
        yarnChecks: sanitizeYarnChecks(data.yarn_checks),
        yarns: yarnsFromJson(data.yarns),
        patternGauge: { stitches: data.pattern_gauge_stitches, rows: data.pattern_gauge_rows },
        myGauge: { stitches: data.my_gauge_stitches, rows: data.my_gauge_rows },
        adaptation: sanitizeAdaptation(data.adaptation),
      }
    },

    /** Lit le patron (PDF) pour la taille choisie, sans rien enregistrer. */
    async readPattern(pdf: File, size: string): Promise<ReadPattern> {
      checkPdf(pdf)
      const read = await invokeKnit<ReadPattern>({ pdf: await fileToBase64(pdf), size }, 'La lecture du patron a échoué.', (d) => Array.isArray(d.steps), READ_TIMEOUT_MS)
      return { ...read, steps: read.steps.map((s) => ({ ...s, times: readTimes(s.times) })), sizeChart: sanitizeSizeChart(read.sizeChart, read.sizes.length) }
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
      /** Diagrammes repérés à la lecture, gardés pour les proposer plus tard. */
      chartHints?: ChartHint[]
      /** Tailles du patron et celle à mettre en valeur dans le texte des étapes. */
      sizes?: string[]
      sizeIndex?: number | null
      /** Abréviations expliquées par le patron. */
      abbreviations?: Abbreviation[]
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
          times: readTimes(s.times),
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
      // Simple confort : un échec ici n'empêche pas de tricoter (diagrammes ajoutés à la main, texte sans mise en valeur).
      const sizes = input.sizes ?? []
      const abbreviations = input.abbreviations ?? []
      if (input.chartHints?.length || sizes.length || abbreviations.length) {
        await db
          .from('knit_projects')
          .update({
            chart_hints: (input.chartHints ?? []) as unknown as Json[],
            abbreviations: abbreviations as unknown as Json[],
            sizes,
            size_index: input.sizeIndex !== undefined && input.sizeIndex !== null && input.sizeIndex < sizes.length ? input.sizeIndex : null,
          })
          .eq('id', data)
      }
      return data
    },

    async saveProgress(stepId: string, progress: StepProgress): Promise<void> {
      const { error } = await db
        .from('knit_steps')
        .update({
          row_count: progress.rowCount,
          times: progress.times,
          pass: progress.pass,
          notes: progress.notes,
          done: progress.done,
          sections: progress.sections as unknown as NonNullable<Json> | undefined,
          highlights: progress.highlights as unknown as NonNullable<Json> | undefined,
          translation: progress.translation,
        })
        .eq('id', stepId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer l’avancée.')
    },

    /** Taille dont les nombres sont mis en valeur dans le texte des étapes (null : aucune). */
    async setSizeIndex(id: string, sizeIndex: number | null): Promise<void> {
      const { error } = await db.from('knit_projects').update({ size_index: sizeIndex }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de changer la taille mise en valeur.')
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

    /**
     * « Patron adapté à moi » : étapes recalculées pour l'échantillon et les retouches, sans rien enregistrer
     * (seulement celles qui changent).
     */
    async adaptPattern(input: { request: string; size: string; patternGauge: Gauge; myGauge: Gauge; steps: KnitStep[] }): Promise<AdaptedStep[]> {
      const { steps } = await invokeKnit<{ steps: { index: number; totalRows: number | null; stitches: number | null; sections: unknown; note: string }[] }>(
        {
          adapt: {
            request: input.request,
            size: input.size,
            pattern_gauge: input.patternGauge,
            my_gauge: input.myGauge,
            steps: input.steps.map((s) => ({ title: s.title, instructions: s.translation || s.instructions, total_rows: s.totalRows, stitches: s.stitches, sections: s.sections })),
          },
        },
        'L’adaptation du patron a échoué.',
        (d) => Array.isArray(d.steps),
        READ_TIMEOUT_MS,
      )
      return steps.flatMap((a) => {
        const step = input.steps[a.index]
        return step ? [{ stepId: step.id, totalRows: a.totalRows, stitches: a.stitches, sections: sanitizeSections(a.sections), note: a.note }] : []
      })
    },

    /** Enregistre l'adaptation (null : la supprime, le patron d'origine reste). */
    async saveAdaptation(projectId: string, adaptation: Adaptation | null): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({ adaptation: adaptation && (adaptationToJson(adaptation) as unknown as Json) })
        .eq('id', projectId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer le patron adapté.')
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

    /** Question sur le rang en cours : réponse courte du modèle, avec le texte de l'étape en contexte. */
    async askAboutStep(input: { question: string; stepTitle: string; text: string; row: number | null; size: string; abbreviations: Abbreviation[] }): Promise<string> {
      const { answer } = await invokeKnit<{ answer: string }>(
        {
          question: {
            question: input.question,
            step_title: input.stepTitle,
            text: input.text,
            row: input.row,
            size: input.size,
            abbreviations: input.abbreviations.map((a) => `${a.abbr} : ${a.meaning}`).join('\n'),
          },
        },
        'La réponse a échoué.',
        (d) => typeof d.answer === 'string',
      )
      return answer
    },

    /** Texte d'une étape traduit en français ; `numbersKept` : les nombres des tailles sont restés ceux du patron. */
    async translateText(text: string): Promise<{ text: string; numbersKept: boolean }> {
      return invokeKnit<{ text: string; numbersKept: boolean }>({ translate: { text } }, 'La traduction a échoué.', (d) => typeof d.text === 'string', READ_TIMEOUT_MS)
    },

    /** Pesées des laines du projet (la dernière de chacune). */
    async saveYarnChecks(projectId: string, checks: YarnCheck[]): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({ yarn_checks: checks.map((c) => ({ yarn: c.yarn, grams: c.grams, rows_done: c.rowsDone, at: c.at })) })
        .eq('id', projectId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la pesée.')
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

    /** Fiches de mesures (la sienne, celles des proches). */
    async listMeasures(): Promise<MeasureProfile[]> {
      const { data, error } = await db.from('knit_measures').select('id, name, chest, waist, hip, arm, head').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger les fiches de mesures.')
      return data.map(({ id, name, ...m }) => ({ id, name, measures: { chest: m.chest, waist: m.waist, hip: m.hip, arm: m.arm, head: m.head } }))
    },

    /** Ajoute (sans `id`) ou modifie une fiche de mesures. */
    async saveMeasures(input: { id: string | null; name: string; measures: MeasureProfile['measures'] }): Promise<void> {
      const row = { name: input.name.trim(), ...input.measures }
      const { error } = input.id
        ? await db.from('knit_measures').update({ ...row, updated_at: new Date().toISOString() }).eq('id', input.id)
        : await db.from('knit_measures').insert(row)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la fiche de mesures.')
    },

    async deleteMeasures(id: string): Promise<void> {
      const { error } = await db.from('knit_measures').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer la fiche de mesures.')
    },

    /** Idées de modèles pour une laine, avec de vrais patrons trouvés sur internet (aucun patron mis de côté ne convient). */
    async yarnIdeas(yarn: Yarn): Promise<YarnIdea[]> {
      const { ideas, weight } = await invokeKnit<{ ideas: Omit<YarnIdea, 'weight'>[]; weight?: string | null }>(
        { ideas: { yarn: describeYarn(yarn), meters: yarnMeters(yarn), needle_mm: yarn.needle_mm } },
        'La recherche d’idées a échoué.',
        (d) => Array.isArray(d.ideas),
        // Recherche web comprise : jusqu'à 2 minutes côté modèle.
        READ_TIMEOUT_MS,
      )
      return ideas.map((idea) => ({ ...idea, patterns: Array.isArray(idea.patterns) ? idea.patterns : [], weight: weight ?? null }))
    },

    /** PDF d'un patron en attente, pour le lire au moment de commencer. */
    async downloadPdf(path: string, name: string): Promise<File> {
      const { data, error } = await db.storage.from(PATTERN_BUCKET).download(path)
      if (error) throw new AppError('Impossible de récupérer le PDF du patron.')
      return new File([data], `${name}.pdf`, { type: 'application/pdf' })
    },

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
      const { data: session } = await db.auth.getSession()
      const userId = session.session?.user.id
      if (!userId) throw toAppError({ code: '42501' })
      const path = `${userId}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await db.storage.from(PROGRESS_BUCKET).upload(path, image, { contentType: 'image/jpeg' })
      if (uploadError) throw new AppError('Impossible d’envoyer la photo.')
      const { error } = await db.from('knit_progress_photos').insert({ project_id: projectId, step_id: input.stepId, storage_path: path, caption: input.caption })
      if (error) {
        await db.storage.from(PROGRESS_BUCKET).remove([path])
        throw toAppError(error, 'Impossible d’enregistrer la photo.')
      }
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

    /** URL temporaires des photos d'avancement. */
    async progressPhotoUrls(paths: string[]): Promise<Record<string, string>> {
      const { data, error } = await db.storage.from(PROGRESS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible de charger les photos.')
      return Object.fromEntries(data.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl]] : [])))
    },

    async deleteProject(project: Pick<KnitProject, 'id' | 'pdfPath'> & { charts?: Pick<KnitChart, 'imagePath'>[] }): Promise<void> {
      const { error } = await db.from('knit_projects').delete().eq('id', project.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le projet.')
      if (project.pdfPath) await db.storage.from(PATTERN_BUCKET).remove([project.pdfPath])
      if (project.charts?.length) await db.storage.from(CHART_BUCKET).remove(project.charts.map((c) => c.imagePath))
    },

    /** Ajoute un diagramme (image JPEG déjà préparée) au projet. */
    async addChart(projectId: string, image: Blob, setup: ChartSetup): Promise<void> {
      const { data: session } = await db.auth.getSession()
      const userId = session.session?.user.id
      if (!userId) throw toAppError({ code: '42501' })
      const path = `${userId}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await db.storage.from(CHART_BUCKET).upload(path, image, { contentType: 'image/jpeg' })
      if (uploadError) throw new AppError('Impossible d’envoyer l’image du diagramme.')
      const { error } = await db.from('knit_charts').insert({ project_id: projectId, image_path: path, ...chartColumns(setup) })
      if (error) {
        await db.storage.from(CHART_BUCKET).remove([path])
        throw toAppError(error, 'Impossible d’enregistrer le diagramme.')
      }
    },

    /** Calage, étape et titre d'un diagramme. */
    async updateChart(id: string, setup: ChartSetup): Promise<void> {
      const { error } = await db.from('knit_charts').update(chartColumns(setup)).eq('id', id)
      if (error) throw toAppError(error, 'Impossible d’enregistrer le diagramme.')
    },

    async deleteChart(chart: Pick<KnitChart, 'id' | 'imagePath'>): Promise<void> {
      const { error } = await db.from('knit_charts').delete().eq('id', chart.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le diagramme.')
      await db.storage.from(CHART_BUCKET).remove([chart.imagePath])
    },

    /** Adresse temporaire du PDF d'origine. */
    async pdfUrl(path: string): Promise<string> {
      const { data, error } = await db.storage.from(PATTERN_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible d’ouvrir le PDF.')
      return data.signedUrl
    },
  }
}
