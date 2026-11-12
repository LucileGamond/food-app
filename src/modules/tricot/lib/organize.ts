// Module Tricot : organiser les étapes (déplacer une sous-étape vers une autre étape, séparer une étape en deux).
//
// Le nombre de rangs des étapes suit les sous-étapes déplacées quand on les connaît. Un début « en même temps »
// compté dans une autre étape devient à régler (son rang n'a plus de sens ailleurs).

import { planSections, type KnitStep, type StepSection } from './pattern'

type OrganizedStep = Pick<KnitStep, 'id' | 'title' | 'totalRows' | 'sections'>

/** Sous-étapes et nombre de rangs d'une étape, à enregistrer. */
export interface SectionsChange {
  id: string
  sections: StepSection[]
  totalRows: number | null
}

/** Rangs d'une sous-étape quand on les connaît (rangs sans répétition, ou répétition au nombre de fois connu). */
export function sectionLength(section: StepSection): number | null {
  if (section.at) return 0
  if (section.kind === 'rows') return section.rows
  return section.every !== null && section.times !== null ? section.every * section.times : null
}

/** Début « en même temps » qui n'a plus de sens hors de son étape (ou de sa place) : à régler. */
function unanchored(section: StepSection, label: string): StepSection {
  if (!section.at || section.at.row === null) return section
  return { ...section, at: { row: null, pattern: section.at.pattern ?? `rang ${section.at.row} de « ${label} »` } }
}

const shift = (total: number | null, by: number | null) => (total === null || by === null ? null : Math.max(1, total + by))

/** Sous-étape `index` de `from` déplacée à la fin de `to` : les deux étapes à enregistrer. */
export function moveSection(from: OrganizedStep, index: number, to: OrganizedStep): [SectionsChange, SectionsChange] {
  const moved = from.sections[index]!
  const length = sectionLength(moved)
  const sections = from.sections.filter((_, i) => i !== index)
  return [
    { id: from.id, sections, totalRows: sections.length ? shift(from.totalRows, length === null ? null : -length) : from.totalRows },
    { id: to.id, sections: [...to.sections, unanchored(moved, from.title)], totalRows: shift(to.totalRows, length) },
  ]
}

/** Où commence une sous-étape dans l'étape (null : rangs d'avant inconnus). */
function startOf(step: OrganizedStep, index: number): number | null {
  return planSections(step.sections, step.totalRows)[index]?.start ?? null
}

export interface Split {
  first: { sections: StepSection[]; totalRows: number | null }
  second: { title: string; sections: StepSection[]; totalRows: number | null }
}

/** Étape séparée avant la sous-étape `index` : les sous-étapes d'avant restent, la suite fait une nouvelle étape. */
export function splitStep(step: OrganizedStep, index: number): Split {
  const start = startOf(step, index)
  const kept = start === null ? null : start - 1
  const rest = step.sections.slice(index).map((section) => {
    if (!section.at || section.at.row === null) return section
    // Rang compté depuis le début de l'étape : depuis celui de la nouvelle quand on le connaît.
    if (kept !== null && section.at.row > kept) return { ...section, at: { ...section.at, row: section.at.row - kept } }
    return unanchored(section, step.title)
  })
  return {
    first: { sections: step.sections.slice(0, index), totalRows: kept },
    second: {
      title: `${step.title} (suite)`.slice(0, 200),
      sections: rest,
      totalRows: kept !== null && step.totalRows !== null && step.totalRows > kept ? step.totalRows - kept : null,
    },
  }
}

/** Étape qu'on ne peut plus réorganiser (son compteur n'aurait plus de sens). */
export const isStarted = (step: Pick<KnitStep, 'rowCount' | 'done' | 'pass'>) => step.rowCount > 0 || step.done || step.pass > 1
