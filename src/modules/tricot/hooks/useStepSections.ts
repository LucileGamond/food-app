import { useBaseGlossary } from './useBaseGlossary'
import { looksEnglish, mergeGlossary, type Abbreviation } from '../lib/glossary'
import { effectiveNeedles } from '../lib/needles'
import type { ProjectGauge } from '../lib/gauges'
import { readyIssues, rowsOverflow } from '../lib/ready'
import { planSections, sectionIndicesAt, type KnitStep } from '../lib/pattern'

/**
 * Ce que la liste des sous-étapes d'une étape calcule : glossaire du texte, aiguille de chaque sous-étape, plan des
 * rangs, sous-étapes en cours, problèmes à régler et dépassement du total de l'étape.
 */
export function useStepSections(step: KnitStep, needles: number[], gauges: ProjectGauge[], abbreviations: Abbreviation[] | null) {
  const base = useBaseGlossary()
  const glossary = abbreviations ? mergeGlossary(abbreviations, base, looksEnglish(step.instructions)) : []
  const own = effectiveNeedles(step.sections, needles, step.needleFrom ?? null)
  /** Aiguille héritée par la sous-étape `index` : celle d'avant, ou la seule du projet. */
  const inheritedAt = (index: number) => (index > 0 ? (own[index - 1] ?? null) : (step.needleFrom ?? (needles.length === 1 ? needles[0]! : null)))
  const plan = planSections(step.sections, step.totalRows)
  const row = step.rowCount + 1
  return {
    glossary,
    own,
    inheritedAt,
    plan,
    row,
    current: sectionIndicesAt(plan, row),
    // Ce qui manque à chaque sous-étape : la sienne est signalée, et « À préparer » l'ouvre.
    issues: new Set(readyIssues(step, needles, gauges).map((i) => i.index)),
    // Sous-étapes plus longues que l'étape : le patron et la lecture ne sont pas d'accord.
    over: rowsOverflow(step),
  }
}
