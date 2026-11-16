import { useEffect, useState } from 'react'
import type { Api } from '@/api'
import type { IsoDate } from '@/lib/dates'
import { planSuggestions, type DayLog } from '@/lib/mealLog'

/** Réponses du journal déduites du planning de ce jour (rien si le planning ne se charge pas : ce n'est qu'une aide). */
export function useMealSuggestions(api: Api, profileId: string | null, date: IsoDate): DayLog {
  const [suggestions, setSuggestions] = useState<{ key: string; log: DayLog } | null>(null)
  const key = `${profileId}:${date}`

  useEffect(() => {
    if (!profileId) return
    let active = true
    api.meals
      .listMeals(date, date)
      .then((meals) => active && setSuggestions({ key, log: planSuggestions(meals, profileId, date) }))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api, profileId, date, key])

  return suggestions?.key === key ? suggestions.log : {}
}
