// Module Tricot : « assez de laine pour finir ? » d'après une pesée de chaque laine du projet (un coloris = une laine).
//
// On pèse tout ce qui reste d'une laine (pelote entamée et pelotes entières). Avec le métrage d'une pelote
// et son poids, on en déduit les mètres restants ; avec les pelotes de départ, les mètres déjà tricotés. Rapportés au
// travail déjà fait (rangs, pondérés par les mailles quand elles sont connues), ils donnent ce qu'il faut pour finir.

import type { KnitStep } from './pattern'
import type { Yarn } from './yarn'

/**
 * Pesée enregistrée d'une laine (sa place dans les laines du projet) : grammes restants, et travail fait à ce
 * moment-là (en rangs, comme le compteur).
 */
export interface YarnCheck {
  yarn: number
  grams: number
  rowsDone: number
  at: string
}

/** Marge sous laquelle c'est juste : 10 % de ce qu'il reste à tricoter. */
export const TIGHT_MARGIN = 0.1

type Step = Pick<KnitStep, 'totalRows' | 'stitches' | 'rowCount' | 'done'>

/** Rangs faits : le compteur, ou tous les rangs d'une étape terminée. */
function rowsDoneIn(step: Step): number {
  return step.done && step.totalRows !== null ? Math.max(step.totalRows, step.rowCount) : step.rowCount
}

/** Rangs faits sur tout le projet (enregistrés avec une pesée). */
export function projectRowsDone(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + rowsDoneIn(s), 0)
}

export type YarnVerdict =
  | { kind: 'missing-yarn' }
  | { kind: 'too-early' }
  | { kind: 'unknown-rows'; steps: number }
  | {
      kind: 'estimate'
      /** Mètres restants pesés, et mètres qu'il faut pour finir (depuis la pesée). */
      metersLeft: number
      metersNeeded: number
      status: 'enough' | 'tight' | 'short'
      /** Il manque : en mètres et en pelotes (0 si ça passe). */
      missingMeters: number
      missingSkeins: number
    }

/**
 * Estimation à partir de la pesée : le travail est compté en rangs × mailles quand chaque étape a ses mailles
 * (une manche étroite use moins qu'un dos), sinon en rangs.
 */
export function yarnVerdict(yarn: Yarn | undefined, steps: Step[], check: YarnCheck): YarnVerdict {
  if (!yarn || !yarn.weight_g || !yarn.length_m || !yarn.skeins) return { kind: 'missing-yarn' }
  const unknown = steps.filter((s) => s.totalRows === null).length
  if (unknown > 0) return { kind: 'unknown-rows', steps: unknown }
  if (check.rowsDone <= 0) return { kind: 'too-early' }

  const metersPerGram = yarn.length_m / yarn.weight_g
  const metersLeft = check.grams * metersPerGram
  const metersUsed = yarn.skeins * yarn.length_m - metersLeft
  if (metersUsed <= 0) return { kind: 'too-early' }

  // Travail de chaque étape : rangs, pondérés par les mailles quand toutes les étapes les donnent.
  const weighted = steps.every((s) => s.stitches !== null)
  const weight = (s: Step) => (weighted ? s.stitches! : 1)
  const total = steps.reduce((sum, s) => sum + s.totalRows! * weight(s), 0)
  // Travail fait à la pesée : les rangs de la pesée, répartis dans l'ordre des étapes.
  let rows = check.rowsDone
  let done = 0
  for (const s of steps) {
    const here = Math.min(rows, s.totalRows!)
    done += here * weight(s)
    rows -= here
  }
  if (done <= 0) return { kind: 'too-early' }

  const metersNeeded = (metersUsed / done) * Math.max(total - done, 0)
  const margin = metersLeft - metersNeeded
  const status = margin < 0 ? 'short' : margin < metersNeeded * TIGHT_MARGIN ? 'tight' : 'enough'
  const missingMeters = margin < 0 ? Math.ceil(-margin) : 0
  return {
    kind: 'estimate',
    metersLeft: Math.round(metersLeft),
    metersNeeded: Math.round(metersNeeded),
    status,
    missingMeters,
    missingSkeins: missingMeters > 0 ? Math.ceil(missingMeters / yarn.length_m) : 0,
  }
}

/** Pesée lue en base : null si elle est abîmée. */
export function sanitizeYarnCheck(raw: unknown): YarnCheck | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  const yarn = typeof c.yarn === 'number' && Number.isInteger(c.yarn) && c.yarn >= 0 ? c.yarn : null
  const grams = typeof c.grams === 'number' && Number.isFinite(c.grams) && c.grams >= 0 ? c.grams : null
  const rowsDone = typeof c.rows_done === 'number' && Number.isInteger(c.rows_done) && c.rows_done >= 0 ? c.rows_done : null
  if (yarn === null || grams === null || rowsDone === null) return null
  return { yarn, grams, rowsDone, at: typeof c.at === 'string' ? c.at : '' }
}

/** Pesées lues en base : une par laine au plus, les abîmées écartées. */
export function sanitizeYarnChecks(raw: unknown): YarnCheck[] {
  if (!Array.isArray(raw)) return []
  const checks = raw.map(sanitizeYarnCheck).filter((c): c is YarnCheck => c !== null)
  return checks.filter((c, i) => checks.findIndex((o) => o.yarn === c.yarn) === i)
}

/** Pesées après une nouvelle pesée : elle remplace la précédente de la même laine. */
export function withYarnCheck(checks: YarnCheck[], check: YarnCheck): YarnCheck[] {
  return [...checks.filter((c) => c.yarn !== check.yarn), check].sort((a, b) => a.yarn - b.yarn)
}
