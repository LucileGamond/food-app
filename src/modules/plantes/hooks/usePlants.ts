import { HORIZON_DAYS } from '@watering/schedule.ts'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useAsync } from '@/hooks/useAsync'
import { useRealtimeReload } from '@/hooks/useRealtimeReload'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { useToday } from '@/hooks/useToday'
import type { WaterInput } from '../api'
import { parisToday, type CivilDate } from '../lib/dates'
import { buildStatuses, doneToday, toWater, upcomingWaterings } from '../lib/status'

const DAY_MS = 86_400_000

/** Jour du foyer (Paris), tenu à jour quand l'application reste ouverte. `fixed` : tests. */
export function usePlantsToday(fixed?: CivilDate): CivilDate {
  return useToday(fixed, parisToday)
}

/** Toutes les plantes et les arrosages récents, avec ce qu'il faut arroser ; suit les changements des autres. */
export function usePlantsOverview(today: CivilDate) {
  const api = useApi()
  const { data, error, reload } = useAsync(async () => {
    // Arrosages assez anciens pour retrouver les échéances de toutes les fréquences (jusqu'à un an).
    const since = new Date(Date.now() - HORIZON_DAYS * DAY_MS).toISOString()
    const [plants, events] = await Promise.all([api.plants.listPlants(), api.plants.listEvents({ since })])
    return { plants, events }
  }, [api])
  useRealtimeReload(api.plants.subscribe, reload)

  const overview = useMemo(() => {
    if (!data) return null
    const { plants, events } = data
    const statuses = buildStatuses(plants, events, today)
    return {
      plants,
      events,
      statuses,
      toWater: toWater(statuses),
      doneToday: doneToday(plants, events, today),
      upcoming: upcomingWaterings(statuses, today, 7),
    }
  }, [data, today])

  return { overview, error, reload }
}

/** Une plante et tout son historique d'arrosage (`plant` null : supprimée). */
export function usePlantDetail(id: string) {
  const api = useApi()
  const { data, error, reload } = useAsync(async () => {
    const [plant, events] = await Promise.all([api.plants.getPlant(id), api.plants.listEvents({ plantId: id })])
    return { plant, events }
  }, [api, id])
  useRealtimeReload(api.plants.subscribe, reload)
  return { detail: data, error, reload }
}

/** URL temporaires des photos de plantes (bucket privé). */
export function usePlantPhotoUrls(paths: string[]): Record<string, string> {
  const api = useApi()
  return useSignedUrls(api.plants.signedUrls, paths)
}

/** Nom affiché d'une personne du foyer. */
export function useProfileName(): (id: string | null) => string {
  const { profiles } = useAuth()
  return useCallback((id) => profiles.find((p) => p.id === id)?.display_name ?? 'quelqu’un', [profiles])
}

/** Noter ou annuler un arrosage, avec un message ; `onChange` recharge l'écran. */
export function useWateringActions(onChange: () => void) {
  const api = useApi()
  const [wateringPlantId, setWateringPlantId] = useState<string | null>(null)
  const [undoingEventId, setUndoingEventId] = useState<string | null>(null)

  const undo = useCallback(
    async (eventId: string) => {
      setUndoingEventId(eventId)
      try {
        await api.plants.undoWatering(eventId)
        toast.success('Arrosage annulé')
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setUndoingEventId(null)
        onChange()
      }
    },
    [api, onChange],
  )

  const water = useCallback(
    async (input: WaterInput, plantName: string) => {
      setWateringPlantId(input.plantId)
      try {
        const event = await api.plants.water(input)
        toast.success(`${plantName} : arrosage noté`, { action: { label: 'Annuler', onClick: () => void undo(event.id) } })
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setWateringPlantId(null)
        onChange()
      }
    },
    [api, onChange, undo],
  )

  return { water, undo, wateringPlantId, undoingEventId }
}
