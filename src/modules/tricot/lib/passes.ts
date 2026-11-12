// Module Tricot : une étape tricotée plusieurs fois (les deux manches, les deux devants…).
//
// Le compteur de rangs est celui de la fois en cours. À la fin d'une fois, la suivante commence à 0 ; l'étape est
// terminée quand la dernière fois est finie.

import type { StepProgress } from '../api'
import type { KnitStep } from './pattern'

/** Fois au plus pour une étape (comme en base). */
export const MAX_STEP_TIMES = 10

type Passes = Pick<KnitStep, 'times' | 'pass'>

/** « 1re », « 2e »… */
export const ordinal = (n: number): string => (n === 1 ? '1re' : `${n}e`)

/** « 2e fois sur 2 » ; null pour une étape tricotée une seule fois. */
export function describePass(step: Passes): string | null {
  return step.times > 1 ? `${ordinal(step.pass)} fois sur ${step.times}` : null
}

/** Reste-t-il une autre fois après celle en cours ? */
export const hasNextPass = (step: Passes): boolean => step.pass < step.times

/** Fin de la fois en cours : la suivante commence au rang 1, ou l'étape est terminée après la dernière. */
export function finishPass(step: Passes): StepProgress {
  return hasNextPass(step) ? { pass: step.pass + 1, rowCount: 0 } : { done: true }
}

/** Nouveau nombre de fois : la fois en cours reste dans les bornes. */
export function withTimes(step: Passes, times: number): StepProgress {
  const clamped = Math.min(Math.max(Math.round(times), 1), MAX_STEP_TIMES)
  return { times: clamped, pass: Math.min(step.pass, clamped) }
}
