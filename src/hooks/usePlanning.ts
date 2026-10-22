import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { CreateMealInput } from '@/api/meals'
import { addDays, type IsoDate } from '@/lib/dates'
import { isMoveNeeded, type Meal, type MealRecipeSource, type SlotRef } from '@/lib/meals'

export const PLANNING_DAYS = 7

export interface PlanningState {
  meals: Meal[]
  loading: boolean
  loadError: string | null
  busy: boolean
  reload: () => Promise<void>
  createMeal: (input: CreateMealInput) => Promise<boolean>
  updateMeal: (id: string, people: string[], source: MealRecipeSource) => Promise<boolean>
  moveMeal: (meal: Meal, target: SlotRef) => Promise<void>
  duplicateMeal: (meal: Meal, target: SlotRef) => Promise<void>
  deleteMeal: (meal: Meal) => Promise<void>
}

/**
 * Repas de la fenêtre [start, start + 6 jours], avec mises à jour optimistes
 * (déplacement, suppression) et rechargement en temps réel.
 */
export function usePlanning(api: Api, start: IsoDate): PlanningState {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const requestId = useRef(0)
  const end = addDays(start, PLANNING_DAYS - 1)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const list = await api.meals.listMeals(start, end)
      if (id !== requestId.current) return
      setMeals(list)
      setLoadError(null)
    } catch (error) {
      if (id !== requestId.current) return
      setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, start, end])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.meals.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [api, reload])

  const run = useCallback(
    async (action: () => Promise<unknown>, rollback?: () => void): Promise<boolean> => {
      setPending((n) => n + 1)
      try {
        await action()
        return true
      } catch (error) {
        rollback?.()
        toast.error(errorMessage(error))
        return false
      } finally {
        setPending((n) => n - 1)
        void reload()
      }
    },
    [reload],
  )

  const createMeal = useCallback((input: CreateMealInput) => run(() => api.meals.createMeal(input)), [api, run])

  const updateMeal = useCallback(
    (id: string, people: string[], source: MealRecipeSource) => run(() => api.meals.updateMeal(id, people, source)),
    [api, run],
  )

  const moveMeal = useCallback(
    async (meal: Meal, target: SlotRef) => {
      if (!isMoveNeeded(meal, target)) return
      const previous = meals
      setMeals((list) => list.map((m) => (m.id === meal.id ? { ...m, meal_date: target.date, slot: target.slot } : m)))
      await run(() => api.meals.moveMeal(meal.id, target.date, target.slot), () => setMeals(previous))
    },
    [api, meals, run],
  )

  const duplicateMeal = useCallback(
    async (meal: Meal, target: SlotRef) => {
      await run(() => api.meals.duplicateMeal(meal.id, target.date, target.slot))
    },
    [api, run],
  )

  const deleteMeal = useCallback(
    async (meal: Meal) => {
      const previous = meals
      setMeals((list) => list.filter((m) => m.id !== meal.id))
      await run(() => api.meals.deleteMeal(meal.id), () => setMeals(previous))
    },
    [api, meals, run],
  )

  return { meals, loading, loadError, busy: pending > 0, reload, createMeal, updateMeal, moveMeal, duplicateMeal, deleteMeal }
}
