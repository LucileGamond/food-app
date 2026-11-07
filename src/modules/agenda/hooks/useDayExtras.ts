import { daysBetween } from '@watering/civil-date.ts'
import { HORIZON_DAYS } from '@watering/schedule.ts'
import { useCallback } from 'react'
import { useApi } from '@/app/ApiContext'
import { useAsync } from '@/hooks/useAsync'
import type { IsoDate } from '@/lib/dates'
import { buildStatuses, toWater, upcomingWaterings } from '@/modules/plantes/lib/status'
import { mealExtras, wateringExtras, type DayExtra } from '../lib/extras'

const DAY_MS = 86_400_000
const EMPTY = { meals: [], waterings: { toWater: [], upcoming: [] } }

/**
 * Repas et arrosages des jours [from, to], si leurs pages sont affichées. Renvoie de quoi les retrouver jour par
 * jour (vide tant que rien n'est chargé ou en cas d'erreur : l'agenda reste lisible).
 */
export function useDayExtras(from: IsoDate, to: IsoDate, today: IsoDate, show: { meals: boolean; waterings: boolean }): (day: IsoDate) => DayExtra[] {
  const api = useApi()
  const { data } = useAsync(async () => {
    const [meals, waterings] = await Promise.all([show.meals ? api.meals.listMeals(from, to) : [], show.waterings ? loadWaterings() : EMPTY.waterings])
    return { meals, waterings }

    async function loadWaterings() {
      const since = new Date(Date.now() - HORIZON_DAYS * DAY_MS).toISOString()
      const [plants, events] = await Promise.all([api.plants.listPlants(), api.plants.listEvents({ since })])
      const statuses = buildStatuses(plants, events, today)
      // Arrosages prévus jusqu'au dernier jour affiché (aucun pour une période passée).
      return { toWater: toWater(statuses), upcoming: upcomingWaterings(statuses, today, Math.max(0, daysBetween(today, to))) }
    }
  }, [api, from, to, today, show.meals, show.waterings])

  const extras = data ?? EMPTY
  return useCallback((day: IsoDate) => [...mealExtras(extras.meals, day), ...wateringExtras(extras.waterings, day, today)], [extras, today])
}
