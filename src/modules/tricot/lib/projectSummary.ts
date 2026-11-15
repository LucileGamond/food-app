// Module Tricot : résumé d'un projet pour la liste (étape en cours, avancée), d'après ses étapes et l'adaptation suivie.

import { followedAdaptation, type Adaptation } from './adapt'
import { followedSize, type KnitProject, type KnitProjectSummary, type KnitStep } from './pattern'

type SummaryStep = Pick<KnitStep, 'id' | 'title' | 'totalRows' | 'rowCount' | 'times' | 'pass' | 'done'>

export interface SummarySource extends Pick<KnitProject, 'id' | 'title' | 'size' | 'sizes' | 'sizeIndex'> {
  updatedAt: string
  adaptation: Adaptation | null
  steps: SummaryStep[]
  hues: string[]
}

/** Étape en cours : la première non terminée ; ses rangs sont ceux du patron adapté quand il est suivi. */
export function projectSummary(project: SummarySource): KnitProjectSummary {
  const size = followedSize(project)
  const index = project.steps.findIndex((s) => !s.done)
  const step = index === -1 ? null : project.steps[index]!
  const adapted = step ? followedAdaptation(project.adaptation, size)?.steps.find((a) => a.stepId === step.id) : undefined
  return {
    id: project.id,
    title: project.title,
    size,
    updatedAt: project.updatedAt,
    stepsDone: project.steps.filter((s) => s.done).length,
    stepsTotal: project.steps.length,
    current: step && { number: index + 1, title: step.title, rowCount: step.rowCount, totalRows: adapted ? adapted.totalRows : step.totalRows, times: step.times, pass: step.pass },
    hues: project.hues,
  }
}
