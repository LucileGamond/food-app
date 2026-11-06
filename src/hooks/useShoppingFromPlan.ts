import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { Meal } from '@/lib/meals'
import { nextItemPosition, type ShoppingItemInput } from '@/lib/shopping'
import {
  applyTidy,
  buildDraft,
  mergeIntoList,
  skippedInput,
  draftLineToItemInput,
  lineEntries,
  type DraftLine,
  type MealIngredients,
  type SkippedEntry,
} from '@/lib/shoppingFromPlan'
import { collectMealIngredients } from '@/services/mealIngredients'

/** Lignes envoyées au modèle au plus (limite de la fonction tidy-shopping). */
const MAX_TIDY_LINES = 150

export type Destination = { kind: 'new'; name: string } | { kind: 'existing'; listId: string }

export interface ShoppingFromPlanResult {
  listId: string
  count: number
  skipped: SkippedEntry[]
}

export interface ShoppingFromPlanState {
  step: 'meals' | 'loading' | 'preview'
  /** Étape du chargement : lecture des recettes, puis regroupement par le modèle. */
  phase: 'recipes' | 'tidy'
  lines: DraftLine[]
  /** Repas dont les ingrédients n'ont pas pu être repris. */
  skipped: SkippedEntry[]
  /** Recettes sans nombre de personnes : quantités non adaptées. */
  unscaled: string[]
  tidyFailed: boolean
  submitting: boolean
  prepare: (meals: Meal[]) => Promise<void>
  prepareIngredients: (sources: MealIngredients[]) => Promise<void>
  back: () => void
  reset: () => void
  toggle: (id: string) => void
  update: (id: string, input: ShoppingItemInput) => void
  /** Repas non repris ajouté comme article libre (« Ingrédients : Poulet basquaise »). */
  addSkipped: (entry: SkippedEntry) => void
  submit: (destination: Destination) => Promise<ShoppingFromPlanResult | null>
}

/** Génération d'une liste de courses depuis le planning : lecture des recettes, regroupement, aperçu, enregistrement. */
export function useShoppingFromPlan(api: Api): ShoppingFromPlanState {
  const [step, setStep] = useState<ShoppingFromPlanState['step']>('meals')
  const [phase, setPhase] = useState<ShoppingFromPlanState['phase']>('recipes')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [skipped, setSkipped] = useState<SkippedEntry[]>([])
  const [unscaled, setUnscaled] = useState<string[]>([])
  const [tidyFailed, setTidyFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Chaque préparation a son numéro : une préparation annulée (retour, fermeture) n'écrit plus rien.
  const runId = useRef(0)
  const lineSeq = useRef(0)

  // Aperçu : lignes regroupées (et rangées par le modèle si possible), ingrédients non repris à part.
  const finish = useCallback(
    async (run: number, found: MealIngredients[], missing: SkippedEntry[]) => {
      const draft = buildDraft(found)
      lineSeq.current = draft.length
      let tidied = draft
      let failed = false
      if (draft.length > 0) {
        setPhase('tidy')
        try {
          const tidy = await api.shopping.tidy(
            draft.slice(0, MAX_TIDY_LINES).map(({ id, name, quantity, unit, aisle }) => ({ id, name, quantity, unit, aisle })),
          )
          tidied = applyTidy(draft, tidy)
        } catch {
          failed = true
        }
        if (run !== runId.current) return
      }

      setLines(tidied)
      setSkipped(missing)
      setUnscaled([...new Set(found.filter((s) => s.servings === null).map((s) => s.title))])
      setTidyFailed(failed)
      setStep('preview')
    },
    [api],
  )

  const prepare = useCallback(
    async (meals: Meal[]) => {
      const run = ++runId.current
      setStep('loading')
      setPhase('recipes')
      let collected: Awaited<ReturnType<typeof collectMealIngredients>>
      try {
        collected = await collectMealIngredients(api, meals)
      } catch (error) {
        if (run !== runId.current) return
        toast.error(errorMessage(error))
        setStep('meals')
        return
      }
      if (run !== runId.current) return
      await finish(run, collected.found, collected.missing)
    },
    [api, finish],
  )

  /** Aperçu directement à partir d'ingrédients connus (une recette, pour un nombre de personnes choisi). */
  const prepareIngredients = useCallback(
    async (sources: MealIngredients[]) => {
      const run = ++runId.current
      setStep('loading')
      setPhase('tidy')
      await finish(run, sources, [])
    },
    [finish],
  )

  const back = useCallback(() => {
    runId.current++
    setStep('meals')
  }, [])

  const reset = useCallback(() => {
    runId.current++
    setStep('meals')
    setLines([])
    setSkipped([])
    setUnscaled([])
    setTidyFailed(false)
  }, [])

  const toggle = useCallback((id: string) => {
    setLines((list) => list.map((l) => (l.id === id ? { ...l, include: !l.include } : l)))
  }, [])

  const update = useCallback((id: string, input: ShoppingItemInput) => {
    // Article corrigé à la main : plus rien à vérifier.
    setLines((list) => list.map((l) => (l.id === id ? { ...l, ...input, include: true, issues: [] } : l)))
  }, [])

  const addSkipped = useCallback((entry: SkippedEntry) => {
    setSkipped((list) => list.filter((e) => e.key !== entry.key))
    const input = skippedInput(entry)
    setLines((list) => [...list, { ...input, id: `d${++lineSeq.current}`, name: input.name, pantry: false, include: true, meals: [entry.label], issues: [] }])
  }, [])

  const submit = useCallback(
    async (destination: Destination): Promise<ShoppingFromPlanResult | null> => {
      const inputs = lines.filter((l) => l.include).map(draftLineToItemInput)
      setSubmitting(true)
      let created: string | null = null
      let written = false
      try {
        let listId: string
        if (destination.kind === 'new') {
          listId = created = await api.shopping.createList(destination.name)
          await api.shopping.addItems(listId, inputs, 0)
        } else {
          listId = destination.listId
          const items = await api.shopping.listItems(listId)
          const { updates, additions } = mergeIntoList(items, inputs)
          written = true
          await Promise.all(updates.map((u) => api.shopping.updateItem(u.item.id, { quantity: u.quantity })))
          await api.shopping.addItems(listId, additions, nextItemPosition(items))
        }
        return { listId, count: inputs.length, skipped: [...skipped, ...lineEntries(lines)] }
      } catch (error) {
        // Nouvelle liste restée vide : supprimée, pour qu'un nouvel essai ne crée pas de doublon.
        if (created) await api.shopping.deleteList(created).catch(() => undefined)
        toast.error(errorMessage(error))
        // Liste existante complétée en partie : on l'ouvre pour vérifier, plutôt que de tout réadditionner.
        if (written && destination.kind === 'existing') {
          toast.error('La liste a été complétée en partie : vérifie-la avant de réessayer')
          return { listId: destination.listId, count: 0, skipped: [] }
        }
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [api, lines, skipped],
  )

  return { step, phase, lines, skipped, unscaled, tidyFailed, submitting, prepare, prepareIngredients, back, reset, toggle, update, addSkipped, submit }
}
