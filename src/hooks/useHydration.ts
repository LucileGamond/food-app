import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import { startOfDay, type WaterIntake } from '@/lib/hydration'
import type { IsoDate } from '@/lib/dates'
import { useRealtimeReload } from './useRealtimeReload'

export interface HydrationState {
  intakes: WaterIntake[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  add: (volumeMl: number) => Promise<void>
  remove: (intake: WaterIntake) => Promise<void>
}

/** Verres bus aujourd'hui par la personne connectée (rechargés au changement de jour). */
export function useHydration(api: Api, today: IsoDate): HydrationState {
  const [intakes, setIntakes] = useState<WaterIntake[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      // Minuit à Paris ce jour-là (comme les rappels) ; midi UTC tombe le même jour à Paris.
      const list = await api.hydration.listIntakes(startOfDay(new Date(`${today}T12:00:00Z`)))
      if (id !== requestId.current) return
      setIntakes(list)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, today])

  useEffect(() => {
    void reload()
  }, [reload])
  // Verres notés sur un autre appareil : la page suit en direct.
  useRealtimeReload(api.hydration.subscribe, reload)

  const add = useCallback(
    async (volumeMl: number) => {
      try {
        const intake = await api.hydration.addIntake(volumeMl)
        requestId.current += 1 // un chargement en cours ne doit pas effacer ce verre
        setIntakes((list) => [...list, intake])
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
    [api],
  )

  const remove = useCallback(
    async (intake: WaterIntake) => {
      requestId.current += 1
      setIntakes((list) => list.filter((i) => i.id !== intake.id))
      try {
        await api.hydration.deleteIntake(intake.id)
      } catch (error) {
        toast.error(errorMessage(error))
        void reload()
      }
    },
    [api, reload],
  )

  return { intakes, loading, loadError, reload, add, remove }
}
