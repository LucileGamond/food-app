// Module Tricot : étapes d'un patron, rangs comptés et sections de l'étape.
//
// Une étape est une suite de sections, tricotées dans l'ordre :
//   « 4 rangs jersey », puis « 1 diminution tous les 6 rangs (4 fois) », puis « 10 rangs »…
// Une répétition peut porter plusieurs actions, chacune sur un rang de la répétition (1er, dernier…).
// Les rangs de chaque section se calculent à la suite (rangs 1 à 4, puis 5 à 28…).
// « En même temps » : une section peut démarrer à un rang donné (`at`) au lieu de suivre la précédente ; elle ouvre
// une piste qui avance en parallèle des autres, et les sections suivantes s'enchaînent derrière elle.
// Le compteur compte les rangs terminés : ce qui est annoncé concerne le rang à tricoter (rangs faits + 1).

import type { SizeChart } from './sizing'
import type { Adaptation } from './adapt'
import type { ChartHint, KnitChart } from './chart'
import type { Abbreviation } from './glossary'
import type { Highlights } from './sizes'
import type { Gauge, Yarn } from './yarn'
import type { YarnCheck } from './yarnLeft'
import { formatCm, parseMeasure } from './measure'

export type SectionKind = 'rows' | 'repeat'

/** Action d'une répétition, placée sur un rang de la répétition. */
export interface RepeatAction {
  text: string
  /** Rang dans la répétition (1 = premier) ; null = dernier rang. */
  rank: number | null
  /** Mailles ajoutées (+) ou retirées (−) à chaque fois ; absent : pas connu (deviné d'après le texte). */
  stitches?: number
}

/** Effet d'une action sur les mailles, au plus. */
export const MAX_ACTION_STITCHES = 200

/** Rangs calculés depuis une mesure du patron (« 5 cm ») avec l'échantillon, pas encore validés. */
export interface MeasuredRows {
  /** Rangs pour 10 cm de l'échantillon utilisé. */
  rowsPer10: number
  /** Échantillon de la tricoteuse, ou celui du patron. */
  source: 'mine' | 'pattern'
}

/** Début d'une section « en même temps » : un rang de l'étape, ou une hauteur du patron à convertir. */
export interface SectionStart {
  /** Rang de l'étape où la section commence (1 = premier) ; null : à régler (hauteur en cm). */
  row: number | null
  /** Hauteur écrite dans le patron, depuis le début de l'étape (« 15 cm »). */
  pattern: string | null
  /** Rang calculé depuis la hauteur avec l'échantillon, pas encore validé. */
  measured?: MeasuredRows
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
  /** Rangs (ou rythme) calculés depuis la mesure avec l'échantillon, à vérifier ; absent : réglés ou validés. */
  measured?: MeasuredRows
  /** « En même temps » : la section commence à ce rang, en parallèle ; absent : à la suite de la précédente. */
  at?: SectionStart
  /** Texte du patron de cette sous-étape : il la suit quand on regroupe, sépare ou déplace les étapes. */
  source?: string
}

export const MAX_SECTIONS = 30
/** Texte d'une étape, au plus (comme en base). */
export const MAX_INSTRUCTIONS = 20000
/** Rangs comptés dans une étape, au plus (comme en base). */
export const MAX_ROW_COUNT = 5000

export interface KnitStep {
  id: string
  position: number
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  sections: StepSection[]
  /** Rangs faits, pour la fois en cours. */
  rowCount: number
  /** Nombre de fois où l'étape se tricote (2 : les deux manches), et la fois en cours (1 = la première). */
  times: number
  pass: number
  notes: string
  /** Toutes les fois sont faites. */
  done: boolean
  /** Surlignage des nombres corrigé à la main, par taille. */
  highlights: Highlights
  /** Traduction en français du texte (patron en anglais), nombres inchangés ; null si pas traduit. */
  translation?: string | null
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
  /** Tailles du patron, dans l'ordre, et celle dont les nombres sont mis en valeur dans le texte des étapes. */
  sizes: string[]
  sizeIndex: number | null
  pdfPath: string | null
  steps: KnitStep[]
  /** Diagrammes du patron, chacun rattaché (ou non) à une étape. */
  charts: KnitChart[]
  /** Diagrammes repérés à la lecture du patron, proposés à l'ajout depuis le PDF. */
  chartHints: ChartHint[]
  /** Abréviations expliquées par le patron (sa légende). */
  abbreviations?: Abbreviation[]
  /** Dernière pesée de la laine principale (« assez de laine pour finir ? »). */
  yarnChecks?: YarnCheck[]
  yarns: Yarn[]
  /** Échantillon du patron (lu avec le patron, ou saisi) et celui de la tricoteuse. */
  patternGauge: Gauge
  myGauge: Gauge
  /** « Patron adapté à moi » (facultatif) : étapes recalculées, le patron d'origine reste tel quel. */
  adaptation?: Adaptation | null
}

