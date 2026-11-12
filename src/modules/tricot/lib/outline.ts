// Module Tricot : l'étape entière, section par section (préparation et mode tricoter).
//
// Chaque section avec ses rangs : ceux où il y a quelque chose à faire (action, fin de l'étape, section à régler),
// avec les mailles en fin de rang, et le nombre de rangs sans rien de particulier entre eux.

import { stepGuide, type GuideEvent } from './guide'
import { describeRange, describeSection, planSections, type StepSection } from './pattern'
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

/** L'étape entière, section par section. */
export function stepOutline(step: OutlineStep, nextTitle: string | null): OutlineSection[] {
  const guide = stepGuide(step, [], nextTitle)
  const stitches = stitchTrack(step)
  const rowsBetween = (start: number, end: number): Pick<OutlineSection, 'rows' | 'quiet'> => {
    const rows: OutlineRow[] = []
    for (let row = start; row <= end; row++) {
      const events = guide.at(row).events.filter((e) => e.kind !== 'section')
      if (!events.length) continue
      const count = stitches(row)
      rows.push({ row, events, stitches: events.some((e) => e.kind === 'action') && count.kind !== 'unknown' ? count : null })
    }
    return { rows, quiet: end - start + 1 - rows.length }
  }

  const outline: OutlineSection[] = []
  let last = 0
  for (const p of planSections(step.sections, step.totalRows)) {
    const toSet = (p.section.kind === 'rows' ? p.section.rows : p.section.every) === null
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
    outline.push({ ...base, ...rowsBetween(p.start, end), cut })
    last = cut ? Infinity : end
  }
  // Rangs de l'étape après la dernière section (ou étape sans section) : jusqu'au dernier rang.
  if (step.totalRows !== null && last < step.totalRows) {
    const start = last + 1
    outline.push({ title: null, range: describeRows(start, step.totalRows), start, end: step.totalRows, toSet: false, cut: false, ...rowsBetween(start, step.totalRows) })
  }
  return outline
}

/** Section où se trouve le rang `row` (index dans le plan), sinon null. */
export function outlineIndexAt(outline: OutlineSection[], row: number): number | null {
  const index = outline.findIndex((s) => s.start !== null && !s.toSet && s.start <= row && (s.end === null || s.cut || s.end >= row))
  return index === -1 ? null : index
}
