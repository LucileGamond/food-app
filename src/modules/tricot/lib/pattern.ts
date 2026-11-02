// Module Tricot : étapes d'un patron, rangs comptés et sections de l'étape.
//
// Une étape est une suite de sections, tricotées dans l'ordre :
//   « 4 rangs jersey », puis « 1 diminution tous les 6 rangs (4 fois) », puis « 10 rangs »…
// Une répétition peut porter plusieurs actions, chacune sur un rang de la répétition (1er, dernier…).
// Les rangs de chaque section se calculent à la suite (rangs 1 à 4, puis 5 à 28…).
// Le compteur compte les rangs terminés : ce qui est annoncé concerne le rang à tricoter (rangs faits + 1).

export type SectionKind = 'rows' | 'repeat'

/** Action d'une répétition, placée sur un rang de la répétition. */
export interface RepeatAction {
  text: string
  /** Rang dans la répétition (1 = premier) ; null = dernier rang. */
  rank: number | null
}

export interface StepSection {
  kind: SectionKind
  /** Rangs sans répétition : nombre de rangs (null : à régler, ex. « 5 cm »). */
  rows: number | null
  /** Répétition : l'action tous les N rangs (null : à régler). */
  every: number | null
  /** Répétition : nombre de fois (null : jusqu'à la fin de l'étape). */
  times: number | null
  /** Répétition : actions de chaque répétition (« 1 diminution » au 1er rang, « 1 augmentation » au dernier…). */
  actions?: RepeatAction[]
  /** Rangs sans répétition : le point (« jersey »). Ancien format de répétition : l'action, au dernier rang. */
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
/** Répétition sans nombre de fois ni fin d'étape connue : répétitions prévues au plus. */
const OPEN_LIMIT = 2000
export const MAX_ACTIONS = 10

/** Actions d'une répétition (ancien format : le texte de la section, au dernier rang). */
export function repeatActions(section: StepSection): RepeatAction[] {
  if (section.actions?.length) return section.actions
  return section.text ? [{ text: section.text, rank: null }] : []
}

/** Rang de l'action dans la répétition (1 à `every`) ; dernier rang par défaut. */
export function actionRank(action: RepeatAction, every: number): number {
  return action.rank === null ? every : Math.min(Math.max(action.rank, 1), every)
}

export interface PlannedAction {
  row: number
  action: RepeatAction
  /** Numéro de la répétition (1, 2…). */
  count: number
}

export interface PlannedSection {
  section: StepSection
  index: number
  /** Premier et dernier rang (null : inconnus, une section précédente est à régler). */
  start: number | null
  end: number | null
  /** Premier rang de chaque répétition. */
  repeatStarts: number[]
  /** Actions de la répétition, rang par rang. */
  actions: PlannedAction[]
}

/** Rangs de chaque section, à la suite les unes des autres. */
export function planSections(sections: StepSection[], totalRows: number | null): PlannedSection[] {
  let cursor: number | null = 0
  return sections.map((section, index) => {
    const empty = { section, index, repeatStarts: [], actions: [] }
    if (cursor === null) return { ...empty, start: null, end: null }
    const from: number = cursor
    const start = from + 1
    if (section.kind === 'rows') {
      cursor = section.rows === null ? null : from + section.rows
      return { ...empty, start, end: cursor }
    }
    if (section.every === null) {
      cursor = null
      return { ...empty, start, end: null }
    }
    const every = section.every
    const count = section.times ?? Math.floor(((totalRows ?? from + every * OPEN_LIMIT) - from) / every)
    const repeatStarts = Array.from({ length: Math.max(count, 0) }, (_, k) => from + every * k + 1)
    const actions = repeatStarts.flatMap((first, k) =>
      repeatActions(section)
        .map((action) => ({ row: first + actionRank(action, every) - 1, action, count: k + 1 }))
        .sort((a, b) => a.row - b.row),
    )
    // Sans nombre de fois : jusqu'à la fin de l'étape, la suite n'est pas planifiable.
    cursor = section.times === null ? null : from + every * section.times
    return { section, index, start, end: section.times === null ? totalRows : cursor, repeatStarts, actions }
  })
}

export type SectionAlert =
  | { type: 'action'; section: StepSection; action: RepeatAction; count: number; times: number | null }
  | { type: 'start'; section: StepSection }

/** Ce qu'il y a à faire en tricotant le rang `row` : actions d'une répétition, début d'une nouvelle section. */
export function alertsAt(step: Pick<KnitStep, 'sections' | 'totalRows'>, row: number): SectionAlert[] {
  if (row < 1) return []
  const plan = planSections(step.sections, step.totalRows)
  const alerts: SectionAlert[] = []
  for (const p of plan) {
    // Le début de la première section se lit dans la liste ; on annonce les changements ensuite.
    if (p.index > 0 && p.start === row && (p.end === null || p.end >= p.start)) alerts.push({ type: 'start', section: p.section })
  }
  for (const p of plan) {
    for (const a of p.actions) {
      if (a.row === row) alerts.push({ type: 'action', section: p.section, action: a.action, count: a.count, times: p.section.times })
    }
  }
  return alerts
}

/** Section du rang `row` (null si toutes sont faites ou si la suite est à régler). */
export function sectionIndexAt(plan: PlannedSection[], row: number): number | null {
  const current = plan.find((p) => p.start !== null && p.start <= row && (p.end === null || p.end >= row))
  return current ? current.index : null
}

/** Prochain rang (à partir de `row`, le rang à tricoter) où une action de la répétition est à faire. */
export function nextActionRow(planned: PlannedSection, row: number): number | null {
  return planned.actions.find((a) => a.row >= row)?.row ?? null
}

/** Étape en cours : la première non terminée (la dernière si tout est fait). */
export function currentStepIndex(steps: Pick<KnitStep, 'done'>[]): number {
  const index = steps.findIndex((s) => !s.done)
  return index === -1 ? Math.max(steps.length - 1, 0) : index
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « 1 diminution » (au dernier rang, seule), sinon « 1 diminution (1er rang) ». */
function describeActions(section: StepSection): string {
  const actions = repeatActions(section)
  if (actions.length === 1 && actions[0]!.rank === null) return actions[0]!.text
  return actions
    .map((a) => {
      const rank = a.rank === null || (section.every !== null && a.rank >= section.every) ? 'dernier rang' : a.rank === 1 ? '1er rang' : `rang ${a.rank}`
      return `${a.text} (${rank})`
    })
    .join(' + ')
}

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
  return `${describeActions(section)} — ${rhythm}`
}

/** « Rangs 5 à 28 », « Rang 3 », « À partir du rang 29 ». */
export function describeRange(planned: PlannedSection): string | null {
  if (planned.start === null) return null
  if (planned.end === null) return `À partir du rang ${planned.start}`
  if (planned.end < planned.start) return null
  return planned.end === planned.start ? `Rang ${planned.start}` : `Rangs ${planned.start} à ${planned.end}`
}

export interface ActionForm {
  text: string
  /** Rang dans la répétition : « 1 », « 2 »… ou « last ». */
  rank: string
}

export interface SectionForm {
  kind: SectionKind
  text: string
  rows: string
  every: string
  times: string
  actions: ActionForm[]
}

export function sectionToForm(section: StepSection): SectionForm {
  const text = (n: number | null) => (n === null ? '' : String(n))
  const actions = section.kind === 'repeat' ? repeatActions(section).map((a) => ({ text: a.text, rank: a.rank === null ? 'last' : String(a.rank) })) : []
  return {
    kind: section.kind,
    text: section.kind === 'rows' ? section.text : '',
    rows: text(section.rows),
    every: text(section.every),
    times: text(section.times),
    actions: actions.length ? actions : [{ text: '', rank: 'last' }],
  }
}

/** Valeurs du formulaire → section, ou message d'erreur. La mesure du patron est conservée. */
export function formToSection(form: SectionForm, pattern: string | null = null): StepSection | string {
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
    return { kind: 'rows', rows, every: null, times: null, text: form.text.trim().slice(0, 200), pattern }
  }
  const every = parse(form.every, 1, 500)
  const times = parse(form.times, 1, 500)
  if (every === undefined) return 'Répétition : un nombre de rangs entre 1 et 500.'
  if (times === undefined) return 'Nombre de fois : un nombre entier à partir de 1.'
  const actions = form.actions
    .map((a) => ({ text: a.text.trim().slice(0, 200), rank: a.rank === 'last' ? null : Number(a.rank) }))
    .filter((a) => a.text)
    .slice(0, MAX_ACTIONS)
  if (actions.length === 0) return 'Indique quoi faire (ex. « 1 diminution de chaque côté »).'
  if (every !== null && actions.some((a) => a.rank !== null && a.rank > every)) return `Une action est placée après le dernier rang de la répétition (${every}).`
  // Rang = dernier : enregistré comme « dernier », pour suivre un changement du nombre de rangs.
  const normalized = actions.map((a) => (every !== null && a.rank === every ? { ...a, rank: null } : a))
  return { kind: 'repeat', rows: null, every, times, actions: normalized, text: '', pattern }
}

