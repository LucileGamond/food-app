// « Patron adapté à moi » (module Tricot) : mailles, rangs et sections des étapes recalculés pour l'échantillon de la
// tricoteuse et ses retouches (« 5 cm de plus aux manches »). Rien n'est enregistré ici : l'application montre
// l'avant / après, et garde le patron d'origine.

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { MAX_INSTRUCTIONS, MAX_STEPS, sanitizeSection, TOOL as PATTERN_TOOL, type Gauge, type PatternSection } from './pattern.ts'

export const MAX_REQUEST = 1000

export interface AdaptStep {
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  sections: PatternSection[]
}

export interface AdaptInput {
  /** Retouches voulues, en texte libre (peut être vide : échantillon seul). */
  request: string
  size: string
  patternGauge: Gauge
  myGauge: Gauge
  steps: AdaptStep[]
}

/** Étape adaptée : seulement celles qui changent, repérées par leur position. */
export interface AdaptedStep {
  index: number
  totalRows: number | null
  stitches: number | null
  sections: PatternSection[]
  /** Ce qui change, en une phrase (« 6 rangs de plus pour 2 cm »). */
  note: string
}

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const int = (value: unknown, min: number, max: number) => (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null)
const gauge = (value: unknown): Gauge => {
  const g = asRecord(value)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 100 ? v : null)
  return { stitches: n(g.stitches), rows: n(g.rows) }
}

/** Corps { adapt: { request, size, pattern_gauge, my_gauge, steps } } ; null si ce n'est pas une adaptation. */
export function parseAdaptInput(body: unknown): AdaptInput | null {
  const data = asRecord(body)
  if (!('adapt' in data)) return null
  const a = asRecord(data.adapt)
  const steps = (Array.isArray(a.steps) ? a.steps : []).slice(0, MAX_STEPS).map((value) => {
    const s = asRecord(value)
    return {
      title: str(s.title, 200),
      instructions: str(s.instructions, MAX_INSTRUCTIONS),
      totalRows: int(s.total_rows, 1, 5000),
      stitches: int(s.stitches, 1, 5000),
      sections: (Array.isArray(s.sections) ? s.sections : []).map(sanitizeSection).filter((r): r is PatternSection => r !== null).slice(0, 30),
    }
  })
  if (steps.length === 0) throw new HttpError('Aucune étape à adapter.', 400)
  const input = { request: str(a.request, MAX_REQUEST), size: str(a.size, 40), patternGauge: gauge(a.pattern_gauge), myGauge: gauge(a.my_gauge), steps }
  const gaugeGiven = (input.patternGauge.stitches !== null && input.myGauge.stitches !== null) || (input.patternGauge.rows !== null && input.myGauge.rows !== null)
  if (!input.request && !gaugeGiven) throw new HttpError('Indique ton échantillon ou ce que tu veux changer.', 400)
  return input
}

const STEP_SCHEMA = (PATTERN_TOOL.input_schema as { properties: { steps: { items: { properties: Record<string, unknown> } } } }).properties.steps.items.properties

export const ADAPT_TOOL: Tool = {
  name: 'enregistrer_adaptation',
  description: 'Enregistre les étapes adaptées (seulement celles qui changent).',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'Numéro de l’étape (0 = première), comme dans la liste reçue.' },
            total_rows: STEP_SCHEMA.total_rows,
            stitches: STEP_SCHEMA.stitches,
            sections: STEP_SCHEMA.sections,
            note: { type: 'string', description: 'Ce qui change pour cette étape, en une phrase courte (« 6 rangs de plus aux manches, 4 diminutions au lieu de 3 »).' },
          },
          required: ['index', 'total_rows', 'stitches', 'sections', 'note'],
        },
      },
    },
    required: ['steps'],
  },
}

const SYSTEM = [
  'Tu adaptes un patron de tricot pour une tricoteuse : son échantillon peut différer de celui du patron, et elle peut demander des retouches.',
  'Pour chaque étape concernée, recalcule le nombre de mailles à la fin, le nombre de rangs et les sections (rangs sans répétition, actions répétées),',
  'en gardant la forme du vêtement : mailles × (son échantillon en mailles / celui du patron), rangs × (son échantillon en rangs / celui du patron),',
  'puis applique les retouches (une longueur en cm se convertit en rangs avec son échantillon en rangs pour 10 cm).',
  'Répartis les augmentations et diminutions régulièrement et garde des nombres de mailles cohérents avec le motif (multiples, côtes).',
  'Ne renvoie que les étapes qui changent ; garde le même nombre de sections quand c’est possible ; note en une phrase ce qui change.',
].join('\n')

function describeGauge(g: Gauge): string {
  return `${g.stitches ?? '?'} mailles et ${g.rows ?? '?'} rangs pour 10 cm`
}

function describeStep(step: AdaptStep, index: number): string {
  return [
    `Étape ${index} : ${step.title || 'sans titre'}`,
    `Rangs : ${step.totalRows ?? 'inconnu'} · mailles à la fin : ${step.stitches ?? 'inconnu'}`,
    `Sections : ${JSON.stringify(step.sections)}`,
    step.instructions ? `Texte :\n${step.instructions}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Étapes adaptées, bornées : index parmi celles reçues, une seule fois chacune. */
export function sanitizeAdapted(raw: unknown, stepCount: number): AdaptedStep[] {
  const seen = new Set<number>()
  return (Array.isArray(asRecord(raw).steps) ? (asRecord(raw).steps as unknown[]) : []).flatMap((value): AdaptedStep[] => {
    const s = asRecord(value)
    const index = int(s.index, 0, stepCount - 1)
    if (index === null || seen.has(index)) return []
    seen.add(index)
    return [
      {
        index,
        totalRows: int(s.total_rows, 1, 5000),
        stitches: int(s.stitches, 1, 5000),
        sections: (Array.isArray(s.sections) ? s.sections : []).map(sanitizeSection).filter((r): r is PatternSection => r !== null).slice(0, 30),
        note: str(s.note, 300),
      },
    ]
  })
}

export async function adaptPattern(input: AdaptInput, options: ModelOptions): Promise<{ steps: AdaptedStep[]; usage: ModelUsage | null }> {
  const message = [
    input.size ? `Taille suivie : ${input.size}` : null,
    `Échantillon du patron : ${describeGauge(input.patternGauge)}`,
    `Échantillon de la tricoteuse : ${describeGauge(input.myGauge)}`,
    `Retouches demandées : ${input.request || 'aucune (échantillon seulement)'}`,
    input.steps.map(describeStep).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
  const { input: raw, usage } = await callTool(
    { system: SYSTEM, tool: ADAPT_TOOL, message, maxTokens: 16_000, failure: 'L’adaptation a échoué', missing: 'pas d’adaptation', timeoutMs: 120_000 },
    options,
  )
  const steps = sanitizeAdapted(raw, input.steps.length)
  if (steps.length === 0) throw new HttpError('Rien à changer : ton échantillon et tes retouches donnent le même patron.', 422)
  return { steps, usage }
}
