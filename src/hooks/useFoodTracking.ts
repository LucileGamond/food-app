import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { IsoDate } from '@/lib/dates'
import { defaultPeriod, isPendingConsumption, lastConsumptionOn, PENDING_CONSUMPTION_PREFIX, type FoodPeriod, type PeriodItem } from '@/lib/food'

export interface FoodTrackingState {
  periods: FoodPeriod[]
  period: FoodPeriod | null
  items: PeriodItem[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  selectPeriod: (id: string) => void
  /** Note une consommation (mise à jour optimiste). */
  add: (itemId: string, date: IsoDate) => Promise<void>
  /** Retire la dernière consommation notée ce jour-là (mise à jour optimiste). */
  remove: (itemId: string, date: IsoDate) => Promise<void>
  createPeriod: (start: IsoDate, end: IsoDate) => Promise<boolean>
  deletePeriod: (id: string) => Promise<boolean>
}

function updateItem(items: PeriodItem[], itemId: string, update: (item: PeriodItem) => PeriodItem): PeriodItem[] {
  return items.map((i) => (i.id === itemId ? update(i) : i))
}

/** Suivi des quotas d'une personne : périodes, période affichée et consommations, en temps réel. */
export function useFoodTracking(api: Api, profileId: string | null, today: IsoDate): FoodTrackingState {
  const [periods, setPeriods] = useState<FoodPeriod[]>([])
  const [periodId, setPeriodId] = useState<string | null>(null)
  const [items, setItems] = useState<PeriodItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  const selected = useRef<string | null>(null)
  // Écritures en cours : un rechargement pendant ce temps effacerait les mises à jour optimistes,
  // il est donc reporté à la fin de la dernière écriture.
  const pending = useRef(0)
  const reloadDeferred = useRef(false)
  const tempSeq = useRef(0)

  const reload = useCallback(async () => {
    if (!profileId) return
    if (pending.current > 0) {
      reloadDeferred.current = true
      return
    }
    const id = ++requestId.current
    try {
      const list = await api.food.listPeriods(profileId)
      const current = list.find((p) => p.id === selected.current) ?? defaultPeriod(list, today)
      const periodItems = current ? await api.food.listPeriodItems(current.id) : []
      if (id !== requestId.current) return
      if (pending.current > 0) {
        reloadDeferred.current = true
        return
      }
      selected.current = current?.id ?? null
      setPeriods(list)
      setPeriodId(selected.current)
      setItems(periodItems)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, profileId, today])

  useEffect(() => {
    selected.current = null
    setLoading(true)
    setPeriods([])
    setItems([])
    setPeriodId(null)
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

  const latestReload = useRef(reload)
  useEffect(() => {
    latestReload.current = reload
  })

  const write = useCallback(
    async (action: () => Promise<void>) => {
      pending.current += 1
      try {
        await action()
      } finally {
        pending.current -= 1
        if (pending.current === 0 && reloadDeferred.current) {
          reloadDeferred.current = false
          // Le dernier reload : la liste (ou la personne) a pu changer pendant l'écriture.
          void latestReload.current()
        }
      }
    },
    [],
  )

  const add = useCallback(
    (itemId: string, date: IsoDate) =>
      write(async () => {
        const temp = { id: `${PENDING_CONSUMPTION_PREFIX}${++tempSeq.current}`, consumed_on: date, created_at: new Date().toISOString() }
        setItems((list) => updateItem(list, itemId, (i) => ({ ...i, consumptions: [...i.consumptions, temp] })))
        try {
          const saved = await api.food.addConsumption(itemId, date)
          setItems((list) => updateItem(list, itemId, (i) => ({ ...i, consumptions: i.consumptions.map((c) => (c.id === temp.id ? saved : c)) })))
        } catch (error) {
          setItems((list) => updateItem(list, itemId, (i) => ({ ...i, consumptions: i.consumptions.filter((c) => c.id !== temp.id) })))
          toast.error(errorMessage(error))
        }
      }),
    [api, write],
  )

  const latestItems = useRef(items)
  useEffect(() => {
    latestItems.current = items
  })

  const remove = useCallback(
    (itemId: string, date: IsoDate) =>
      write(async () => {
        const item = latestItems.current.find((i) => i.id === itemId)
        // Une consommation encore en cours d'enregistrement ne peut pas être retirée.
        const target = item && lastConsumptionOn({ consumptions: item.consumptions.filter((c) => !isPendingConsumption(c)) }, date)
        if (!target) return
        setItems((list) => updateItem(list, itemId, (i) => ({ ...i, consumptions: i.consumptions.filter((c) => c.id !== target.id) })))
        try {
          await api.food.removeConsumption(target.id)
        } catch (error) {
          setItems((list) => updateItem(list, itemId, (i) => ({ ...i, consumptions: [...i.consumptions, target] })))
          toast.error(errorMessage(error))
        }
      }),
    [api, write],
  )

  const selectPeriod = useCallback(
    (id: string) => {
      if (id === selected.current) return
      selected.current = id
      setPeriodId(id)
      setLoading(true)
      void reload()
    },
    [reload],
  )

  const createPeriod = useCallback(
    async (start: IsoDate, end: IsoDate) => {
      if (!profileId) return false
      try {
        selected.current = await api.food.createPeriod(profileId, start, end)
        toast.success('Période créée')
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        await reload()
      }
    },
    [api, profileId, reload],
  )

  const deletePeriod = useCallback(
    async (id: string) => {
      try {
        await api.food.deletePeriod(id)
        if (selected.current === id) selected.current = null
        toast.success('Période supprimée')
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        await reload()
      }
    },
    [api, reload],
  )

  return {
    periods,
    period: periods.find((p) => p.id === periodId) ?? null,
    items,
    loading,
    loadError,
    reload,
    selectPeriod,
    add,
    remove,
    createPeriod,
    deletePeriod,
  }
}
