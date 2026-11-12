// Module Tricot : nombre de mailles sur l'aiguille, rang par rang (mode tricoter).
//
// Le patron donne le nombre de mailles à la fin de l'étape ; chaque action d'une répétition en ajoute ou en retire
// (« 1 diminution de chaque côté » : −2). En remontant depuis la fin, on connaît le nombre de mailles au début de
// l'étape, puis à la fin de chaque rang. Un effet relevé dans le patron ou corrigé à la main est sûr ; un effet
// deviné d'après le texte donne une estimation, signalée par « (?) ».

import { actionEffect, isToSet, planSections, type RepeatAction, type StepSection } from './pattern'

export type StitchCount =
  | { kind: 'sure'; stitches: number }
  /** Estimation : au moins un effet est deviné ; `reasons` dit lesquels. */
  | { kind: 'estimate'; stitches: number; reasons: string[] }
  | { kind: 'unknown'; reason: string }

/** Mailles en fin de rang, pour le rang `row` de l'étape. */
export type StitchTrack = (row: number) => StitchCount

/** « 2 diminutions de chaque côté » → −4 ; « 1 aug. » → +1 ; « placer un marqueur » → null (on ne sait pas). */
export function guessStitches(text: string): number | null {
  const effect = actionEffect(text)
  if (effect === 'other') return null
  const number = Number(/\d+/.exec(text)?.[0] ?? 1)
  // « 2 m. ensemble » : 2 mailles tricotées en une, soit 1 de moins.
  const count = /ensemble|\bens\b/i.test(text) ? Math.max(number - 1, 1) : number
  const sides = /chaque c[ôo]t[ée]|each side|both sides|aux 2 bords|de part et d/i.test(text) ? 2 : 1
  return (effect === 'decrease' ? -1 : 1) * count * sides
}

/** Effet d'une action : donné (sûr), sinon deviné d'après son texte (estimation), sinon inconnu. */
function effectOf(action: RepeatAction): { stitches: number; guessed: boolean } {
  if (action.stitches !== undefined) return { stitches: action.stitches, guessed: false }
  const guess = guessStitches(action.text)
  // Action sans effet reconnaissable (marqueur, torsade…) : comptée 0, mais non sûre.
  return { stitches: guess ?? 0, guessed: true }
}

function unknown(reason: string): StitchTrack {
  return () => ({ kind: 'unknown', reason })
}

type CountedStep = { sections: StepSection[]; totalRows: number | null; stitches: number | null; startStitches?: number | null }

/**
 * Suivi des mailles d'une étape. Mailles au début saisies : elles font foi, chaque augmentation et diminution s'ajoute
 * (4 mailles de plus au début, 4 de plus partout). Sinon, on remonte depuis les mailles de fin du patron.
 */
export function stitchTrack(step: CountedStep): StitchTrack {
  const startSet = step.startStitches ?? null
  if (step.stitches === null && startSet === null) return unknown('Le nombre de mailles à la fin de l’étape n’est pas indiqué.')
  const plan = planSections(step.sections, step.totalRows)
  if (plan.some((p) => p.start === null || isToSet(p.section))) {
    return unknown('Une sous-étape est à régler en rangs.')
  }
  if (step.totalRows === null && plan.some((p) => p.section.kind === 'repeat' && p.section.times === null)) {
    return unknown('Une répétition va jusqu’à la fin de l’étape, dont le nombre de rangs n’est pas connu.')
  }
  const changes = plan.flatMap((p) => p.actions.map((a) => ({ row: a.row, text: a.action.text, ...effectOf(a.action) })))
  const start = startSet ?? step.stitches! - changes.reduce((sum, c) => sum + c.stitches, 0)
  const reasons = [...new Set(changes.filter((c) => c.guessed).map((c) => c.text))].map((text) => {
    const guess = guessStitches(text)
    return guess === null ? `Effet de « ${text} » inconnu (compté 0).` : `Effet de « ${text} » deviné : ${guess > 0 ? '+' : ''}${guess} mailles.`
  })
  if (start <= 0) return unknown('Le nombre de mailles ne tombe pas juste : vérifie les sous-étapes et le nombre de mailles de l’étape.')
  return (row) => {
    const stitches = start + changes.filter((c) => c.row <= row).reduce((sum, c) => sum + c.stitches, 0)
    return reasons.length ? { kind: 'estimate', stitches, reasons } : { kind: 'sure', stitches }
  }
}

/** Mailles à la fin de l'étape : déduites du début saisi, sinon celles du patron (null : inconnues). */
export function endStitches(step: CountedStep): number | null {
  if ((step.startStitches ?? null) === null) return step.stitches
  // Début saisi : la fin du patron ne vaut plus ; sans calcul possible, elle n'est pas connue
  const last = stitchTrack(step)(Number.MAX_SAFE_INTEGER)
  return last.kind === 'unknown' ? null : last.stitches
}

/** Mailles au début de l'étape : saisies, sinon déduites de la fin (null : inconnues). */
export function startStitchesOf(step: CountedStep): number | null {
  if ((step.startStitches ?? null) !== null) return step.startStitches!
  const first = stitchTrack(step)(0)
  return first.kind === 'unknown' ? null : first.stitches
}
