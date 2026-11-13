// Module Tricot : un diagramme rattaché à une sous-étape suit ses rangs.
//
// Ses rangs de début et de fin se recalculent d'après la sous-étape (longueur réglée, conversion validée, sous-étape
// ajoutée ou déplacée avant elle) ; s'il ne la retrouve plus, il garde les rangs enregistrés.

import type { ChartSetup } from './chart'
import { planSections, type KnitStep } from './pattern'

/** Diagramme placé sur sa sous-étape : début de celle-ci, et sa fin s'il s'y arrête (endRow enregistré). */
export function placeChart<T extends Pick<ChartSetup, 'sectionId' | 'startRow' | 'endRow'>>(chart: T, step: Pick<KnitStep, 'sections' | 'totalRows'> | undefined): T {
  if (!chart.sectionId || !step) return chart
  const p = planSections(step.sections, step.totalRows).find((x) => x.section.id === chart.sectionId)
  if (!p || p.start === null) return chart
  return { ...chart, startRow: p.start, endRow: chart.endRow ? p.end : null }
}

export function placeCharts<T extends Pick<ChartSetup, 'sectionId' | 'startRow' | 'endRow' | 'stepId'>>(charts: T[], steps: Pick<KnitStep, 'id' | 'sections' | 'totalRows'>[]): T[] {
  return charts.map((c) => placeChart(c, steps.find((s) => s.id === c.stepId)))
}
