// Module Tricot : étapes d'un patron, rangs comptés et sections de l'étape.
//
// Une étape est une suite de sections, tricotées dans l'ordre :
//   « 4 rangs jersey », puis « 1 diminution tous les 6 rangs (4 fois) », puis « 10 rangs »…
// Les rangs de chaque section se calculent à la suite (rangs 1 à 4, puis 5 à 28…).
// Le compteur compte les rangs terminés : ce qui est annoncé concerne le rang à tricoter (rangs faits + 1).

export type SectionKind = 'rows' | 'repeat'

export interface StepSection {
  kind: SectionKind
  /** Rangs sans répétition : nombre de rangs (null : à régler, ex. « 5 cm »). */
  rows: number | null
  /** Répétition : l'action tous les N rangs (null : à régler). */
  every: number | null
  /** Répétition : nombre de fois (null : jusqu'à la fin de l'étape). */
  times: number | null
  /** Ce qu'on fait (« 1 diminution de chaque côté », « jersey »). */
  text: string
  /** Mesure écrite dans le patron (« tous les 5 cm »), pour aider à la régler en rangs. */
  pattern: string | null
}

export const MAX_SECTIONS = 30

export interface KnitStep {
  id: string
  position: number
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  sections: StepSection[]
  rowCount: number
  notes: string
  done: boolean
}

export interface KnitProjectSummary {
  id: string
  title: string
  size: string
  updatedAt: string
  stepsDone: number
  stepsTotal: number
}

export interface KnitProject {
  id: string
  title: string
  size: string
  pdfPath: string | null
  steps: KnitStep[]
}

/** Étape telle que lue dans le patron (avant enregistrement). */
export type PatternStep = Pick<KnitStep, 'title' | 'instructions' | 'totalRows' | 'stitches' | 'sections'>

export interface ReadPattern {
  title: string
  sizes: string[]
  steps: PatternStep[]
}

export const MAX_PDF_BYTES = 20 * 1024 * 1024
/** Répétition sans nombre de fois ni fin d'étape connue : rangs prévus au plus. */
const OPEN_LIMIT = 2000

export interface PlannedSection {
  section: StepSection
  index: number
  /** Premier et dernier rang (null : inconnus, une section précédente est à régler). */
  start: number | null
  end: number | null
  /** Rangs où l'action de la répétition est à faire. */
  actionRows: number[]
}

/** Rangs de chaque section, à la suite les unes des autres. */
export function planSections(sections: StepSection[], totalRows: number | null): PlannedSection[] {
  let cursor: number | null = 0
  return sections.map((section, index) => {
    if (cursor === null) return { section, index, start: null, end: null, actionRows: [] }
    const from: number = cursor
    const start = from + 1
    if (section.kind === 'rows') {
      cursor = section.rows === null ? null : from + section.rows
      return { section, index, start, end: cursor, actionRows: [] }
    }
    if (section.every === null) {
      cursor = null
      return { section, index, start, end: null, actionRows: [] }
    }
    const every = section.every
    const count = section.times ?? Math.floor(((totalRows ?? OPEN_LIMIT) - from) / every)
    const actionRows = Array.from({ length: Math.max(count, 0) }, (_, k) => from + every * (k + 1))
    // Sans nombre de fois : jusqu'à la fin de l'étape, la suite n'est pas planifiable.
    cursor = section.times === null ? null : from + every * section.times
    return { section, index, start, end: section.times === null ? totalRows : cursor, actionRows }
  })
}

export type SectionAlert =
  | { type: 'action'; section: StepSection; count: number; times: number | null }
  | { type: 'start'; section: StepSection }

/** Ce qu'il y a à faire en tricotant le rang `row` : action d'une répétition, début d'une nouvelle section. */
export function alertsAt(step: Pick<KnitStep, 'sections' | 'totalRows'>, row: number): SectionAlert[] {
  if (row < 1) return []
  const plan = planSections(step.sections, step.totalRows)
  const alerts: SectionAlert[] = []
  for (const p of plan) {
    // Le début de la première section se lit dans la liste ; on annonce les changements ensuite.
    if (p.index > 0 && p.start === row && (p.end === null || p.end >= p.start)) alerts.push({ type: 'start', section: p.section })
  }
  for (const p of plan) {
    const k = p.actionRows.indexOf(row)
    if (k !== -1) alerts.push({ type: 'action', section: p.section, count: k + 1, times: p.section.times })
  }
  return alerts
}