/** Étape telle que lue dans le patron (avant enregistrement). */
export type PatternStep = Pick<KnitStep, 'title' | 'instructions' | 'totalRows' | 'stitches' | 'sections'> & {
  /** Nombre de fois où l'étape se tricote (2 : les deux manches) ; absent : 1. */
  times?: number
}

export interface ReadPattern {
  title: string
  sizes: string[]
  /** Position de la taille choisie dans `sizes` (0 = première). */
  sizeIndex?: number | null
  steps: PatternStep[]
  /** Échantillon indiqué dans le patron, s'il y en a un. */
  gauge?: Gauge | null
  /** Diagrammes repérés (page du PDF, calage proposé). */
  charts?: ChartHint[]
  /** Abréviations expliquées par le patron. */
  abbreviations?: Abbreviation[]
  /** Tableau des mesures par taille, pour conseiller une taille selon ses mesures. */
  sizeChart?: SizeChart | null
  /** Parties du patron annoncées mais pas lues (lecture arrêtée en route) : à relire. */
  missingParts?: string[]
}

/** Parties pas lues, telles que renvoyées par la lecture (textes non vides seulement). */
export function readMissingParts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').slice(0, 20) : []
}

function sanitizeMeasured(value: unknown): MeasuredRows | null {
  if (typeof value !== 'object' || value === null) return null
  const { rowsPer10, source } = value as Record<string, unknown>
  return typeof rowsPer10 === 'number' && rowsPer10 > 0 && rowsPer10 <= 100 && (source === 'mine' || source === 'pattern') ? { rowsPer10, source } : null
}

/** Section à régler : son nombre de rangs (ou son rythme), ou son rang de début « en même temps », n'est pas connu. */
export function isToSet(section: StepSection): boolean {
  return (section.kind === 'rows' ? section.rows : section.every) === null || section.at?.row === null
}

/** Sections lues en base : seules celles bien formées sont gardées (une donnée abîmée ne fait pas planter l'écran). */
export function sanitizeSections(raw: unknown): StepSection[] {
  if (!Array.isArray(raw)) return []
  const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : null)
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '')
  return raw.flatMap((value): StepSection[] => {
    if (typeof value !== 'object' || value === null) return []
    const s = value as Record<string, unknown>
    if (s.kind !== 'rows' && s.kind !== 'repeat') return []
    const section: StepSection = {
      kind: s.kind,
      rows: count(s.rows, 2000),
      every: count(s.every, 500),
      times: count(s.times, 500),
      text: text(s.text),
      pattern: typeof s.pattern === 'string' ? s.pattern.slice(0, 100) : null,
    }
    const measured = sanitizeMeasured(s.measured)
    if (measured) section.measured = measured
    if (typeof s.source === 'string' && s.source.trim()) section.source = s.source.slice(0, MAX_INSTRUCTIONS)
    if (typeof s.at === 'object' && s.at !== null) {
      const a = s.at as Record<string, unknown>
      const at: SectionStart = { row: count(a.row, 5000), pattern: typeof a.pattern === 'string' && a.pattern.trim() ? a.pattern.slice(0, 100) : null }
      const atMeasured = sanitizeMeasured(a.measured)
      if (atMeasured) at.measured = atMeasured
      // Début sans rang ni hauteur : la section suit la précédente.
      if (at.row !== null || at.pattern !== null) section.at = at
    }
    if (Array.isArray(s.actions)) {
      section.actions = s.actions
        .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && typeof a.text === 'string' && a.text.trim() !== '')
        .slice(0, MAX_ACTIONS)
        .map((a) => {
          const stitches = a.stitches
          const known = typeof stitches === 'number' && Number.isInteger(stitches) && Math.abs(stitches) <= MAX_ACTION_STITCHES
          return { text: text(a.text), rank: count(a.rank, 500), ...(known ? { stitches } : {}) }
        })
    }
    return [section]
  })
}

export const MAX_PDF_BYTES = 20 * 1024 * 1024
/** Répétition sans nombre de fois ni fin d'étape connue : répétitions prévues au plus. */
const OPEN_LIMIT = 2000
export const MAX_ACTIONS = 10

/** Actions d'une répétition (ancien format : le texte de la section, au dernier rang). */
function repeatActions(section: StepSection): RepeatAction[] {
  if (section.actions?.length) return section.actions
  return section.text ? [{ text: section.text, rank: null }] : []
}

/** Rang de l'action dans la répétition (1 à `every`) ; dernier rang par défaut. */
function actionRank(action: RepeatAction, every: number): number {
  return action.rank === null ? every : Math.min(Math.max(action.rank, 1), every)
}

