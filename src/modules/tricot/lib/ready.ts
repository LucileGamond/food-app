// Module Tricot : une étape est-elle prête à tricoter ?
//
// Le mode tricoter suit les sous-étapes rang par rang : il lui faut des nombres de rangs (ou des rythmes) et des débuts
// « en même temps » connus, et des conversions cm → rangs vérifiées. Tant qu'il manque quelque chose, l'étape se
// prépare d'abord : la préparation dit quoi, sous-étape par sous-étape.

import { describeConversion } from './measure'
import { effectiveNeedles } from './needles'
import { describeSection, type KnitStep, type StepSection } from './pattern'

export interface ReadyIssue {
  /** Sous-étape concernée (0 = première). */
  index: number
  /** « Sous-étape 2 (5 cm (à régler) : jersey) : nombre de rangs à régler. » */
  text: string
}

function issueOf(section: StepSection): string | null {
  if (section.at?.row === null) return 'rang de début « en même temps » à régler'
  if (section.kind === 'rows' && section.rows === null) return 'nombre de rangs à régler'
  if (section.kind === 'repeat' && section.every === null) return 'rythme en rangs à régler'
  if (section.measured || section.at?.measured) return `calcul à vérifier (${describeConversion(section) ?? 'converti depuis les cm'})`
  return null
}

/**
 * Ce qui manque pour tricoter l'étape ; vide : prête. Aiguilles : à choisir quand le projet en a plusieurs (une seule
 * vaut partout ; sans aiguille au projet, rien n'est demandé).
 */
export function readyIssues(step: Pick<KnitStep, 'sections'>, needles: number[] = []): ReadyIssue[] {
  const own = effectiveNeedles(step.sections, needles)
  return step.sections.flatMap((section, index) => {
    const issue = issueOf(section) ?? (needles.length > 1 && own[index] === null ? 'aiguille à choisir' : null)
    return issue ? [{ index, text: `Sous-étape ${index + 1} (${describeSection(section)}) : ${issue}.` }] : []
  })
}

export const isReady = (step: Pick<KnitStep, 'sections'>, needles: number[] = []) => readyIssues(step, needles).length === 0
