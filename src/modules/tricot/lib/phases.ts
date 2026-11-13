// Module Tricot : le projet en trois temps, un onglet chacun.
//
// 1. Démarrer : le matériel (taille, aiguilles, laine, échantillons, patron adapté).
// 2. Préparer : les étapes (organiser, régler les sous-étapes jusqu'à « prête »).
// 3. Tricoter : l'étape en cours, le suivi (laine qui reste, notes, photos).
// Ce sont des onglets, pas un assistant : on revient à tout moment à l'un ou l'autre. Le projet s'ouvre sur le premier
// qui demande quelque chose.

import { parseMeasure } from './measure'
import type { ProjectGauge } from './gauges'
import { currentStepIndex, type KnitStep } from './pattern'
import { isReady } from './ready'
import type { Gauge } from './yarn'

export type ProjectTab = 'demarrer' | 'preparer' | 'tricoter'

export const PROJECT_TABS: ProjectTab[] = ['demarrer', 'preparer', 'tricoter']

export const isProjectTab = (value: string | null): value is ProjectTab => PROJECT_TABS.includes(value as ProjectTab)

type Step = Pick<KnitStep, 'sections' | 'needleFrom' | 'done' | 'rowCount'>

interface StartInput {
  sizes: string[]
  sizeIndex: number | null
  size: string
  needles: number[]
  patternGauge: Gauge
  gauges: ProjectGauge[]
  steps: Step[]
}

/** Ce qui manque au matériel avant de préparer les étapes ; vide : démarrage fait. */
export function startIssues(project: StartInput): string[] {
  const { sizes, sizeIndex, size, needles, patternGauge, gauges, steps } = project
  // Une hauteur en cm se convertit en rangs avec un échantillon (le sien, celui d'une aiguille ou celui du patron)
  const measured = steps.some((s) => s.sections.some((x) => parseMeasure(x.pattern) !== null || parseMeasure(x.at?.pattern ?? null) !== null))
  const gauge = patternGauge.rows !== null || gauges.some((g) => g.rows !== null)
  return [
    sizes.length > 1 && sizeIndex === null && !sizes.includes(size) && 'Taille à choisir',
    needles.length === 0 && 'Aiguilles à indiquer',
    measured && !gauge && 'Échantillon à noter (le patron donne des hauteurs en cm)',
  ].filter((issue): issue is string => !!issue)
}

/** Étapes pas terminées qui ne sont pas encore prêtes à tricoter. */
export function stepsToPrepare(steps: Step[], needles: number[], gauges: ProjectGauge[]): number {
  return steps.filter((s) => !s.done && !isReady(s, needles, gauges)).length
}

/**
 * Onglet ouvert d'office : Démarrer tant que le matériel manque et que rien n'est tricoté, Préparer si l'étape en cours
 * n'est pas prête, sinon Tricoter.
 */
export function defaultTab(project: StartInput): ProjectTab {
  const { steps, needles, gauges } = project
  const started = steps.some((s) => s.done || s.rowCount > 0)
  if (!started && startIssues(project).length > 0) return 'demarrer'
  const current = steps[currentStepIndex(steps)]
  if (current && !current.done && !isReady(current, needles, gauges)) return 'preparer'
  return 'tricoter'
}
