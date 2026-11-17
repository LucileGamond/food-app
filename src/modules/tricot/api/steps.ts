// Étapes d'un projet : avancée, regroupement, sous-étapes déplacées, séparation.

import { rpcError, toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import { sanitizeHighlights } from '../lib/sizedText'
import type { SectionsChange, Split } from '../lib/organize'
import { sanitizeSections, type KnitStep, type StepProgress, type StepSection } from '../lib/pattern'
import type { KnitContext } from './shared'

export interface StepRow {
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

export function toStep(row: StepRow): KnitStep {
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

export function stepsApi({ db }: KnitContext) {
  return {
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
      if (error) throw rpcError(error, 'Impossible de regrouper les étapes.')
    },

    /** Sous-étapes de plusieurs étapes enregistrées d'un coup (sous-étape déplacée d'une étape à une autre). */
    async saveSections(changes: SectionsChange[]): Promise<void> {
      const { error } = await db.rpc('set_knit_sections', {
        p_steps: changes.map((c) => ({ id: c.id, sections: c.sections, total_rows: c.totalRows, instructions: c.instructions })) as unknown as Json,
      })
      if (error) throw rpcError(error, 'Impossible de déplacer la sous-étape.')
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
      if (error) throw rpcError(error, 'Impossible de séparer l’étape.')
    },
  }
}
