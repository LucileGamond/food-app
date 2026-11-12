// Module Tricot : compteur de chaque sous-étape (section), tiré du rang de l'étape.
//
// Le rang de l'étape reste la référence (les « en même temps » avancent ensemble, et les patrons comptent souvent depuis
// le début du morceau) ; chaque sous-étape en cours affiche son propre rang. Une sous-étape « en rangs sans nombre »
// (« 30 cm » sans échantillon) se compte librement : la marquer finie fixe sa longueur au nombre de rangs tricotés.

import { describeSection, isToSet, planSections, type StepSection } from './pattern'

export interface SubstepCount {
  /** Position de la sous-étape dans l'étape (0 = première). */
  index: number
  title: string
  /** Rang à tricoter dans la sous-étape (1 = premier). */
  row: number
  /** Nombre de rangs de la sous-étape (null : inconnu, compté librement ou jusqu'à la fin de l'étape). */
  rows: number | null
  /** Rangs sans répétition : on peut la finir maintenant, sa longueur devient le nombre de rangs tricotés. */
  finishable: boolean
}

type CountedStep = { sections: StepSection[]; totalRows: number | null }

/** Sous-étapes en cours au rang `row` de l'étape (plusieurs avec « en même temps »), avec leur propre rang. */
export function substepCounts(step: CountedStep, row: number): SubstepCount[] {
  return planSections(step.sections, step.totalRows).flatMap((p): SubstepCount[] => {
    if (p.start === null || p.start > row) return []
    const open = p.section.kind === 'rows' && p.section.rows === null && p.section.at?.row !== null
    // Sous-étape à régler autre qu'une longueur en rangs (rythme en cm) : pas de compteur, la préparation le dit.
    if (isToSet(p.section) && !open) return []
    if (p.end !== null && p.end < row) return []
    return [
      {
        index: p.index,
        title: describeSection(p.section),
        row: row - p.start + 1,
        rows: p.end === null ? null : p.end - p.start + 1,
        finishable: p.section.kind === 'rows',
      },
    ]
  })
}

/** Sous-étape finie après `knitted` rangs (rangs sans répétition) : sa longueur devient ce nombre, sans conversion à valider. */
export function finishSubstep(sections: StepSection[], index: number, knitted: number): StepSection[] {
  const section = sections[index]
  if (!section || section.kind !== 'rows' || knitted < 1) return sections
  const { measured: _measured, ...rest } = section
  return sections.map((s, i) => (i === index ? { ...rest, rows: knitted } : s))
}
