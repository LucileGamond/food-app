// Mode cuisine : étapes tirées du texte de préparation, et progression (cases cochées).

/**
 * Début d'étape : « 1. », « 2) », « 3 - », « Étape 4 : », ou une puce (« - », « • »), suivis d'un espace : « 1/2 litre »,
 * « 2-3 min » ou « 1.5 kg » ne sont pas des numéros.
 */
const STEP_MARK = /^\s*(?:(?:étape|etape)\s*\d+\s*[:.)-]?\s*|\d+\s*[.)](?:\s+|$)|\d+\s+[-–]\s+|[-•*–]\s+)/i

/**
 * Étapes de la préparation (texte libre, en base). Texte numéroté ou à puces : une étape par marque, les lignes
 * sans marque complètent l'étape en cours. Sinon : un paragraphe par étape (lignes vides), ou à défaut une ligne
 * par étape. Les numéros sont retirés (l'écran numérote). Rien n'est perdu : le texte d'avant la première marque
 * est une étape.
 */
export function splitSteps(text: string | null | undefined): string[] {
  const lines = (text ?? '').split(/\r?\n/)
  const filled = lines.map((l) => l.trim()).filter(Boolean)
  if (filled.length === 0) return []

  if (filled.some((l) => STEP_MARK.test(l))) {
    const steps: string[] = []
    for (const line of filled) {
      const marked = STEP_MARK.test(line)
      const content = line.replace(STEP_MARK, '').trim()
      if (marked || steps.length === 0) {
        if (content) steps.push(content)
      } else {
        steps[steps.length - 1] += ` ${content}`
      }
    }
    return steps
  }

  const paragraphs = (text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
  return paragraphs.length > 1 ? paragraphs : filled
}

/** Cases cochées d'une recette en cours : positions des ingrédients, numéros des étapes (à partir de 0). */
export interface CookingProgress {
  ingredients: number[]
  steps: number[]
  /** Nombre de personnes choisi pour les quantités (absent : celui de la recette). */
  people?: number | null
}

export interface SavedProgress extends CookingProgress {
  updatedAt: string
}

export const NO_PROGRESS: CookingProgress = { ingredients: [], steps: [] }

/** Étape à reprendre (numéro à partir de 1) : la première non cochée ; null si rien n'est commencé. */
export function resumeStep(progress: CookingProgress | null, stepCount: number): number | null {
  if (!progress || (progress.ingredients.length === 0 && progress.steps.length === 0)) return null
  const next = Array.from({ length: stepCount }, (_, i) => i).find((i) => !progress.steps.includes(i))
  return next === undefined ? stepCount : next + 1
}

/** Ajoute ou retire un numéro de la liste. */
export function toggle(list: readonly number[], value: number): number[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value].sort((a, b) => a - b)
}
