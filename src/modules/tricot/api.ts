// Module Tricot : projets (patron + taille), étapes et avancée. Chacun ne voit que ses projets.

import { AppError, functionError, toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import type { AppSupabaseClient } from '@/api/client'
import { compressForReading } from '@/lib/image'
import type { ProgressPhoto, ProjectProgress } from './lib/progress'
import { describeYarn, yarnFromJson, yarnMeters, yarnsFromJson, type Gauge, type StashItem, type Yarn, type YarnIdea } from './lib/yarn'
import { patternLinkFromResponse, type KnitPattern, type PatternFields, type PatternFiles, type PatternLink, type PatternLinkResponse, type PatternWish } from './lib/library'
import { readingFromJson, readingKey, readSizeIndex, type StoredReading } from './lib/readings'
import { sanitizeHighlights } from './lib/sizes'
import { readTimes } from './lib/passes'
import { adaptationPaused, adaptationToJson, sanitizeAdaptation, type Adaptation, type AdaptedStep } from './lib/adapt'
import { sanitizeAbbreviations, type Abbreviation, type BaseGlossary } from './lib/glossary'
import { sanitizeYarnChecks, type YarnCheck } from './lib/yarnLeft'
import { sanitizeSizeChart, type MeasureProfile } from './lib/sizing'
import { sanitizeHints, sanitizeSetup, type ChartHint, type ChartSetup, type KnitChart } from './lib/chart'
import type { SectionsChange, Split } from './lib/organize'
import { sanitizeNeedles } from './lib/needles'
import { sanitizeGauges, type ProjectGauge } from './lib/gauges'
import { MAX_PDF_BYTES, type KnitProject, type KnitProjectSummary, type KnitStep, type PatternStep, type ReadPattern, type StepSection, readMissingParts, sanitizeSections } from './lib/pattern'

const PATTERN_BUCKET = 'knit-patterns'
const CHART_BUCKET = 'knit-charts'
/** Lecture d'un long patron : jusqu'à 2 minutes côté modèle. */
const READ_TIMEOUT_MS = 150_000
const SIGNED_URL_TTL_SECONDS = 60 * 60
/** Photos d'avancement et photos des patrons : dossier par personne (<uid>/<uuid>.jpg). */
const PROGRESS_BUCKET = 'knit-photos'

export type StepProgress = Partial<Pick<KnitStep, 'rowCount' | 'times' | 'pass' | 'notes' | 'done' | 'sections' | 'highlights' | 'translation' | 'startStitches'>>

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
  end_row: number | null
  section_id: string | null
  repeats: boolean
  flat: boolean
  odd_only: boolean
}

const CHART_COLUMNS = 'id, step_id, title, image_path, grid_top, grid_bottom, rows, start_row, end_row, section_id, repeats, flat, odd_only, created_at'

