// Plantes, règles d'arrosage et arrosages, tels que lus en base ; conversion vers le moteur de calcul des échéances.

import { toCivilDate } from '@watering/civil-date.ts'
import type { IntervalUnit, WateringEvent as EngineEvent, WateringRule as EngineRule } from '@watering/schedule.ts'
import { HOME_TIME_ZONE, type CivilDate } from './dates'

export type { IntervalUnit }

export interface PlantPhoto {
  id: string
  storage_path: string
  position: number
}

export interface WateringRule {
  id: string
  months: number[]
  first_watering_on: CivilDate
  interval_count: number
  interval_unit: IntervalUnit
  amount_ml: number
  note: string | null
}

export interface Plant {
  id: string
  name: string
  species: string | null
  location: string | null
  planted_on: CivilDate | null
  planted_height_cm: number | null
  pot_diameter_cm: number | null
  notes: string | null
  archived_at: string | null
  created_at: string
  photos: PlantPhoto[]
  rules: WateringRule[]
}

export interface WateringEvent {
  id: string
  plant_id: string
  rule_id: string | null
  scheduled_on: CivilDate | null
  watered_at: string
  amount_ml: number | null
  done_by: string | null
  note: string | null
}

/** Fiche saisie dans le formulaire, prête à enregistrer. */
export interface PlantInput {
  name: string
  species: string | null
  location: string | null
  planted_on: CivilDate | null
  planted_height_cm: number | null
  pot_diameter_cm: number | null
  notes: string | null
}

export type RuleInput = Omit<WateringRule, 'id'>

export function toEngineRule(rule: WateringRule): EngineRule {
  return {
    id: rule.id,
    months: rule.months,
    firstWateringOn: rule.first_watering_on,
    intervalCount: rule.interval_count,
    intervalUnit: rule.interval_unit,
    amountMl: rule.amount_ml,
  }
}

/** Jour (Paris) d'un arrosage. */
export function wateredOn(event: Pick<WateringEvent, 'watered_at'>): CivilDate {
  return toCivilDate(event.watered_at, HOME_TIME_ZONE)
}

export function toEngineEvent(event: WateringEvent): EngineEvent {
  return { id: event.id, scheduledOn: event.scheduled_on, wateredOn: wateredOn(event) }
}

/** Photos dans l'ordre : la première est la photo principale. */
export function sortedPhotos(plant: Pick<Plant, 'photos'>): PlantPhoto[] {
  return plant.photos.toSorted((a, b) => a.position - b.position)
}

/** Chemin de la photo principale, s'il y en a une. */
export function mainPhotoPath(plant: Pick<Plant, 'photos'>): string | undefined {
  return sortedPhotos(plant)[0]?.storage_path
}
