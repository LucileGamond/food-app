// Ce que les écrans d'un projet déduisent du projet enregistré : étapes à suivre (patron adapté ou non), aiguilles,
// échantillons, diagrammes placés, étape en cours.

import { stepsToFollow, type ShownStep } from './adapt'
import { placeCharts } from './chartPlace'
import { countsFor, type ProjectGauge } from './gauges'
import { effectiveNeedles, sanitizeNeedles } from './needles'
import { currentStepIndex, type KnitProject } from './pattern'
import type { Gauge } from './yarn'

export interface ProjectView {
  /** Taille suivie (celle mise en valeur, sinon celle du projet). */
  size: string
  /** Étapes à suivre : celles du patron adapté quand il y en a un. */
  steps: ShownStep[]
  /** Patron adapté suivi (ses nombres sont déjà recalculés pour l'échantillon). */
  following: boolean
  needles: number[]
  gauges: ProjectGauge[]
  /** Aiguilles proposées aux sous-étapes : celles du patron, plus celles où un échantillon a été tricoté. */
  needleChoices: number[]
  /** Diagrammes, rattachés à une sous-étape : placés sur ses rangs d'aujourd'hui. */
  charts: KnitProject['charts']
  /** Étape en cours (la première non terminée), absente s'il n'y a aucune étape. */
  current: ShownStep | undefined
}

export function projectView(project: KnitProject): ProjectView {
  const needles = project.needles ?? []
  const gauges = project.gauges ?? []
  const { size, steps, following } = stepsToFollow(project)
  return {
    size,
    steps,
    following,
    needles,
    gauges,
    needleChoices: sanitizeNeedles([...needles, ...gauges.map((g) => g.needle)]),
    charts: placeCharts(project.charts, steps),
    current: steps[currentStepIndex(steps)],
  }
}

/**
 * Mailles et rangs à suivre pour une étape : l'échantillon de son aiguille (celle de sa première sous-étape, ou
 * celle héritée). L'estimation (≈) n'a plus lieu d'être quand le patron adapté est déjà recalculé.
 */
export function gaugeOfStep(project: Pick<KnitProject, 'patternGauge'>, view: Pick<ProjectView, 'following' | 'needles' | 'gauges'>, step: ShownStep): Gauge {
  if (view.following) return project.patternGauge
  const needle = effectiveNeedles(step.sections, view.needles, step.needleFrom ?? null)[0] ?? step.needleFrom ?? null
  return countsFor(view.gauges, needle, project.patternGauge)
}