/** Section du rang `row` (null si toutes sont faites ou si la suite est à régler). */
export function sectionIndexAt(plan: PlannedSection[], row: number): number | null {
  const current = plan.find((p) => p.start !== null && p.start <= row && (p.end === null || p.end >= row))
  return current ? current.index : null
}

/** Prochain rang (à partir de `row`, le rang à tricoter) où l'action de la répétition est à faire. */
export function nextActionRow(planned: PlannedSection, row: number): number | null {
  return planned.actionRows.find((r) => r >= row) ?? null
}

/** Étape en cours : la première non terminée (la dernière si tout est fait). */
export function currentStepIndex(steps: Pick<KnitStep, 'done'>[]): number {
  const index = steps.findIndex((s) => !s.done)
  return index === -1 ? Math.max(steps.length - 1, 0) : index
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « 4 rangs : jersey », « 1 diminution — tous les 6 rangs (4 fois) », « 1 diminution — tous les 5 cm (rangs à régler) ». */
export function describeSection(section: StepSection): string {
  if (section.kind === 'rows') {
    const rows = section.rows === null ? `${section.pattern ?? 'Rangs'} (à régler)` : plural(section.rows, 'rang')
    return section.text ? `${rows} : ${section.text}` : `${rows} sans répétition`
  }
  const rhythm =
    section.every === null
      ? `${section.pattern ?? 'intervalle'} (rangs à régler)`
      : `${section.every === 1 ? 'à chaque rang' : `tous les ${section.every} rangs`}${section.times !== null ? ` (${section.times} fois)` : ''}`
  return `${section.text} — ${rhythm}`
}

/** « Rangs 5 à 28 », « Rang 3 », « À partir du rang 29 ». */
export function describeRange(planned: PlannedSection): string | null {
  if (planned.start === null) return null
  if (planned.end === null) return `À partir du rang ${planned.start}`
  if (planned.end < planned.start) return null
  return planned.end === planned.start ? `Rang ${planned.start}` : `Rangs ${planned.start} à ${planned.end}`
}

export interface SectionForm {
  kind: SectionKind
  text: string
  rows: string
  every: string
  times: string
}

export function sectionToForm(section: StepSection): SectionForm {
  const text = (n: number | null) => (n === null ? '' : String(n))
  return { kind: section.kind, text: section.text, rows: text(section.rows), every: text(section.every), times: text(section.times) }
}

/** Valeurs du formulaire → section, ou message d'erreur. La mesure du patron est conservée. */
export function formToSection(form: SectionForm, pattern: string | null = null): StepSection | string {
  const text = form.text.trim().slice(0, 200)
  const parse = (value: string, min: number, max: number): number | null | undefined => {
    if (!value.trim()) return null
    const n = Number(value.trim())
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined
  }
  if (form.kind === 'rows') {
    const rows = parse(form.rows, 1, 2000)
    if (rows === undefined) return 'Nombre de rangs : un nombre entier entre 1 et 2000.'
    // Sans nombre : seulement pour une mesure du patron encore à convertir (« 5 cm »).
    if (rows === null && !pattern) return 'Indique le nombre de rangs.'
    return { kind: 'rows', rows, every: null, times: null, text, pattern }
  }
  if (!text) return 'Indique quoi faire (ex. « 1 diminution de chaque côté »).'
  const every = parse(form.every, 1, 500)
  const times = parse(form.times, 1, 500)
  if (every === undefined) return 'Répétition : un nombre de rangs entre 1 et 500.'
  if (times === undefined) return 'Nombre de fois : un nombre entier à partir de 1.'
  return { kind: 'repeat', rows: null, every, times, text, pattern }
}
