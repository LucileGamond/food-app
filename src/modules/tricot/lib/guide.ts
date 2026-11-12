// Module Tricot : guide du rang (mode tricoter).
//
// Ce qu'il y a à faire sur le rang à tricoter, et ce qui arrive ensuite. Le guide assemble des sources
// indépendantes (sections de l'étape, fin de l'étape…) : une nouvelle source (sections « en même temps »,
// mailles…) s'ajoute sans toucher aux autres. Les diagrammes ne sont pas des événements : ils accompagnent
// chaque rang (rang du diagramme, sens de lecture) sans encombrer « Ensuite ».
//
// Comme le compteur, le guide parle du rang à tricoter : rangs faits + 1.

import { chartPosition, chartRows, type ChartPosition, type KnitChart } from './chart'
import { describeSection, isToSet, planSections, sectionIndicesAt, type StepSection } from './pattern'

/** Ce qui se passe sur un rang. */
export type GuideEvent =
  /** Action d'une répétition : « 1 diminution de chaque côté » (3e fois sur 8). */
  | { kind: 'action'; text: string; count: number; times: number | null }
  /** Début d'une section : « 10 rangs : côtes 1/1 ». */
  | { kind: 'section'; text: string }
  /** Section à régler (« tous les 5 cm ») : la suite de l'étape n'est pas connue. */
  | { kind: 'to-set'; text: string }
  /** Dernier rang de l'étape, et l'étape suivante. */
  | { kind: 'step-end'; next: string | null }

/** Une source de ce qu'il y a à faire, rang par rang. */
export interface GuideSource {
  /** Événements du rang `row` de l'étape, dans l'ordre où les lire. */
  eventsAt(row: number): GuideEvent[]
  /** Ce qu'on tricote en ce moment, sans action particulière (« 10 rangs : jersey »), si la source le sait. */
  contextAt?(row: number): string | null
  /** Premier rang dont la suite n'est pas connue (section à régler), sinon null. */
  readonly unknownFrom: number | null
}

/** Diagramme rattaché à l'étape, et où il en est au rang guidé. */
export interface ChartAt {
  chart: KnitChart
  position: ChartPosition
}

export interface RowGuide {
  row: number
  events: GuideEvent[]
  /** Section en cours (« 1 diminution — tous les 2 rangs (8 fois) »). */
  context: string | null
  /** Diagrammes à suivre sur ce rang : en cours, à venir, ou juste terminés. */
  charts: ChartAt[]
  /** Rang au-delà d'une section à régler : on ne peut rien annoncer. */
  unknown: boolean
}

export interface Upcoming {
  row: number
  /** Dans combien de rangs (1 = le rang d'après). */
  inRows: number
  events: GuideEvent[]
}

export interface Guide {
  at(row: number): RowGuide
  /** Prochains rangs qui demandent quelque chose, après `row` ; s'arrête à une section à régler et à la fin de l'étape. */
  upcoming(row: number, limit?: number): Upcoming[]
}

/** Nombre d'événements montrés dans « Ensuite ». */
export const UPCOMING_LIMIT = 5
/** Rangs parcourus au plus pour trouver la suite (étape sans nombre de rangs). */
const LOOKAHEAD = 2000

/**
 * Sections de l'étape, tricotées l'une après l'autre ; une section « en même temps » ouvre une piste parallèle.
 * Une section à régler annonce la suite inconnue à partir de son début (dès le 1er rang si c'est son début qui
 * est à régler : on ne sait pas quand elle arrive).
 */
