// Projets : liste, lecture, création, réglages (tailles, aiguilles, échantillons, laines, adaptation), suppression.

import { toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import { projectHues, yarnsFromJson, type Yarn } from '../lib/yarn'
import { sanitizeGauges, type Gauge, type ProjectGauge } from '../lib/gauges'
import type { KnitPattern } from '../lib/library'
import { readingKey } from '../lib/readings'
import { readTimes } from '../lib/passes'
import { sanitizeAdaptation, adaptationToJson, type Adaptation } from '../lib/adapt'
import { projectSummary } from '../lib/projectSummary'
import { sanitizeAbbreviations, type Abbreviation, type BaseGlossary } from '../lib/glossary'
import { sanitizeYarnChecks, type YarnCheck } from '../lib/yarnLeft'
import { sanitizeHints, type ChartHint, type KnitChart } from '../lib/chart'
import { sanitizeNeedles } from '../lib/needles'
import type { KnitProject, KnitProjectSummary, PatternStep, ReadPattern } from '../lib/pattern'
import { CHART_BUCKET, PATTERN_BUCKET, type KnitContext } from './shared'
import { CHART_COLUMNS, signCharts } from './charts'
import { toStep } from './steps'

const yarnChecksToJson = (checks: YarnCheck[]) => checks.map((c) => ({ yarn: c.yarn, grams: c.grams, rows_done: c.rowsDone, at: c.at }))

export function projectsApi({ db, uploadPdf }: KnitContext) {
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

  return {
    async listProjects(): Promise<KnitProjectSummary[]> {
      const { data, error } = await db
        .from('knit_projects')
        .select('id, title, size, sizes, size_index, adaptation, yarns, updated_at, knit_steps(id, position, title, total_rows, row_count, times, pass, done)')
        .order('updated_at', { ascending: false })
        .order('position', { referencedTable: 'knit_steps' })
      if (error) throw toAppError(error, 'Impossible de charger les projets.')
      return data.map((p) =>
        projectSummary({
          id: p.id,
          title: p.title,
          size: p.size,
          sizes: p.sizes,
          sizeIndex: p.size_index,
          updatedAt: p.updated_at,
          adaptation: sanitizeAdaptation(p.adaptation),
          steps: p.knit_steps.map((s) => ({ id: s.id, title: s.title, totalRows: s.total_rows, rowCount: s.row_count, times: s.times, pass: s.pass, done: s.done })),
          hues: projectHues(yarnsFromJson(p.yarns)),
        }),
      )
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
          `id, title, size, sizes, size_index, pdf_path, pattern_id, chart_hints, abbreviations, yarn_checks, yarns, pattern_gauge_stitches, pattern_gauge_rows, adaptation, needles, needle_gauges, knit_steps(id, position, title, instructions, total_rows, stitches, start_stitches, sections, row_count, times, pass, notes, done, highlights, translation), knit_charts(${CHART_COLUMNS})`,
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
        patternId: data.pattern_id,
        steps: data.knit_steps.map(toStep),
        charts: await signCharts(db, data.knit_charts),
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

    /** Taille dont les nombres sont mis en valeur dans le texte des étapes (null : aucune). */
    async setSizeIndex(id: string, sizeIndex: number | null): Promise<void> {
      const { error } = await db.from('knit_projects').update({ size_index: sizeIndex }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de changer la taille mise en valeur.')
    },

    /** Laine et échantillon ; `yarnChecks` (laine retirée) : les pesées décalées, enregistrées dans la même écriture. */
    async saveProjectInfo(id: string, info: { yarns: Yarn[]; patternGauge: Gauge }, yarnChecks?: YarnCheck[]): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({
          yarns: info.yarns as unknown as Json[],
          pattern_gauge_stitches: info.patternGauge.stitches,
          pattern_gauge_rows: info.patternGauge.rows,
          ...(yarnChecks ? { yarn_checks: yarnChecksToJson(yarnChecks) } : {}),
        })
        .eq('id', id)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la laine et l’échantillon.')
    },

    /** Enregistre l'adaptation (null : la supprime, le patron d'origine reste). */
    async saveAdaptation(projectId: string, adaptation: Adaptation | null): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({ adaptation: adaptation && (adaptationToJson(adaptation) as unknown as Json) })
        .eq('id', projectId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer le patron adapté.')
    },

    /** Pesées des laines du projet (la dernière de chacune). */
    async saveYarnChecks(projectId: string, checks: YarnCheck[]): Promise<void> {
      const { error } = await db
        .from('knit_projects')
        .update({ yarn_checks: yarnChecksToJson(checks) })
        .eq('id', projectId)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la pesée.')
    },

    /** Supprime un projet et ses diagrammes. Son PDF reste à son patron, dans la bibliothèque (le ménage de nuit retire un PDF orphelin). */
    async deleteProject(project: Pick<KnitProject, 'id'> & { charts?: Pick<KnitChart, 'imagePath'>[] }): Promise<void> {
      const { error } = await db.from('knit_projects').delete().eq('id', project.id)
      if (error) throw toAppError(error, 'Impossible de supprimer le projet.')
      if (project.charts?.length) await db.storage.from(CHART_BUCKET).remove(project.charts.map((c) => c.imagePath))
    },
  }
}
