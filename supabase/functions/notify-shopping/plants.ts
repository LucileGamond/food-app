// Rappels d'arrosage du matin (module Plantes), envoyés par la même fonction que les notifications de courses.
// À qui (page affichée, rappels non coupés, une fois par jour) : la base (claim_plant_reminders) ; quelles plantes :
// le moteur partagé avec l'application (_shared/watering).

import { plantSchedule, type WateringEvent, type WateringRule } from '../_shared/watering/schedule.ts'
import type { PushPayload } from './message.ts'

export interface PlantData {
  name: string
  rules: WateringRule[]
  events: WateringEvent[]
}

export interface DuePlant {
  name: string
  amountMl: number
  overdueDays: number
}

function formatAmount(ml: number): string {
  return ml >= 1000 ? `${String(ml / 1000).replace('.', ',')} L` : `${ml} ml`
}

/** Plantes dont une échéance est à faire aujourd'hui (ou en retard), les plus en retard d'abord, puis par nom. */
export function duePlants(plants: PlantData[], today: string): DuePlant[] {
  return plants
    .map((plant) => ({ plant, schedule: plantSchedule(plant.rules, plant.events, today) }))
    .filter(({ schedule }) => schedule.pending !== null)
    .map(({ plant, schedule }) => ({ name: plant.name, amountMl: schedule.pending!.amountMl, overdueDays: schedule.overdueDays }))
    .sort((a, b) => b.overdueDays - a.overdueDays || a.name.localeCompare(b.name, 'fr'))
}

/** « 2 plantes à arroser » : « Cactus (1 L), Monstera (250 ml) » (4 au plus, puis « et 2 autres »). */
export function buildPlantsMessage(due: DuePlant[], today: string): PushPayload {
  const list = due.map((p) => `${p.name} (${formatAmount(p.amountMl)})`)
  const others = list.length - 4
  return {
    title: due.length === 1 ? '1 plante à arroser 🪴' : `${due.length} plantes à arroser 🪴`,
    body: list.slice(0, 4).join(', ') + (others > 0 ? ` et ${others} autre${others > 1 ? 's' : ''}` : ''),
    url: '/plantes',
    tag: `plants-${today}`,
  }
}
