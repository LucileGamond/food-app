import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { Meal } from '@/lib/meals'
import type { Ingredient } from '@/lib/recipes'
import { nextPosition, type ShoppingItemInput } from '@/lib/shopping'
import {
  applyTidy,
  buildDraft,
  mealSource,
  mergeIntoList,
  skippedInput,
  skippedMeal,
  toItemInput,
  uncheckedEntries,
  type DraftLine,
  type MealIngredients,
  type SkippedEntry,
} from '@/lib/shoppingFromPlan'

/** Lignes envoyées au modèle au plus (limite de la fonction tidy-shopping). */
const MAX_TIDY_LINES = 150
/** Pages de recettes lues en même temps. */
const IMPORT_CONCURRENCY = 3

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
  back: () => void
  reset: () => void
  toggle: (id: string) => void
  update: (id: string, input: ShoppingItemInput) => void
  /** Repas non repris ajouté comme article libre (« Ingrédients : Poulet basquaise »). */
  addSkipped: (entry: SkippedEntry) => void
  submit: (destination: Destination) => Promise<ShoppingFromPlanResult | null>
}

/** Exécute `task` sur chaque élément, `limit` à la fois, en conservant l'ordre des résultats. */
async function pool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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

  const prepare = useCallback(
    async (meals: Meal[]) => {
      const run = ++runId.current
      setStep('loading')
      setPhase('recipes')
      const missing: SkippedEntry[] = []
      const found: MealIngredients[] = []

      let recipes: Awaited<ReturnType<Api['recipes']['getIngredients']>>
      try {
        recipes = await api.recipes.getIngredients([...new Set(meals.filter((m) => mealSource(m) === 'recipe').map((m) => m.recipe.id))])
      } catch (error) {
        if (run !== runId.current) return
        toast.error(errorMessage(error))
        setStep('meals')
        return
      }

      // Une même page n'est lue qu'une fois, même si le repas est planifié plusieurs fois.
      const pages = new Map<string, Promise<{ servings: number | null; ingredients: Ingredient[] } | null>>()
      const readPage = (url: string) => {
        if (!pages.has(url)) {
          pages.set(
            url,
            api.recipes.importFromUrl(url).then(
              ({ recipe }) => (recipe.ingredients.length > 0 ? { servings: recipe.servings, ingredients: recipe.ingredients } : null),
              () => null,
            ),
          )
        }
        return pages.get(url)!
      }

      const results = await pool(meals, IMPORT_CONCURRENCY, async (meal): Promise<MealIngredients | SkippedEntry> => {
        const source = mealSource(meal)
        if (source === 'recipe') {
          const recipe = recipes.find((r) => r.id === meal.recipe.id)
          if (!recipe || recipe.ingredients.length === 0) return skippedMeal(meal, 'no-ingredients')
          return { meal, servings: recipe.servings, ingredients: recipe.ingredients }
        }
        if (source === 'link') {
          const page = await readPage(meal.recipe.url!)
          return page ? { meal, ...page } : skippedMeal(meal, 'unreadable-page')
        }
        return skippedMeal(meal, 'no-ingredients')
      })
      if (run !== runId.current) return
      for (const result of results) {
        if ('reason' in result) missing.push(result)
        else found.push(result)
      }

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
      setUnscaled([...new Set(found.filter((s) => s.servings === null).map((s) => s.meal.recipe.title))])
      setTidyFailed(failed)
      setStep('preview')
    },
    [api],
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
    setLines((list) => list.map((l) => (l.id === id ? { ...l, ...input, include: true } : l)))
  }, [])

  const addSkipped = useCallback((entry: SkippedEntry) => {
    setSkipped((list) => list.filter((e) => e.key !== entry.key))
    const input = skippedInput(entry)
    setLines((list) => [...list, { ...input, id: `d${++lineSeq.current}`, name: input.name, pantry: false, include: true, meals: [entry.label] }])
  }, [])

  const submit = useCallback(
    async (destination: Destination): Promise<ShoppingFromPlanResult | null> => {
      const inputs = lines.filter((l) => l.include).map(toItemInput)
      setSubmitting(true)
      try {
        let listId: string
        if (destination.kind === 'new') {
          listId = await api.shopping.createList(destination.name)
          await api.shopping.addItems(listId, inputs, 0)
        } else {
          listId = destination.listId
          const items = await api.shopping.listItems(listId)
          const { updates, additions } = mergeIntoList(items, inputs)
          await Promise.all(updates.map((u) => api.shopping.updateItem(u.item.id, { quantity: u.quantity })))
          await api.shopping.addItems(listId, additions, nextPosition(items))
        }
        return { listId, count: inputs.length, skipped: [...skipped, ...uncheckedEntries(lines)] }
      } catch (error) {
        toast.error(errorMessage(error))
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [api, lines, skipped],
  )

  return { step, phase, lines, skipped, unscaled, tidyFailed, submitting, prepare, back, reset, toggle, update, addSkipped, submit }
}
