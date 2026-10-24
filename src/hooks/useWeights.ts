import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { IsoDate } from '@/lib/dates'
import type { WeighInValue, WeightEntry } from '@/lib/weights'

export interface WeightsState {
  entries: WeightEntry[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  saveWeighIn: (date: IsoDate, values: WeighInValue[], previousDate?: IsoDate) => Promise<boolean>
  deleteWeighIn: (date: IsoDate) => Promise<boolean>
}

/** Mesures de poids de tout le foyer, rechargées en temps réel. */
export function useWeights(api: Api): WeightsState {
  const [entries, setEntries] = useState<WeightEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const list = await api.weights.listEntries()
      if (id !== requestId.current) return
      setEntries(list)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.weights.subscribe(() => {
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
    entries,
    loading,
    loadError,
    reload,
    saveWeighIn: (date, values, previousDate) => run(() => api.weights.saveWeighIn(date, values, previousDate), 'Pesée enregistrée'),
    deleteWeighIn: (date) => run(() => api.weights.deleteWeighIn(date), 'Pesée supprimée'),
  }
}