export function sectionSource(sections: StepSection[], totalRows: number | null): GuideSource {
  const plan = planSections(sections, totalRows)
  const byRow = new Map<number, GuideEvent[]>()
  const add = (row: number, event: GuideEvent) => byRow.set(row, [...(byRow.get(row) ?? []), event])
  let unknownFrom = Infinity
  for (const p of plan) {
    if (isToSet(p.section)) {
      const from = p.start ?? (p.section.at?.row === null ? 1 : null)
      if (from === null) continue
      add(from, { kind: 'to-set', text: describeSection(p.section) })
      unknownFrom = Math.min(unknownFrom, from)
      continue
    }
    // Section derrière une section à régler : ses rangs ne sont pas connus.
    if (p.start === null || (p.end !== null && p.end < p.start)) continue
    add(p.start, { kind: 'section', text: describeSection(p.section) })
    for (const a of p.actions) add(a.row, { kind: 'action', text: a.action.text, count: a.count, times: p.section.times })
  }
  return {
    unknownFrom: unknownFrom === Infinity ? null : unknownFrom,
    eventsAt: (row) => byRow.get(row) ?? [],
    contextAt: (row) => {
      const indices = sectionIndicesAt(plan, row)
      return indices.length ? indices.map((i) => describeSection(plan[i]!.section)).join(' · ') : null
    },
  }
}

/** Dernier rang de l'étape (si son nombre de rangs est connu). */
export function stepEndSource(totalRows: number | null, next: string | null): GuideSource {
  return { unknownFrom: null, eventsAt: (row) => (totalRows !== null && row === totalRows ? [{ kind: 'step-end', next }] : []) }
}

/** Diagrammes du rang : en cours ou à venir ; un diagramme fini n'est rappelé qu'au rang qui suit sa fin. */
export function chartsAt(charts: KnitChart[], row: number): ChartAt[] {
  return charts.flatMap((chart): ChartAt[] => {
    const position = chartPosition(chart, row)
    if (position.kind !== 'after') return [{ chart, position }]
    return row === chart.startRow + chartRows(chart) ? [{ chart, position }] : []
  })
}

export function createGuide({ sources, charts = [], totalRows }: { sources: GuideSource[]; charts?: KnitChart[]; totalRows: number | null }): Guide {
  const unknownFrom = Math.min(...sources.map((s) => s.unknownFrom ?? Infinity))
  const eventsAt = (row: number) => sources.flatMap((s) => s.eventsAt(row))
  return {
    at: (row) => ({
      row,
      events: eventsAt(row),
      context: sources.map((s) => s.contextAt?.(row) ?? null).find((c) => c !== null) ?? null,
      charts: chartsAt(charts, row),
      unknown: row > unknownFrom,
    }),
    upcoming: (row, limit = UPCOMING_LIMIT) => {
      const last = Math.min(totalRows ?? Infinity, unknownFrom, row + LOOKAHEAD)
      const found: Upcoming[] = []
      for (let r = row + 1; r <= last && found.length < limit; r++) {
        const events = eventsAt(r)
        if (events.length) found.push({ row: r, inRows: r - row, events })
      }
      return found
    },
  }
}

/** Guide d'une étape : ses sections, sa fin, ses diagrammes. */
export function stepGuide(step: { sections: StepSection[]; totalRows: number | null }, charts: KnitChart[], nextTitle: string | null): Guide {
  return createGuide({
    sources: [sectionSource(step.sections, step.totalRows), stepEndSource(step.totalRows, nextTitle)],
    charts,
    totalRows: step.totalRows,
  })
}

/** « 1 diminution (3/8) », « 1 diminution (8/8, dernière fois) », « Nouvelle sous-étape : … », « Dernier rang de l'étape ». */
export function describeEvent(event: GuideEvent): string {
  switch (event.kind) {
    case 'action':
      if (event.times === null) return `${event.text} (${event.count === 1 ? '1re' : `${event.count}e`} fois)`
      return `${event.text} (${event.count}/${event.times}${event.count === event.times ? ', dernière fois' : ''})`
    case 'section':
      return `Nouvelle sous-étape : ${event.text}`
    case 'to-set':
      return `À régler avant de continuer : ${event.text}`
    case 'step-end':
      return event.next ? `Dernier rang de l’étape, ensuite : ${event.next}` : 'Dernier rang de l’étape, et du projet'
  }
}
