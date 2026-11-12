// Module Tricot : l'étape entière, section par section (préparation et mode tricoter).
//
// Chaque section avec ses rangs : ceux où il y a quelque chose à faire (action, fin de l'étape, section à régler),
// avec les mailles en fin de rang, et le nombre de rangs sans rien de particulier entre eux.

import type { GuideEvent } from './guide'
import { describeRange, describeSection, isToSet, planSections, type StepSection } from './pattern'
import { stitchTrack, type StitchCount } from './stitches'

/** Rangs montrés au plus pour une section sans fin connue (répétition jusqu'à la fin d'une étape sans nombre de rangs). */
export const OUTLINE_OPEN_ROWS = 200

export interface OutlineRow {
  row: number
  /** Ce qu'il y a à faire (sans le début de section, qui est le titre de la section). */
  events: GuideEvent[]
  /** Mailles en fin de rang, quand le rang les change (null sinon). */
  stitches: StitchCount | null
}

export interface OutlineSection {
  /** « 4 rangs : côtes 1/1 », « 1 dim. de chaque côté — tous les 6 rangs (4 fois) » ; null : rangs hors sections. */
  title: string | null
  /** « Rangs 5 à 28 » (null : inconnus, une section précédente est à régler). */
  range: string | null
  start: number | null
  end: number | null
  rows: OutlineRow[]
  /** Rangs sans rien de particulier. */
  quiet: number
  /** Section à régler : ses rangs ne sont pas connus. */
  toSet: boolean
  /** Section sans fin connue, coupée après OUTLINE_OPEN_ROWS rangs. */
  cut: boolean
}

type OutlineStep = { sections: StepSection[]; totalRows: number | null; stitches: number | null }

const describeRows = (start: number, end: number) => (start === end ? `Rang ${start}` : `Rangs ${start} à ${end}`)

/** L'étape entière, section par section : chacune avec ses propres rangs (les pistes « en même temps » à part). */
export function stepOutline(step: OutlineStep, nextTitle: string | null): OutlineSection[] {
  const stitches = stitchTrack(step)
  const plan = planSections(step.sections, step.totalRows)
  const total = step.totalRows
  const stepEnd: GuideEvent = { kind: 'step-end', next: nextTitle }
  // Le dernier rang de l'étape est rappelé dans la première section qui le contient (sinon après les sections).
  const endOwner = total === null ? -1 : plan.findIndex((p) => p.start !== null && !isToSet(p.section) && p.start <= total && (p.end === null || p.end >= total))

  const rowsBetween = (start: number, end: number, eventsAt: (row: number) => GuideEvent[]): Pick<OutlineSection, 'rows' | 'quiet'> => {
    const rows: OutlineRow[] = []
    for (let row = start; row <= end; row++) {
      const events = eventsAt(row)
      if (!events.length) continue
      const count = stitches(row)
      rows.push({ row, events, stitches: events.some((e) => e.kind === 'action') && count.kind !== 'unknown' ? count : null })
    }
    return { rows, quiet: end - start + 1 - rows.length }
  }

  const outline: OutlineSection[] = []
  let last = 0
  for (const p of plan) {
    const toSet = isToSet(p.section)
    const base = { title: describeSection(p.section), range: describeRange(p), start: p.start, end: p.end, toSet, cut: false }
    if (p.start === null || toSet) {
      outline.push({ ...base, rows: [], quiet: 0 })
      // La suite n'est pas connue : les sections suivantes sont listées sans leurs rangs.
      last = Infinity
      continue
    }
    if (p.end !== null && p.end < p.start) continue
    const cut = p.end === null
    const end = p.end ?? p.start + OUTLINE_OPEN_ROWS - 1
    const eventsAt = (row: number): GuideEvent[] => [
      ...p.actions.filter((a) => a.row === row).map((a): GuideEvent => ({ kind: 'action', text: a.action.text, count: a.count, times: p.section.times })),
      ...(p.index === endOwner && row === total ? [stepEnd] : []),
    ]
    outline.push({ ...base, ...rowsBetween(p.start, end, eventsAt), cut })
    // Sections « en même temps » : la dernière à finir compte.
    last = cut ? Infinity : Math.max(last, end)
  }
  // Rangs de l'étape après la dernière section (ou étape sans section) : jusqu'au dernier rang.
  if (total !== null && last < total) {
    const start = last + 1
    const eventsAt = (row: number) => (row === total && endOwner === -1 ? [stepEnd] : [])
    outline.push({ title: null, range: describeRows(start, total), start, end: total, toSet: false, cut: false, ...rowsBetween(start, total, eventsAt) })
  }
  return outline
}

/** Sections où se trouve le rang `row` (plusieurs avec « en même temps »). */
export function outlineIndicesAt(outline: OutlineSection[], row: number): number[] {
  return outline.flatMap((s, i) => (s.start !== null && !s.toSet && s.start <= row && (s.end === null || s.cut || s.end >= row) ? [i] : []))
}
