import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { IsoDate } from '@/lib/dates'
import type { LogKind, LogSlot, MealLogEntry } from '@/lib/mealLog'
import { useRealtimeReload } from './useRealtimeReload'

export interface MealLogState {
  entries: MealLogEntry[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  /** Répond pour un moment (null : efface la réponse). Mise à jour optimiste. */
  answer: (date: IsoDate, slot: LogSlot, kind: LogKind | null) => Promise<void>
}

function without(entries: MealLogEntry[], date: IsoDate, slot: LogSlot) {
  return entries.filter((e) => !(e.eaten_on === date && e.slot === slot))
}

/** Journal des repas d'une personne, de `from` à `to`, en temps réel. */
export function useMealLog(api: Api, profileId: string | null, from: IsoDate, to: IsoDate): MealLogState {
  const [entries, setEntries] = useState<MealLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  // Écritures en cours : un rechargement pendant ce temps effacerait la mise à jour optimiste.
  const pending = useRef(0)

  const reload = useCallback(async () => {
    if (!profileId || pending.current > 0) return
    const id = ++requestId.current
    try {
      const list = await api.mealLog.list(profileId, from, to)
      if (id !== requestId.current || pending.current > 0) return
      setEntries(list)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, profileId, from, to])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  const subscribe = useCallback((onChange: () => void) => api.mealLog.subscribe(onChange), [api])
  useRealtimeReload(subscribe, reload)

  const answer = useCallback(
    async (date: IsoDate, slot: LogSlot, kind: LogKind | null) => {
      if (!profileId) return
      let previous: MealLogEntry[] = []
      setEntries((current) => {
        previous = current
        const rest = without(current, date, slot)
        return kind ? [...rest, { profile_id: profileId, eaten_on: date, slot, kind }] : rest
      })
      pending.current += 1
      try {
        if (kind) await api.mealLog.set(profileId, date, slot, kind)
        else await api.mealLog.clear(profileId, date, slot)
      } catch (error) {
        setEntries(previous)
        toast.error(errorMessage(error))
      } finally {
        pending.current -= 1
      }
    },
    [api, profileId],
  )

  return { entries, loading, loadError, reload, answer }
}
