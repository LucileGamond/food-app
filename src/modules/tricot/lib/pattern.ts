// Module Tricot : étapes d'un patron, rangs comptés et rappels (« 2 diminutions tous les 6 rangs »).

/** Action à refaire à intervalle régulier pendant une étape. */
export interface StepReminder {
  /** Tous les N rangs. */
  every: number
  /** Premier rang concerné (par défaut : `every`). */
  first: number | null
  /** Nombre de fois (par défaut : jusqu'à la fin de l'étape). */
  times: number | null
  action: string
}

export interface KnitStep {
  id: string
  position: number
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  reminders: StepReminder[]
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
export type PatternStep = Pick<KnitStep, 'title' | 'instructions' | 'totalRows' | 'stitches' | 'reminders'>

export interface ReadPattern {
  title: string
  sizes: string[]
  steps: PatternStep[]
}

export const MAX_PDF_BYTES = 20 * 1024 * 1024

/** Rangs où l'action est à faire, dans la limite de l'étape (ou de `upTo`). */
export function reminderRows(reminder: StepReminder, totalRows: number | null, upTo = 2000): number[] {
  if (reminder.every < 1) return []
  const first = reminder.first ?? reminder.every
  const last = Math.min(totalRows ?? upTo, upTo)
  const rows: number[] = []
  for (let row = first; row <= last; row += reminder.every) {
    rows.push(row)
    if (reminder.times !== null && rows.length >= reminder.times) break
  }
  return rows
}

/** Rappels à faire au rang `row`. */
export function dueReminders(step: Pick<KnitStep, 'reminders' | 'totalRows'>, row: number): StepReminder[] {
  if (row < 1) return []
  return step.reminders.filter((r) => reminderRows(r, step.totalRows, row).includes(row))
}

/** Prochain rang (après `row`) où l'action est à faire, et combien de fois elle a déjà été faite. */
export function nextReminder(reminder: StepReminder, totalRows: number | null, row: number): { row: number | null; doneTimes: number } {
  const rows = reminderRows(reminder, totalRows, Math.max(row + reminder.every, 1) + 2000)
  return { row: rows.find((r) => r > row) ?? null, doneTimes: rows.filter((r) => r <= row).length }
}

/** Étape en cours : la première non terminée (la dernière si tout est fait). */
export function currentStepIndex(steps: Pick<KnitStep, 'done'>[]): number {
  const index = steps.findIndex((s) => !s.done)
  return index === -1 ? Math.max(steps.length - 1, 0) : index
}

/** « tous les 6 rangs, 4 fois, à partir du rang 6 ». */
export function describeReminder(reminder: StepReminder): string {
  const parts = [reminder.every === 1 ? 'à chaque rang' : `tous les ${reminder.every} rangs`]
  if (reminder.times !== null) parts.push(`${reminder.times} fois`)
  if (reminder.first !== null && reminder.first !== reminder.every) parts.push(`à partir du rang ${reminder.first}`)
  return parts.join(', ')
}