interface PlannedAction {
  row: number
  action: RepeatAction
  /** Numéro de la répétition (1, 2…). */
  count: number
}

export interface PlannedSection {
  section: StepSection
  index: number
  /** Commence « en même temps » que d'autres, à un rang donné. */
  parallel: boolean
  /** Premier et dernier rang (null : inconnus, une section précédente est à régler). */
  start: number | null
  end: number | null
  /** Premier rang de chaque répétition. */
  repeatStarts: number[]
  /** Actions de la répétition, rang par rang. */
  actions: PlannedAction[]
}

/** Rangs de chaque section, à la suite les unes des autres ; une section « en même temps » repart de son rang de début. */
export function planSections(sections: StepSection[], totalRows: number | null): PlannedSection[] {
  let cursor: number | null = 0
  return sections.map((section, index) => {
    if (section.at) cursor = section.at.row === null ? null : section.at.row - 1
    const empty = { section, index, parallel: !!section.at, repeatStarts: [], actions: [] }
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
    return { ...empty, start, end: section.times === null ? totalRows : cursor, repeatStarts, actions }
  })
}

/** Sections en cours au rang `row` (plusieurs avec « en même temps »), dans l'ordre. */
export function sectionIndicesAt(plan: PlannedSection[], row: number): number[] {
  return plan.filter((p) => p.start !== null && p.start <= row && (p.end === null || p.end >= row)).map((p) => p.index)
}

/** Première section du rang `row` (null si toutes sont faites ou si la suite est à régler). */
export function sectionIndexAt(plan: PlannedSection[], row: number): number | null {
  return sectionIndicesAt(plan, row)[0] ?? null
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

/** « (≈ 5 cm) » pour des rangs calculés depuis une mesure du patron, pas encore validés. */
function measuredHint(section: StepSection): string {
  const cm = section.measured ? parseMeasure(section.pattern) : null
  return cm === null ? '' : ` (≈ ${formatCm(cm)})`
}

/**
 * « 4 rangs : jersey », « 1 diminution — tous les 6 rangs (4 fois) », « 1 diminution — tous les 5 cm (rangs à régler) » ;
 * rangs calculés depuis une mesure : « 15 rangs (≈ 5 cm) : jersey ».
 */
export function describeSection(section: StepSection): string {
  return `${describeStart(section)}${describeBody(section)}`
}

/** « En même temps, dès le rang 46 : », « En même temps, à 15 cm (à régler) : » ; vide pour une section à la suite. */
function describeStart(section: StepSection): string {
  const at = section.at
  if (!at) return ''
  if (at.row === null) return `En même temps, ${at.pattern ? `à ${at.pattern.replace(/^à\s+/i, '')}` : 'à un rang'} (à régler) : `
  const cm = at.measured ? parseMeasure(at.pattern) : null
  return `En même temps, dès le rang ${at.row}${cm === null ? '' : ` (≈ ${formatCm(cm)})`} : `
}

function describeBody(section: StepSection): string {
  if (section.kind === 'rows') {
    const rows = section.rows === null ? `${section.pattern ?? 'Rangs'} (à régler)` : `${plural(section.rows, 'rang')}${measuredHint(section)}`
    return section.text ? `${rows} : ${section.text}` : `${rows} sans répétition`
  }
  const rhythm =
    section.every === null
      ? `${section.pattern ?? 'intervalle'} (rangs à régler)`
      : `${section.every === 1 ? 'à chaque rang' : `tous les ${section.every} rangs`}${measuredHint(section)}${section.times !== null ? ` (${section.times} fois)` : ''}`
  return `${describeActions(section)} — ${rhythm}`
}

/** « Rangs 5 à 28 », « Rang 3 », « À partir du rang 29 ». */
export function describeRange(planned: PlannedSection): string | null {
  if (planned.start === null) return null
  if (planned.end === null) return `À partir du rang ${planned.start}`
  if (planned.end < planned.start) return null
  return planned.end === planned.start ? `Rang ${planned.start}` : `Rangs ${planned.start} à ${planned.end}`
}

interface ActionForm {
  text: string
  /** Rang dans la répétition : « 1 », « 2 »… ou « last ». */
  rank: string
  /** Mailles ajoutées ou retirées à chaque fois : « -2 », « +1 », « 0 » ; vide : pas connu. */
  stitches: string
}

/** « -2 », « −2 », « +1 », « 0 » → nombre ; vide → null ; sinon undefined. */
export function parseStitches(value: string): number | null | undefined {
  const t = value.trim().replace('−', '-').replace(/^\+/, '')
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) && Math.abs(n) <= MAX_ACTION_STITCHES ? n : undefined
}

/** −2 → « -2 », 1 → « +1 », 0 → « 0 ». */
export const formatStitches = (n: number): string => (n > 0 ? `+${n}` : String(n))

