// Module Tricot : une étape est-elle prête à tricoter ?
//
// Le mode tricoter suit les sous-étapes rang par rang : il lui faut des nombres de rangs (ou des rythmes) et des débuts
// « en même temps » connus, et des conversions cm → rangs vérifiées. Tant qu'il manque quelque chose, l'étape se
// prépare d'abord : la préparation dit quoi, sous-étape par sous-étape.

import { describeConversion } from './measure'
import { effectiveNeedles } from './needles'
import { isChecked, type NeedleGauge } from './needleGauges'
import { describeSection, type KnitStep, type StepSection } from './pattern'

export interface ReadyIssue {
  /** Sous-étape concernée (0 = première). */
  index: number
  /** Ce qui manque : « nombre de rangs à régler ». */
  what: string
  /** La sous-étape concernée : « 5 cm (à régler) : jersey ». */
  section: string
  /** La phrase entière, pour la lire d'un trait : « Sous-étape 2 (…) : nombre de rangs à régler. » */
  text: string
}

function issueOf(section: StepSection, checked: boolean): string | null {
  if (section.at?.row === null) return 'rang de début « en même temps » à régler'
  if (section.kind === 'rows' && section.rows === null) return 'nombre de rangs à régler'
  if (section.kind === 'repeat' && section.every === null) return 'rythme en rangs à régler'
  // Conversion vérifiée pour son aiguille : rien à refaire
  if (!checked && (section.measured || section.at?.measured)) return `calcul à vérifier (${describeConversion(section) ?? 'converti depuis les cm'})`
  return null
}

/**
 * Ce qui manque pour tricoter l'étape ; vide : prête. Aiguilles : à choisir quand le projet en a plusieurs (une seule
 * vaut partout ; sans aiguille au projet, rien n'est demandé).
 */
export function readyIssues(step: Pick<KnitStep, 'sections' | 'needleFrom'>, needles: number[] = [], needleGauges: NeedleGauge[] = []): ReadyIssue[] {
  const own = effectiveNeedles(step.sections, needles, step.needleFrom ?? null)
  return step.sections.flatMap((section, index) => {
    const issue = issueOf(section, isChecked(needleGauges, own[index] ?? null)) ?? (needles.length > 1 && own[index] === null ? 'aiguille à choisir' : null)
    if (!issue) return []
    const described = describeSection(section)
    return [{ index, what: issue, section: described, text: `Sous-étape ${index + 1} (${described}) : ${issue}.` }]
  })
}

export const isReady = (step: Pick<KnitStep, 'sections' | 'needleFrom'>, needles: number[] = [], needleGauges: NeedleGauge[] = []) => readyIssues(step, needles, needleGauges).length === 0