function chartColumns(setup: ChartSetup) {
  return {
    step_id: setup.stepId,
    title: setup.title,
    grid_top: setup.gridTop,
    grid_bottom: setup.gridBottom,
    rows: setup.rows,
    start_row: setup.startRow,
    end_row: setup.endRow ?? null,
    section_id: setup.sectionId ?? null,
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
  start_stitches?: number | null
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
    startStitches: row.start_stitches ?? null,
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

/** Patron de la bibliothèque, avec ses projets (les plus récents d'abord). */
const PATTERN_COLUMNS = 'id, title, pdf_path, photos, url, size, yarn_idea, notes, meters_needed, needle_mm, wish, created_at, knit_projects(id, title, size, updated_at), knit_pattern_readings(size_index, size_label)'

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
  wish: number | null
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
    wish: r.wish as PatternWish | null,
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
    wish: fields.wish,
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

  /** Envoie des photos de patron (déjà réduites, en JPEG) ; renvoie leurs chemins. Rien ne reste si l'une échoue. */
  async function uploadPatternPhotos(photos: Blob[]): Promise<string[]> {
    if (photos.length === 0) return []
    const { data: session } = await db.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) throw toAppError({ code: '42501' })
    const paths = photos.map(() => `${userId}/${crypto.randomUUID()}.jpg`)
    const results = await Promise.all(photos.map((photo, i) => db.storage.from(PROGRESS_BUCKET).upload(paths[i]!, photo, { contentType: 'image/jpeg' })))
    if (results.some((r) => r.error)) {
      await db.storage.from(PROGRESS_BUCKET).remove(paths)
      throw new AppError('Impossible d’envoyer les photos.')
    }
    return paths
  }

  /**
   * Garde la lecture du patron d'un projet, pour sa taille : un prochain projet dans cette taille la reprendra sans
   * relire. Simple confort : un échec ne gêne pas le projet (il faudra seulement relire la prochaine fois).
   */
  async function keepReading(projectId: string, read: ReadPattern): Promise<void> {
    const key = readingKey(read)
    if (!key) return
    const { data } = await db.from('knit_projects').select('pattern_id').eq('id', projectId).maybeSingle()
    if (!data?.pattern_id) return
    await db.from('knit_pattern_readings').upsert(
      { pattern_id: data.pattern_id, size_index: key.sizeIndex, size_label: key.sizeLabel, reading: read as unknown as NonNullable<Json>, read_at: new Date().toISOString() },
      { onConflict: 'pattern_id,size_index' },
    )
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
      const { data, error } = await db
        .from('knit_projects')
        .select('id, title, size, sizes, size_index, adaptation, updated_at, knit_steps(id, position, title, total_rows, row_count, times, pass, done)')
        .order('updated_at', { ascending: false })
        .order('position', { referencedTable: 'knit_steps' })
      if (error) throw toAppError(error, 'Impossible de charger les projets.')
      return data.map((p) => {
        const index = p.knit_steps.findIndex((s) => !s.done)
        const step = index === -1 ? null : p.knit_steps[index]!
        const size = (p.size_index !== null ? p.sizes[p.size_index] : undefined) ?? p.size
        // Patron adapté suivi : les rangs de l'étape sont ceux de l'adaptation
        const adaptation = sanitizeAdaptation(p.adaptation)
        const adapted = adaptation?.active && !adaptationPaused(adaptation, size) && step ? adaptation.steps.find((a) => a.stepId === step.id) : undefined
        return {
          id: p.id,
          title: p.title,
          size,
          updatedAt: p.updated_at,
          stepsDone: p.knit_steps.filter((s) => s.done).length,
          stepsTotal: p.knit_steps.length,
          current: step && { number: index + 1, title: step.title, rowCount: step.row_count, totalRows: adapted ? adapted.totalRows : step.total_rows, times: step.times, pass: step.pass },
        }
      })
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
          `id, title, size, sizes, size_index, pdf_path, chart_hints, abbreviations, yarn_checks, yarns, pattern_gauge_stitches, pattern_gauge_rows, adaptation, needles, needle_gauges, knit_steps(id, position, title, instructions, total_rows, stitches, start_stitches, sections, row_count, times, pass, notes, done, highlights, translation), knit_charts(${CHART_COLUMNS})`,
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
        adaptation: sanitizeAdaptation(data.adaptation),
        needles: sanitizeNeedles(data.needles),
        gauges: sanitizeGauges(data.needle_gauges),
      }
    },

    /** Lit le patron (PDF) pour la taille choisie, sans rien enregistrer. */
    async readPattern(pdf: File, size: string): Promise<ReadPattern> {
      checkPdf(pdf)
      const read = await invokeKnit<ReadPattern>({ pdf: await fileToBase64(pdf), size }, 'La lecture du patron a échoué.', (d) => Array.isArray(d.steps), READ_TIMEOUT_MS)
      return {
        ...read,
        sizeIndex: readSizeIndex(read, size),
        steps: read.steps.map((s) => ({ ...s, times: readTimes(s.times) })),
        sizeChart: sanitizeSizeChart(read.sizeChart, read.sizes.length),
        missingParts: readMissingParts(read.missingParts),
        needles: sanitizeNeedles(read.needles),
      }
    },

    /**
     * Enregistre le projet, ses étapes, l'échantillon du patron et le PDF d'origine. Depuis un patron de la bibliothèque
     * (`pattern`) : le projet lui est relié, et son PDF déjà envoyé (`pattern.pdfPath`) est repris. Sinon, le patron est
     * rangé dans la bibliothèque.
     */
    async createProject(input: {
      title: string
      size: string
      pdf: File | null
      steps: PatternStep[]
      gauge?: Gauge | null
      /** Patron de la bibliothèque ; `pdfPath` : son PDF, repris tel quel (null : `pdf` est envoyé). */
      pattern?: Pick<KnitPattern, 'id' | 'pdfPath'> | null
      /** Diagrammes repérés à la lecture, gardés pour les proposer plus tard. */
      chartHints?: ChartHint[]
      /** Tailles du patron et celle à mettre en valeur dans le texte des étapes. */
      sizes?: string[]
      sizeIndex?: number | null
      /** Abréviations expliquées par le patron. */
      abbreviations?: Abbreviation[]
      /** Aiguilles du patron (mm). */
      needles?: number[]
      /** Lecture faite par le modèle pour ce projet, gardée avec le patron (null : lecture déjà gardée, reprise). */
      reading?: ReadPattern | null
    }): Promise<string> {
      // PDF du patron déjà envoyé ; sinon celui choisi, envoyé maintenant.
      const reused = input.pattern?.pdfPath ?? null
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
        p_pattern_id: (input.pattern?.id ?? null) as string,
      })
      if (error) {
        if (uploaded) await db.storage.from(PATTERN_BUCKET).remove([uploaded])
        throw toAppError(error, 'Impossible d’enregistrer le projet.')
      }
      // Simple confort : un échec ici n'empêche pas de tricoter (diagrammes ajoutés à la main, texte sans mise en valeur).
      const sizes = input.sizes ?? []
      const abbreviations = input.abbreviations ?? []
      const needles = sanitizeNeedles(input.needles)
      if (input.chartHints?.length || sizes.length || abbreviations.length || needles.length) {
        await db
          .from('knit_projects')
          .update({
            chart_hints: (input.chartHints ?? []) as unknown as Json[],
            abbreviations: abbreviations as unknown as Json[],
            needles,
            sizes,
            size_index: input.sizeIndex !== undefined && input.sizeIndex !== null && input.sizeIndex < sizes.length ? input.sizeIndex : null,
          })
          .eq('id', data)
      }
      if (input.reading) await keepReading(data, input.reading)
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
          start_stitches: progress.startStitches,
        })
        .eq('id', stepId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer l’avancée.')
    },

    /** Regroupe l'étape avec la suivante, qui devient ses sous-étapes (calculées par l'application). */
    async mergeSteps(stepId: string, merged: { sections: StepSection[]; totalRows: number | null }): Promise<void> {
      const { error } = await db.rpc('merge_knit_steps', {
        p_step: stepId,
        p_sections: merged.sections as unknown as Json,
        p_total_rows: merged.totalRows as number,
      })
      if (error) throw toAppError(error, 'Impossible de regrouper les étapes.')
    },

    /** Sous-étapes de plusieurs étapes enregistrées d'un coup (sous-étape déplacée d'une étape à une autre). */
    async saveSections(changes: SectionsChange[]): Promise<void> {
      const { error } = await db.rpc('set_knit_sections', {
        p_steps: changes.map((c) => ({ id: c.id, sections: c.sections, total_rows: c.totalRows, instructions: c.instructions })) as unknown as Json,
      })
      if (error) throw toAppError(error, 'Impossible de déplacer la sous-étape.')
    },

    /** Sépare une étape : la suite devient une nouvelle étape juste après. */
    async splitStep(stepId: string, split: Split): Promise<void> {
      const { error } = await db.rpc('split_knit_step', {
        p_step: stepId,
        p_sections: split.first.sections as unknown as Json,
        p_total_rows: split.first.totalRows as number,
        p_instructions: split.first.instructions,
        p_new_title: split.second.title,
        p_new_sections: split.second.sections as unknown as Json,
        p_new_total_rows: split.second.totalRows as number,
        p_new_instructions: split.second.instructions,
      })
      if (error) throw toAppError(error, 'Impossible de séparer l’étape.')
    },

    /** Taille dont les nombres sont mis en valeur dans le texte des étapes (null : aucune). */
    /** Échantillon par aiguille et conversions vérifiées par aiguille. */
    async saveGauges(id: string, gauges: ProjectGauge[]): Promise<void> {
      const { error } = await db.from('knit_projects').update({ needle_gauges: gauges as unknown as Json[] }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible d’enregistrer l’échantillon.')
    },

    /** Aiguilles du patron (mm) : celle de chaque sous-étape se choisit parmi elles. */
    async saveNeedles(id: string, needles: number[]): Promise<void> {
      const { error } = await db.from('knit_projects').update({ needles: sanitizeNeedles(needles) }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible d’enregistrer les aiguilles.')
    },

    async setSizeIndex(id: string, sizeIndex: number | null): Promise<void> {
      const { error } = await db.from('knit_projects').update({ size_index: sizeIndex }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de changer la taille mise en valeur.')
    },

    /** Laines et échantillons du projet. */
    async saveProjectInfo(id: string, info: { yarns: Yarn[]; patternGauge: Gauge }): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({
          yarns: info.yarns as unknown as Json[],
          pattern_gauge_stitches: info.patternGauge.stitches,
          pattern_gauge_rows: info.patternGauge.rows,
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

    /** Patron ajouté par un lien : PDF (le lien lui-même, ou trouvé dans la page), nom et image de la page, sans le modèle. */
    async readPatternLink(url: string): Promise<PatternLink> {
      return patternLinkFromResponse(await invokeKnit<PatternLinkResponse>({ link: { url } }, 'Impossible de lire ce lien.', (d) => typeof d.url === 'string'))
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

    /** Bibliothèque de patrons (triée par l'écran). */
    async listPatterns(): Promise<KnitPattern[]> {
      const { data, error } = await db.from('knit_patterns').select(PATTERN_COLUMNS).order('created_at', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les patrons.')
      return data.map(toPattern)
    },

    /** Lectures gardées d'un patron (une par taille) ; les lectures abîmées sont écartées. */
    async listReadings(patternId: string): Promise<StoredReading[]> {
      const { data, error } = await db.from('knit_pattern_readings').select('size_index, size_label, reading, read_at').eq('pattern_id', patternId)
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
        newPhotos = await uploadPatternPhotos(files.newPhotos)
      } catch (e) {
        if (newPdf) await db.storage.from(PATTERN_BUCKET).remove([newPdf])
        throw e
      }
      const row = { ...toPatternColumns(fields), pdf_path: newPdf ?? files.pdfPath, photos: [...files.photos, ...newPhotos] }
      const { data, error } = existing
        ? await db.from('knit_patterns').update(row).eq('id', existing.id).select('id').single()
        : await db.from('knit_patterns').insert(row).select('id').single()
      if (error) {
        if (newPdf) await db.storage.from(PATTERN_BUCKET).remove([newPdf])
        if (newPhotos.length) await db.storage.from(PROGRESS_BUCKET).remove(newPhotos)
        throw toAppError(error, 'Impossible d’enregistrer le patron.')
      }
      if (existing) {
        const removedPhotos = existing.photos.filter((p) => !row.photos.includes(p))
        if (removedPhotos.length) await db.storage.from(PROGRESS_BUCKET).remove(removedPhotos)
        if (existing.pdfPath && existing.pdfPath !== row.pdf_path && existing.projects.length === 0) await db.storage.from(PATTERN_BUCKET).remove([existing.pdfPath])
      }
      return data.id
    },

    /** Supprime un patron ; ses projets restent (avec leur PDF), seuls ses fichiers inutilisés sont supprimés. */
    async deletePattern(pattern: Pick<KnitPattern, 'id' | 'pdfPath' | 'photos' | 'projects'>): Promise<void> {
      const { error } = await db.from('knit_patterns').delete().eq('id', pattern.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le patron.')
      if (pattern.photos.length) await db.storage.from(PROGRESS_BUCKET).remove(pattern.photos)
      if (pattern.pdfPath && pattern.projects.length === 0) await db.storage.from(PATTERN_BUCKET).remove([pattern.pdfPath])
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

    /** URL temporaires des photos du bucket knit-photos : photos d'avancement et photos des patrons. */
    async progressPhotoUrls(paths: string[]): Promise<Record<string, string>> {
      const { data, error } = await db.storage.from(PROGRESS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw new AppError('Impossible de charger les photos.')
      return Object.fromEntries(data.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl]] : [])))
    },

    /** Supprime un projet et ses diagrammes. Son PDF reste à son patron, dans la bibliothèque (le ménage de nuit retire un PDF orphelin). */
    async deleteProject(project: Pick<KnitProject, 'id'> & { charts?: Pick<KnitChart, 'imagePath'>[] }): Promise<void> {
      const { error } = await db.from('knit_projects').delete().eq('id', project.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le projet.')
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
