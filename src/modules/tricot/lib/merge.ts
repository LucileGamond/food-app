// Module Tricot : regrouper une étape avec la suivante (« Dos – côtes » + « Dos – jersey » → « Dos »).
//
// Les deux étapes deviennent les sous-étapes d'une seule : celles de la suivante viennent à la suite, leurs débuts
// « en même temps » décalés des rangs de la première (à régler s'ils ne sont pas connus).

import { appendAfterEnd } from './organize'
import { MAX_SECTIONS, planSections, type KnitStep, type StepSection } from './pattern'
import { anchoredSections } from './sources'

type MergedStep = Pick<KnitStep, 'title' | 'totalRows' | 'sections' | 'instructions'>

/** Sous-étapes d'une étape avec leur texte : les siennes, ou une seule de ses rangs (à régler s'ils ne sont pas connus). */
const ownSections = anchoredSections

/** Rangs d'une étape : son nombre de rangs, ou la fin de ses sous-étapes si elles sont toutes connues. */
function stepLength(step: Pick<KnitStep, 'totalRows' | 'sections'>): number | null {
  if (step.totalRows !== null) return step.totalRows
  const plan = planSections(step.sections, null)
  if (!plan.length || plan.some((p) => p.end === null)) return null
  return Math.max(...plan.map((p) => p.end!))
}

/** Étape regroupée avec la suivante : sous-étapes à la suite, nombre de rangs additionné quand les deux sont connus. */
export function mergeSteps(first: MergedStep, second: MergedStep): { sections: StepSection[]; totalRows: number | null } {
  const offset = stepLength(first)
  const following = ownSections(second).map((section): StepSection => {
    if (!section.at || section.at.row === null) return section
    if (offset !== null) return { ...section, at: { ...section.at, row: section.at.row + offset } }
    return { ...section, at: { row: null, pattern: section.at.pattern ?? `rang ${section.at.row} de « ${second.title} »` } }
  })
  const secondLength = stepLength(second)
  const own = ownSections(first)
  // La suite commence après le dernier rang de la première étape, même si ses sous-étapes finissent avant
  if (following.length && offset !== null) following[0] = appendAfterEnd(own, offset, following[0]!)
  return {
    sections: [...own, ...following],
    totalRows: offset !== null && secondLength !== null ? offset + secondLength : null,
  }
}

/** Rangs au plus d'une étape (comme en base). */
export const MAX_STEP_ROWS = 2000

type Mergeable = Pick<KnitStep, 'rowCount' | 'done' | 'pass' | 'times' | 'totalRows'> & { sections: unknown[] }

/** Pourquoi l'étape suivante ne peut pas être regroupée avec `current` (null : elle le peut). */
export function mergeBlocker(current: Mergeable, next: Mergeable | null, adapted: boolean): string | null {
  if (!next) return null
  if (adapted) return 'Le patron a une adaptation : regrouper des étapes n’est pas possible.'
  if (current.done) return 'Cette étape est terminée : la suivante passerait pour terminée elle aussi.'
  if (next.rowCount > 0 || next.done || next.pass > 1) return 'L’étape suivante est commencée : elle ne peut plus être regroupée.'
  if (current.times !== next.times) return 'Les deux étapes ne se tricotent pas le même nombre de fois.'
  if (Math.max(current.sections.length, 1) + Math.max(next.sections.length, 1) > MAX_SECTIONS) return `Ensemble, elles auraient plus de ${MAX_SECTIONS} sous-étapes.`
  if ((current.totalRows ?? 0) + (next.totalRows ?? 0) > MAX_STEP_ROWS) return `Ensemble, elles auraient plus de ${MAX_STEP_ROWS} rangs.`
  return null
}
