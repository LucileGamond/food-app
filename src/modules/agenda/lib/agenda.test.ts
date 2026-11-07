import { eventFixture } from '@/test/agenda'
import { mealFixture } from '@/test/fakes'
import { plantFixture } from '@/test/plants'
import type { PlantStatus, UpcomingWatering } from '@/modules/plantes/lib/status'
import { eventsByDay, eventsInScope, scopeOptions, sourceStatus } from './agenda'
import { mealExtras, wateringExtras } from './extras'

describe('agenda', () => {
  it('état de la synchronisation d’une source', () => {
    expect(sourceStatus({ lastSyncedAt: null, lastError: null })).toBe('pending')
    expect(sourceStatus({ lastSyncedAt: '2026-11-10T08:00:00Z', lastError: null })).toBe('ok')
    expect(sourceStatus({ lastSyncedAt: '2026-11-10T08:00:00Z', lastError: 'Agenda introuvable.' })).toBe('error')
  })

  it('agendas affichés et jours de la semaine', () => {
    const mine = eventFixture({ title: 'Dentiste', ownerId: 'me' })
    const his = eventFixture({ title: 'Réunion', ownerId: 'him', startsAt: '2026-11-11T08:00:00Z', endsAt: '2026-11-11T09:00:00Z' })
    expect(eventsInScope([mine, his], 'me', 'mine')).toEqual([mine])
    expect(eventsInScope([mine, his], 'me', 'other')).toEqual([his])
    expect(eventsByDay([his, mine], ['2026-11-10', '2026-11-11', '2026-11-12'])).toEqual([
      { day: '2026-11-10', events: [mine] },
      { day: '2026-11-11', events: [his] },
      { day: '2026-11-12', events: [] },
    ])
  })

  it('libellés du choix des agendas', () => {
    expect(scopeOptions('Eric').map((o) => o.label)).toEqual(['Moi', 'Eric', 'Les deux'])
  })
})

describe('repas et arrosages de la semaine', () => {
  it('repas du jour, midi puis soir', () => {
    const meals = [
      mealFixture({ id: 'soir', meal_date: '2026-11-10', slot: 'DINNER', recipe: { title: 'Soupe' } }),
      mealFixture({ id: 'midi', meal_date: '2026-11-10', slot: 'LUNCH', recipe: { title: 'Salade' } }),
      mealFixture({ id: 'autre', meal_date: '2026-11-11', recipe: { title: 'Pâtes' } }),
    ]
    expect(mealExtras(meals, '2026-11-10').map((e) => [e.label, e.text])).toEqual([
      ['Midi', 'Salade'],
      ['Soir', 'Soupe'],
    ])
  })

  it('arrosages : à faire aujourd’hui, prévus ensuite, rien pour les jours passés', () => {
    const basilic = plantFixture({ id: 'b', name: 'Basilic' })
    const ficus = plantFixture({ id: 'f', name: 'Ficus' })
    const waterings = {
      toWater: [{ plant: basilic, schedule: { pending: { date: '2026-11-09', ruleId: 'r', amountMl: 100 } } } as unknown as PlantStatus],
      upcoming: [{ plant: ficus, occurrence: { date: '2026-11-12', ruleId: 'r', amountMl: 1500 } } as UpcomingWatering],
    }
    expect(wateringExtras(waterings, '2026-11-10', '2026-11-10').map((e) => e.text)).toEqual(['Basilic · 100 ml'])
    expect(wateringExtras(waterings, '2026-11-12', '2026-11-10').map((e) => e.text)).toEqual(['Ficus · 1,5 L'])
    expect(wateringExtras(waterings, '2026-11-11', '2026-11-10')).toEqual([])
    expect(wateringExtras(waterings, '2026-11-09', '2026-11-10')).toEqual([])
  })
})