export interface SectionForm {
  kind: SectionKind
  /** À la suite de la section précédente, ou « en même temps » à partir d'un rang. */
  start: 'after' | 'at'
  /** Rang de début (« en même temps »). */
  atRow: string
  text: string
  rows: string
  every: string
  times: string
  actions: ActionForm[]
}

export function sectionToForm(section: StepSection): SectionForm {
  const text = (n: number | null) => (n === null ? '' : String(n))
  const actions = section.kind === 'repeat' ? repeatActions(section).map((a) => ({ text: a.text, rank: a.rank === null ? 'last' : String(a.rank), stitches: a.stitches === undefined ? '' : formatStitches(a.stitches) })) : []
  return {
    kind: section.kind,
    start: section.at ? 'at' : 'after',
    atRow: text(section.at?.row ?? null),
    text: section.kind === 'rows' ? section.text : '',
    rows: text(section.rows),
    every: text(section.every),
    times: text(section.times),
    actions: actions.length ? actions : [{ text: '', rank: 'last', stitches: '' }],
  }
}

/**
 * Valeurs du formulaire → section, ou message d'erreur. Les mesures du patron (longueur, hauteur de début) sont
 * conservées ; les nombres saisis sont validés (plus de calcul à vérifier).
 */
export function formToSection(form: SectionForm, pattern: string | null = null, atPattern: string | null = null): StepSection | string {
  const parse = (value: string, min: number, max: number): number | null | undefined => {
    if (!value.trim()) return null
    const n = Number(value.trim())
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined
  }
  let at: { at: SectionStart } | Record<string, never> = {}
  if (form.start === 'at') {
    const row = parse(form.atRow, 1, MAX_ROW_COUNT)
    if (row === undefined) return `Rang de début : un nombre entier entre 1 et ${MAX_ROW_COUNT}.`
    // Sans rang : seulement pour une hauteur du patron encore à convertir (« à 15 cm »).
    if (row === null && !atPattern) return 'Indique le rang où cette sous-étape commence.'
    at = { at: { row, pattern: atPattern } }
  }
  const section = formToBody(form, pattern, parse)
  return typeof section === 'string' ? section : { ...section, ...at }
}

function formToBody(form: SectionForm, pattern: string | null, parse: (value: string, min: number, max: number) => number | null | undefined): StepSection | string {
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
  if (times === undefined) return 'Nombre de fois : un nombre entier entre 1 et 500.'
  const filled = form.actions.filter((a) => a.text.trim()).slice(0, MAX_ACTIONS)
  if (filled.some((a) => parseStitches(a.stitches) === undefined)) return `Mailles : un nombre entier entre -${MAX_ACTION_STITCHES} et ${MAX_ACTION_STITCHES} (ex. -2 pour 1 diminution de chaque côté).`
  const actions: RepeatAction[] = filled.map((a) => {
    const stitches = parseStitches(a.stitches)
    return { text: a.text.trim().slice(0, 200), rank: a.rank === 'last' ? null : Number(a.rank), ...(typeof stitches === 'number' ? { stitches } : {}) }
  })
  if (actions.length === 0) return 'Indique quoi faire (ex. « 1 diminution de chaque côté »).'
  if (every === null && !pattern) return 'Indique tous les combien de rangs.'
  if (every !== null && actions.some((a) => a.rank !== null && a.rank > every)) return `Une action est placée après le dernier rang de la répétition (${every}).`
  // Rang = dernier : enregistré comme « dernier », pour suivre un changement du nombre de rangs.
  const normalized = actions.map((a) => (every !== null && a.rank === every ? { ...a, rank: null } : a))
  return { kind: 'repeat', rows: null, every, times, actions: normalized, text: '', pattern }
}

type ActionEffect = 'decrease' | 'increase' | 'other'

/** Diminution, augmentation ou autre action, d'après son texte. */
export function actionEffect(text: string): ActionEffect {
  const t = text.toLowerCase()
  if (/dimin|\bdim\b|ensemble|\bens\b/.test(t)) return 'decrease'
  if (/augm|\baug\b/.test(t)) return 'increase'
  return 'other'
}

/** Ce qu'on sait d'une étape, dans le même ordre partout : « 80 rangs », « à tricoter 2 fois », « 56 mailles à la fin ». */
export function stepFacts(step: { totalRows: number | null; stitches: number | null; times?: number }): string[] {
  return [
    step.totalRows !== null && `${step.totalRows} rang${step.totalRows > 1 ? 's' : ''}`,
    (step.times ?? 1) > 1 && `à tricoter ${step.times} fois`,
    step.stitches !== null && `${step.stitches} maille${step.stitches > 1 ? 's' : ''} à la fin`,
  ].filter((f): f is string => !!f)
}