export type ActionEffect = 'decrease' | 'increase' | 'other'

/** Diminution (bord rouge), augmentation (bord bleu) ou autre action, d'après son texte. */
export function actionEffect(text: string): ActionEffect {
  const t = text.toLowerCase()
  if (/dimin|\bdim\b|ensemble/.test(t)) return 'decrease'
  if (/augm|\baug\b/.test(t)) return 'increase'
  return 'other'
}

export interface DotLine {
  /** Rangs de la ligne, dans l'ordre. */
  rows: number[]
  /** Actions de la ligne, par rang. */
  actions: Map<number, RepeatAction[]>
}

/** Lignes de pastilles d'une section : une ligne par fois pour une répétition, une seule pour des rangs. */
export function sectionLines(planned: PlannedSection, row: number): DotLine[] {
  const { section, start } = planned
  if (start === null) return []
  const range = (from: number, to: number) => Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => from + i)
  if (section.kind === 'rows') return planned.end === null ? [] : [{ rows: range(start, planned.end), actions: new Map() }]
  if (section.every === null) return []
  const every = section.every
  // Répétition sans fin connue : jusqu'à deux fois après le rang à tricoter.
  const starts = section.times === null && planned.end === null ? planned.repeatStarts.filter((s) => s <= row + every * 2) : planned.repeatStarts
  return starts.map((first) => {
    const actions = new Map<number, RepeatAction[]>()
    for (const a of planned.actions) if (a.row >= first && a.row < first + every) actions.set(a.row, [...(actions.get(a.row) ?? []), a.action])
    return { rows: range(first, first + every - 1), actions }
  })
}
