// « Patron adapté à moi » (facultatif) : étapes recalculées pour l'échantillon de la tricoteuse et ses retouches.
// Le patron d'origine reste tel quel ; l'adaptation se superpose aux étapes quand elle est active.

import { sanitizeSections, type KnitStep, type StepSection } from './pattern'

export const ADAPT_REQUEST_MAX = 1000

/** Étape adaptée : rangs, mailles et sections remplacent ceux du patron d'origine. */
export interface AdaptedStep {
  stepId: string
  totalRows: number | null
  stitches: number | null
  sections: StepSection[]
  /** Ce qui change (« 16 rangs de plus pour 5 cm »). */
  note: string
}

export interface Adaptation {
  /** Retouches demandées (vide : échantillon seulement). */
  request: string
  /** L'écran suit le patron adapté (sinon celui d'origine). */
  active: boolean
  at: string
  steps: AdaptedStep[]
}

/** Étape affichée : celle du patron, avec l'adaptation si elle est suivie. */
export type ShownStep = KnitStep & { adapted?: { note: string; original: Pick<KnitStep, 'totalRows' | 'stitches' | 'sections'> } }

const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null)
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Adaptation lue en base (null si absente ou abîmée). */
export function sanitizeAdaptation(raw: unknown): Adaptation | null {
  const a = record(raw)
  if (typeof a.active !== 'boolean' || !Array.isArray(a.steps)) return null
  const steps = a.steps.flatMap((value): AdaptedStep[] => {
    const s = record(value)
    if (typeof s.step_id !== 'string') return []
    return [{ stepId: s.step_id, totalRows: count(s.total_rows), stitches: count(s.stitches), sections: sanitizeSections(s.sections), note: typeof s.note === 'string' ? s.note.slice(0, 300) : '' }]
  })
  if (steps.length === 0) return null
  return { request: typeof a.request === 'string' ? a.request.slice(0, ADAPT_REQUEST_MAX) : '', active: a.active, at: typeof a.at === 'string' ? a.at : '', steps }
}

/** Adaptation telle qu'enregistrée en base. */
export function adaptationToJson(adaptation: Adaptation) {
  return {
    request: adaptation.request,
    active: adaptation.active,
    at: adaptation.at,
    steps: adaptation.steps.map((s) => ({ step_id: s.stepId, total_rows: s.totalRows, stitches: s.stitches, sections: s.sections, note: s.note })),
  }
}

/** Étapes à suivre : adaptées si l'adaptation est active, sinon celles du patron d'origine. */
export function applyAdaptation(steps: KnitStep[], adaptation: Adaptation | null | undefined): ShownStep[] {
  if (!adaptation?.active) return steps
  const byId = new Map(adaptation.steps.map((s) => [s.stepId, s]))
  return steps.map((step) => {
    const a = byId.get(step.id)
    if (!a) return step
    return {
      ...step,
      totalRows: a.totalRows,
      stitches: a.stitches,
      sections: a.sections,
      adapted: { note: a.note, original: { totalRows: step.totalRows, stitches: step.stitches, sections: step.sections } },
    }
  })
}

/** Sections modifiées à la main sur une étape adaptée : enregistrées dans l'adaptation. */
export function withAdaptedSections(adaptation: Adaptation, stepId: string, sections: StepSection[]): Adaptation {
  return { ...adaptation, steps: adaptation.steps.map((s) => (s.stepId === stepId ? { ...s, sections } : s)) }
}

/** « 120 → 136 rangs · 60 → 66 mailles » : ce qui change en nombres (rien si identique). */
export function describeChange(before: Pick<KnitStep, 'totalRows' | 'stitches'>, after: Pick<AdaptedStep, 'totalRows' | 'stitches'>): string {
  const part = (a: number | null, b: number | null, unit: string) => (a === b ? null : `${a ?? '?'} → ${b ?? '?'} ${unit}`)
  return [part(before.totalRows, after.totalRows, 'rangs'), part(before.stitches, after.stitches, 'mailles')].filter(Boolean).join(' · ')
}
