import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { PlanItem, PlanItemInput } from '@/lib/food'

export interface FoodPlanState {
  items: PlanItem[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  save: (input: PlanItemInput & { position?: number }, id?: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

/** Plan alimentaire d'une personne, rechargé en temps réel. */
export function useFoodPlan(api: Api, profileId: string | null): FoodPlanState {
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    if (!profileId) return
    const id = ++requestId.current
    try {
      const list = await api.food.listPlan(profileId)
      if (id !== requestId.current) return
      setItems(list)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, profileId])

  useEffect(() => {
    setLoading(true)
    setItems([])
    void reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.food.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [api, reload])

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
      try {
        await action()
        toast.success(success)
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        void reload()
      }
    },
    [reload],
  )

  return {
    items,
    loading,
    loadError,
    reload,
    save: (input, id) => run(() => api.food.savePlanItem(profileId!, input, id), id ? 'Aliment modifié' : 'Aliment ajouté'),
    remove: (id) => run(() => api.food.deletePlanItem(id), 'Aliment retiré du plan'),
  }
}
