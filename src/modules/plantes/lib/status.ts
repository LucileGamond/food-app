// État d'arrosage des plantes à une date : à arroser (et retard), fait aujourd'hui, à venir.

import { addDays, compareDates } from '@watering/civil-date.ts'
import { plantSchedule, scheduleBetween, type Occurrence, type PlantSchedule } from '@watering/schedule.ts'
import type { CivilDate } from './dates'
import { toEngineEvent, toEngineRule, wateredOn, type Plant, type WateringEvent } from './plants'

export interface PlantStatus {
  plant: Plant
  schedule: PlantSchedule
  /** Arrosage le plus récent, quel qu'il soit. */
  lastEvent: WateringEvent | null
}

export interface DoneToday {
  plant: Plant
  event: WateringEvent
}

export interface UpcomingWatering {
  plant: Plant
  occurrence: Occurrence
}

function eventsByPlant(events: WateringEvent[]): Map<string, WateringEvent[]> {
  const map = new Map<string, WateringEvent[]>()
  for (const event of events) map.set(event.plant_id, [...(map.get(event.plant_id) ?? []), event])
  for (const list of map.values()) list.sort((a, b) => b.watered_at.localeCompare(a.watered_at))
  return map
}

/** État d'arrosage de chaque plante non archivée. */
export function buildStatuses(plants: Plant[], events: WateringEvent[], today: CivilDate): PlantStatus[] {
  const byPlant = eventsByPlant(events)
  return plants
    .filter((plant) => plant.archived_at === null)
    .map((plant) => {
      const plantEvents = byPlant.get(plant.id) ?? []
      return {
        plant,
        schedule: plantSchedule(plant.rules.map(toEngineRule), plantEvents.map(toEngineEvent), today),
        lastEvent: plantEvents[0] ?? null,
      }
    })
}

/** Plantes à arroser : les plus en retard d'abord, puis par nom. */
export function toWater(statuses: PlantStatus[]): PlantStatus[] {
  return statuses
    .filter((s) => s.schedule.pending !== null)
    .sort((a, b) => b.schedule.overdueDays - a.schedule.overdueDays || a.plant.name.localeCompare(b.plant.name, 'fr'))
}

/** Arrosages faits aujourd'hui (plantes non archivées), du plus récent au plus ancien. */
export function doneToday(plants: Plant[], events: WateringEvent[], today: CivilDate): DoneToday[] {
  const byId = new Map(plants.filter((p) => p.archived_at === null).map((p) => [p.id, p]))
  return events
    .filter((e) => byId.has(e.plant_id) && wateredOn(e) === today)
    .sort((a, b) => b.watered_at.localeCompare(a.watered_at))
    .map((event) => ({ plant: byId.get(event.plant_id)!, event }))
}

/** Échéances des `days` prochains jours (après aujourd'hui), par date puis par nom. */
export function upcomingWaterings(statuses: PlantStatus[], today: CivilDate, days: number): UpcomingWatering[] {
  const from = addDays(today, 1)
  const to = addDays(today, days)
  return statuses
    .flatMap(({ plant }) => scheduleBetween(plant.rules.map(toEngineRule), from, to).map((occurrence) => ({ plant, occurrence })))
    .sort((a, b) => compareDates(a.occurrence.date, b.occurrence.date) || a.plant.name.localeCompare(b.plant.name, 'fr'))
}

/** Emplacements distincts (filtre et saisie). */
export function locations(plants: Plant[]): string[] {
  return [...new Set(plants.map((p) => p.location).filter((l): l is string => Boolean(l)))].sort((a, b) => a.localeCompare(b, 'fr'))
}
