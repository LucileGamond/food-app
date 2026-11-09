import { eventFixture } from '@/test/agenda'
import { mealFixture } from '@/test/fakes'
import { plantFixture } from '@/test/plants'
import type { PlantStatus, UpcomingWatering } from '@/modules/plantes/lib/status'
import { eventsByDay, eventsInScope, isSyncedDay, mapsUrl, scopeOptions, sourceStatus } from './agenda'
import { formatMonth, periodOf, sameMonth, shift, startOfWeek, weekdayIndex } from './calendar'
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

describe('périodes', () => {
  it('semaine du lundi au dimanche', () => {
    expect([weekdayIndex('2026-11-09'), weekdayIndex('2026-11-15')]).toEqual([0, 6])
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09')
    const week = periodOf('semaine', '2026-11-10')
    expect([week.from, week.to, week.days.length]).toEqual(['2026-11-09', '2026-11-15', 7])
  })

  it('mois en semaines complètes', () => {
    // Novembre 2026 : du dimanche 1er au lundi 30 → du lundi 26 octobre au dimanche 6 décembre
    const month = periodOf('mois', '2026-11-10')
    expect([month.from, month.to, month.days.length]).toEqual(['2026-10-26', '2026-12-06', 42])
    // Février 2027 : commence un lundi, finit un dimanche → 4 semaines
    expect(periodOf('mois', '2027-02-14').days).toHaveLength(28)
  })

  it('période précédente ou suivante, libellés', () => {
    expect([shift('semaine', '2026-11-10', 1), shift('semaine', '2026-11-10', -1)]).toEqual(['2026-11-17', '2026-11-03'])
    expect([shift('mois', '2026-01-31', 1), shift('mois', '2026-11-10', -1)]).toEqual(['2026-02-28', '2026-10-10'])
    expect([sameMonth('2026-11-01', '2026-11-30'), sameMonth('2026-11-30', '2026-12-01')]).toEqual([true, false])
    expect(formatMonth('2026-11-10')).toBe('Novembre 2026')
  })
})

describe('lieu', () => {
  it('recherche Google Maps', () => {
    expect(mapsUrl('12 rue des Lilas, Lyon')).toBe('https://www.google.com/maps/search/?api=1&query=12%20rue%20des%20Lilas%2C%20Lyon')
  })
})

describe('période synchronisée', () => {
  it('de la semaine passée aux deux mois à venir, jours limites exclus', () => {
    expect(['2026-11-03', '2026-11-04', '2026-11-10', '2027-01-08', '2027-01-09'].map((d) => isSyncedDay(d, '2026-11-10'))).toEqual([false, true, true, true, false])
  })
})
