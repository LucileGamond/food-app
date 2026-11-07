// À côté des rendez-vous, dans la semaine de l'agenda : les repas planifiés et les arrosages prévus (lecture seule).

import type { IsoDate } from '@/lib/dates'
import { SLOTS, slotLabel, type Meal } from '@/lib/meals'
import { formatAmount } from '@/modules/plantes/lib/format'
import type { PlantStatus, UpcomingWatering } from '@/modules/plantes/lib/status'

export interface DayExtra {
  kind: 'meal' | 'watering'
  key: string
  /** « Midi », « Arrosage » */
  label: string
  text: string
}

/** Repas du jour, midi puis soir. */
export function mealExtras(meals: Meal[], day: IsoDate): DayExtra[] {
  const ofDay = meals.filter((m) => m.meal_date === day)
  return SLOTS.flatMap((slot) => ofDay.filter((m) => m.slot === slot)).map((meal) => ({
    kind: 'meal',
    key: `meal-${meal.id}`,
    label: slotLabel(meal.slot),
    text: meal.recipe.title,
  }))
}

/**
 * Arrosages du jour : aujourd'hui, ceux qui restent à faire (retards compris) ; les jours suivants, ceux prévus.
 * Rien pour les jours passés (l'historique est sur la page Plantes).
 */
export function wateringExtras(waterings: { toWater: PlantStatus[]; upcoming: UpcomingWatering[] }, day: IsoDate, today: IsoDate): DayExtra[] {
  if (day < today) return []
  const plants =
    day === today
      ? waterings.toWater.map(({ plant, schedule }) => ({ id: plant.id, name: plant.name, amountMl: schedule.pending!.amountMl }))
      : waterings.upcoming.filter((u) => u.occurrence.date === day).map(({ plant, occurrence }) => ({ id: plant.id, name: plant.name, amountMl: occurrence.amountMl }))
  return plants.map((p) => ({ kind: 'watering', key: `watering-${p.id}`, label: 'Arrosage', text: `${p.name} · ${formatAmount(p.amountMl)}` }))
}
