// Diagrammes d'un projet : image dans le bucket knit-charts, calage en base.

import { toAppError } from '@/api/errors'
import type { AppSupabaseClient } from '@/api/client'
import { sanitizeSetup, type ChartSetup, type KnitChart } from '../lib/chart'
import { CHART_BUCKET, SIGNED_URL_TTL_SECONDS, type KnitContext } from './shared'

export interface ChartRow {
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

export const CHART_COLUMNS = 'id, step_id, title, image_path, grid_top, grid_bottom, rows, start_row, end_row, section_id, repeats, flat, odd_only, created_at'

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

/** Diagrammes lus en base, avec l'adresse temporaire de leur image (null si elle n'a pas pu être obtenue). */
export async function signCharts(db: AppSupabaseClient, rows: ChartRow[]): Promise<KnitChart[]> {
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

export function chartsApi({ db, uploadWithRow }: KnitContext) {
  return {
    /** Ajoute un diagramme (image JPEG déjà préparée) au projet. */
    async addChart(projectId: string, image: Blob, setup: ChartSetup): Promise<void> {
      await uploadWithRow(CHART_BUCKET, image, { upload: 'Impossible d’envoyer l’image du diagramme.', insert: 'Impossible d’enregistrer le diagramme.' }, (path) =>
        db.from('knit_charts').insert({ project_id: projectId, image_path: path, ...chartColumns(setup) }),
      )
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
  }
}
