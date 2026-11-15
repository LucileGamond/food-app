// Module Tricot : organiser les étapes (déplacer une sous-étape vers une autre étape, séparer une étape en deux).
//
// Le nombre de rangs des étapes suit les sous-étapes déplacées quand on les connaît. Un début « en même temps »
// compté dans une autre étape devient à régler (son rang n'a plus de sens ailleurs).

import { planSections, type KnitStep, type StepSection } from './pattern'
import { anchoredSections, textOf } from './sources'

type OrganizedStep = Pick<KnitStep, 'id' | 'title' | 'totalRows' | 'sections' | 'instructions'>

/** Sous-étapes, nombre de rangs et texte d'une étape, à enregistrer. */
export interface SectionsChange {
  id: string
  sections: StepSection[]
  totalRows: number | null
  /** Texte de l'étape d'après ses sous-étapes (le texte suit la sous-étape déplacée). */
  instructions: string
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

/** Dernier rang des sous-étapes (null s'il n'est pas connu). */
function planEnd(sections: StepSection[], totalRows: number | null): number | null {
  const plan = planSections(sections, totalRows)
  if (plan.some((p) => p.end === null)) return null
  return Math.max(0, ...plan.map((p) => p.end!))
}

/** Rang où reprendrait une sous-étape « à la suite » placée après la dernière (null : inconnu). */
function cursorEnd(sections: StepSection[], totalRows: number | null): number | null {
  const plan = planSections(sections, totalRows)
  return plan.length ? (plan.at(-1)!.end ?? null) : 0
}

/**
 * Sous-étape ajoutée à la fin d'une étape : elle commence après le dernier rang de l'étape. Si les sous-étapes
 * finissent ailleurs (moins de rangs que l'étape, ou une piste « en même temps » en dernier), son rang est noté.
 */
export function appendAfterEnd(sections: StepSection[], totalRows: number | null, added: StepSection): StepSection {
  if (added.at || totalRows === null || cursorEnd(sections, totalRows) === totalRows) return added
  return { ...added, at: { row: totalRows + 1, pattern: null } }
}

/**
 * Sous-étapes qui restent quand on retire la sous-étape `index` : chacune garde le rang où elle se tricote.
 * Retirer des rangs de la piste principale avance d'autant les débuts « en même temps » d'après (à régler s'ils
 * commençaient pendant les rangs retirés) ; retirer une sous-étape d'une piste « en même temps » laisse la suite de la
 * piste à sa place.
 */
function remainingSections(step: OrganizedStep, own: StepSection[], index: number): StepSection[] {
  const plan = planSections(own, step.totalRows)
  const moved = own[index]!
  const { start, end } = plan[index]!
  const mainTrack = own.slice(0, index + 1).every((s) => !s.at)
  const length = sectionLength(moved)
  const kept: StepSection[] = []
  own.forEach((section, i) => {
    if (i === index) return
    let next = section
    if (section.at && section.at.row !== null && mainTrack && start !== null && end !== null && length) {
      if (section.at.row > end) next = { ...section, at: { ...section.at, row: section.at.row - length } }
      else if (section.at.row >= start) next = unanchored(section, step.title)
    } else if (i === index + 1 && !section.at && !mainTrack) {
      // La suite d'une piste « en même temps » ne se rattache pas à la sous-étape d'avant
      const row = plan[i]!.start
      next = { ...section, at: row === null ? { row: null, pattern: moved.at?.pattern ?? `après « ${step.title} »` } : { row, pattern: null } }
    }
    kept.push(next)
  })
  return kept
}

/** Sous-étape `index` de `from` déplacée à la fin de `to`, avec son texte : les deux étapes à enregistrer. */
export function moveSection(from: OrganizedStep, index: number, to: OrganizedStep): [SectionsChange, SectionsChange] {
  const own = anchoredSections(from)
  const moved = own[index]!
  const length = sectionLength(moved)
  const sections = remainingSections(from, own, index)
  const before = planEnd(own, from.totalRows)
  const after = planEnd(sections, from.totalRows)
  // L'étape perd les rangs que ses sous-étapes ont perdus (une piste « en même temps » plus courte qu'elle ne change rien)
  const fromRows = !sections.length
    ? from.totalRows
    : before !== null && after !== null
      ? shift(from.totalRows, after - before)
      : shift(from.totalRows, length === null ? null : -length)
  const toOwn = anchoredSections(to)
  const target = [...toOwn, appendAfterEnd(toOwn, to.totalRows, unanchored(moved, from.title))]
  return [
    { id: from.id, sections, totalRows: fromRows, instructions: textOf(sections) },
    { id: to.id, sections: target, totalRows: shift(to.totalRows, length), instructions: textOf(target) },
  ]
}

/**
 * Pourquoi on ne peut pas séparer l'étape avant la sous-étape `index` (null : on le peut). La coupure doit tomber
 * entre deux rangs : aucune sous-étape d'avant ne continue après, aucune de la suite ne commence avant.
 */
export function splitBlocker(step: OrganizedStep, index: number): string | null {
  const plan = planSections(anchoredSections(step), step.totalRows)
  const start = plan[index]?.start ?? null
  if (start === null) return null
  if (start <= 1) return 'Cette sous-étape commence au 1er rang : rien ne resterait avant elle.'
  const overlap = plan.slice(0, index).some((p) => p.end === null || p.end >= start) || plan.slice(index).some((p) => p.start !== null && p.start < start)
  return overlap ? 'Cette sous-étape se tricote pendant une autre (« en même temps ») : séparer ici couperait l’autre en deux.' : null
}

/** Où commence une sous-étape dans l'étape (null : rangs d'avant inconnus). */
function startOf(step: OrganizedStep, index: number): number | null {
  return planSections(step.sections, step.totalRows)[index]?.start ?? null
}

export interface Split {
  first: { sections: StepSection[]; totalRows: number | null; instructions: string }
  second: { title: string; sections: StepSection[]; totalRows: number | null; instructions: string }
}

/** Étape séparée avant la sous-étape `index` : les sous-étapes d'avant restent, la suite fait une nouvelle étape. */
export function splitStep(step: OrganizedStep, index: number): Split {
  const own = anchoredSections(step)
  const start = startOf({ ...step, sections: own }, index)
  const kept = start === null ? null : start - 1
  const rest = own.slice(index).map((section) => {
    if (!section.at || section.at.row === null) return section
    // Rang compté depuis le début de l'étape : depuis celui de la nouvelle quand on le connaît.
    if (kept !== null && section.at.row > kept) return { ...section, at: { ...section.at, row: section.at.row - kept } }
    return unanchored(section, step.title)
  })
  const first = own.slice(0, index)
  return {
    first: { sections: first, totalRows: kept, instructions: textOf(first) },
    second: {
      title: `${step.title} (suite)`.slice(0, 200),
      sections: rest,
      totalRows: kept !== null && step.totalRows !== null && step.totalRows > kept ? step.totalRows - kept : null,
      instructions: textOf(rest),
    },
  }
}

/** Étape qu'on ne peut plus réorganiser (son compteur n'aurait plus de sens). */
export const isStarted = (step: Pick<KnitStep, 'rowCount' | 'done' | 'pass'>) => step.rowCount > 0 || step.done || step.pass > 1
