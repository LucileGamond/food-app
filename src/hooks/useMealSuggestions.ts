import { useCallback, useEffect, useState } from 'react'
import type { Api } from '@/api'
import type { IsoDate } from '@/lib/dates'
import type { Meal } from '@/lib/meals'
import { planSuggestions, type DayLog } from '@/lib/mealLog'

const NONE: DayLog = {}

/**
 * Réponses du journal déduites du planning, de `from` à `to` : une fonction qui donne celles d'un jour (rien si le
 * planning ne se charge pas : ce n'est qu'une aide).
 */
export function useMealSuggestionsRange(api: Api, profileId: string | null, from: IsoDate, to: IsoDate): (date: IsoDate) => DayLog {
  const [loaded, setLoaded] = useState<{ key: string; meals: Meal[] } | null>(null)
  const key = `${profileId}:${from}:${to}`

  useEffect(() => {
    if (!profileId) return
    let active = true
    api.meals
      .listMeals(from, to)
      .then((meals) => active && setLoaded({ key, meals }))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api, profileId, from, to, key])

  const meals = loaded?.key === key ? loaded.meals : null
  return useCallback((date: IsoDate) => (meals && profileId ? planSuggestions(meals, profileId, date) : NONE), [meals, profileId])
}

/** Réponses du journal déduites du planning de ce jour. */
export function useMealSuggestions(api: Api, profileId: string | null, date: IsoDate): DayLog {
  return useMealSuggestionsRange(api, profileId, date, date)(date)
}
