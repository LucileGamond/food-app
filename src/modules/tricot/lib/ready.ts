// Module Tricot : une étape est-elle prête à tricoter ?
//
// Le mode tricoter suit les sous-étapes rang par rang : il lui faut des nombres de rangs (ou des rythmes) et des débuts
// « en même temps » connus, et des conversions cm → rangs vérifiées. Tant qu'il manque quelque chose, l'étape se
// prépare d'abord : la préparation dit quoi, sous-étape par sous-étape.

import { describeConversion } from './measure'
import { effectiveNeedles } from './needles'
import { isChecked, type ProjectGauge } from './gauges'
import { describeSection, planSections, type KnitStep, type StepSection } from './pattern'

export interface ReadyIssue {
  /** Sous-étape concernée (0 = première). */
  index: number
  /** Ce qui manque : « nombre de rangs à régler ». */
  what: string
  /** La sous-étape concernée : « 5 cm (à régler) : jersey ». */
  section: string
  /** La phrase entière, pour la lire d'un trait : « Sous-étape 2 (…) : nombre de rangs à régler. » */
  text: string
  /** Faux : signalé, mais le mode tricoter reste ouvert (l'étape se tricote quand même). */
  blocking: boolean
}

function issueOf(section: StepSection, checked: boolean): string | null {
  if (section.at?.row === null) return 'rang de début « en même temps » à régler'
  if (section.kind === 'rows' && section.rows === null) return 'nombre de rangs à régler'
  if (section.kind === 'repeat' && section.every === null) return 'rythme en rangs à régler'
  // Conversion vérifiée pour son aiguille : rien à refaire
  if (!checked && (section.measured || section.at?.measured)) return `calcul à vérifier (${describeConversion(section) ?? 'converti depuis les cm'})`
  return null
}

/** Étape dont les sous-étapes vont plus loin que son total de rangs : le patron et la lecture ne sont pas d'accord. */
export interface RowsOverflow {
  /** Dernier rang atteint par les sous-étapes. */
  end: number
  /** Total annoncé par l'étape. */
  total: number
  /** Première sous-étape qui dépasse. */
  index: number
}

/** Les sous-étapes dépassent-elles le total de l'étape ? (null : d'accord, ou total inconnu) */
export function rowsOverflow(step: Pick<KnitStep, 'sections' | 'totalRows'>): RowsOverflow | null {
  const total = step.totalRows
  if (total === null) return null
  const plan = planSections(step.sections, total)
  const ends = plan.flatMap((p) => (p.end === null ? [] : [p.end]))
  const end = ends.length ? Math.max(...ends) : 0
  if (end <= total) return null
  return { end, total, index: plan.findIndex((p) => p.end !== null && p.end > total) }
}

/**
 * Ce qui manque pour tricoter l'étape ; vide : prête. Aiguilles : à choisir quand le projet en a plusieurs (une seule
 * vaut partout ; sans aiguille au projet, rien n'est demandé).
 */
export function readyIssues(step: Pick<KnitStep, 'sections' | 'needleFrom' | 'totalRows'>, needles: number[] = [], gauges: ProjectGauge[] = []): ReadyIssue[] {
  const own = effectiveNeedles(step.sections, needles, step.needleFrom ?? null)
  const issues = step.sections.flatMap((section, index) => {
    const issue = issueOf(section, isChecked(gauges, own[index] ?? null)) ?? (needles.length > 1 && own[index] === null ? 'aiguille à choisir' : null)
    if (!issue) return []
    const described = describeSection(section)
    return [{ index, what: issue, section: described, text: `Sous-étape ${index + 1} (${described}) : ${issue}.`, blocking: true }]
  })
  // Sous-étapes plus longues que l'étape : à régler aussi, sinon le mode tricoter s'arrête avant la fin.
  const over = step.totalRows === undefined ? null : rowsOverflow(step as Pick<KnitStep, 'sections' | 'totalRows'>)
  if (over && over.index >= 0) {
    const described = describeSection(step.sections[over.index]!)
    const what = `sous-étapes plus longues que l’étape (jusqu’au rang ${over.end}, pour ${over.total} rangs annoncés)`
    // Signalé sans fermer le mode tricoter : le patron peut arrondir, c'est à elle de trancher.
    issues.push({ index: over.index, what, section: described, text: `Sous-étape ${over.index + 1} (${described}) : ${what}.`, blocking: false })
  }
  return issues
}

export const isReady = (step: Pick<KnitStep, 'sections' | 'needleFrom' | 'totalRows'>, needles: number[] = [], gauges: ProjectGauge[] = []) =>
  !readyIssues(step, needles, gauges).some((i) => i.blocking)
