import { eventFixture, plantFixture, ruleFixture } from '@/test/plants'
import { mainPhotoPath, toEngineEvent, wateredOn } from './plants'
import { buildStatuses, doneToday, locations, toWater, upcomingWaterings } from './status'

const TODAY = '2026-10-24' // samedi ; la règle par défaut tombe les jeudis (22, 29 oct.)

describe('buildStatuses', () => {
  it('calcule l’échéance en attente et le dernier arrosage', () => {
    const plant = plantFixture()
    const older = eventFixture({ id: 'old', scheduled_on: '2026-10-15', watered_at: '2026-10-15T08:00:00Z' })
    const [status] = buildStatuses([plant], [older], TODAY)
    expect(status?.schedule.pending?.date).toBe('2026-10-22')
    expect(status?.schedule.overdueDays).toBe(2)
    expect(status?.lastEvent?.id).toBe('old')
  })

  it('ignore les plantes archivées', () => {
    expect(buildStatuses([plantFixture({ archived_at: '2026-10-01T00:00:00Z' })], [], TODAY)).toEqual([])
  })

  it('une plante arrosée n’est plus en attente', () => {
    const [status] = buildStatuses([plantFixture()], [eventFixture()], TODAY)
    expect(status?.schedule.pending).toBeNull()
    expect(status?.lastEvent?.id).toBe('event-1')
  })
})

describe('toWater', () => {
  it('les plus en retard d’abord, puis par nom', () => {
    const a = plantFixture({ id: 'a', name: 'Basilic', rules: [ruleFixture({ first_watering_on: '2026-10-24', interval_unit: 'day' })] })
    const b = plantFixture({ id: 'b', name: 'Aloe', rules: [ruleFixture({ first_watering_on: '2026-10-24', interval_unit: 'day' })] })
    const c = plantFixture({ id: 'c', name: 'Cactus' })
    const d = plantFixture({ id: 'd', name: 'Ficus', rules: [] })
    expect(toWater(buildStatuses([a, b, c, d], [], TODAY)).map((s) => s.plant.name)).toEqual(['Cactus', 'Aloe', 'Basilic'])
  })
})

describe('doneToday', () => {
  it('liste les arrosages du jour (heure de Paris), plus récents d’abord', () => {
    const plant = plantFixture()
    const archived = plantFixture({ id: 'arch', archived_at: '2026-10-01T00:00:00Z' })
    const events = [
      eventFixture({ id: 'morning', watered_at: '2026-10-24T06:00:00Z' }),
      eventFixture({ id: 'evening', watered_at: '2026-10-24T18:00:00Z' }),
      eventFixture({ id: 'late-yesterday', watered_at: '2026-10-23T21:30:00Z' }), // 23 h 30 à Paris
      eventFixture({ id: 'after-midnight', watered_at: '2026-10-23T22:30:00Z' }), // 0 h 30 le 24 à Paris
      eventFixture({ id: 'archived', plant_id: 'arch', watered_at: '2026-10-24T08:00:00Z' }),
    ]
    expect(doneToday([plant, archived], events, TODAY).map((d) => d.event.id)).toEqual(['evening', 'morning', 'after-midnight'])
  })
})

describe('upcomingWaterings', () => {
  it('liste les échéances à venir, par date puis par nom', () => {
    const weekly = plantFixture({ id: 'w', name: 'Monstera' })
    const daily = plantFixture({ id: 'd', name: 'Basilic', rules: [ruleFixture({ first_watering_on: '2026-10-01', interval_count: 3, interval_unit: 'day' })] })
    const list = upcomingWaterings(buildStatuses([weekly, daily], [], TODAY), TODAY, 7)
    expect(list.map((u) => `${u.occurrence.date} ${u.plant.name}`)).toEqual([
      '2026-10-25 Basilic',
      '2026-10-28 Basilic',
      '2026-10-29 Monstera',
      '2026-10-31 Basilic',
    ])
  })
})

describe('utilitaires', () => {
  it('emplacements distincts triés', () => {
    expect(locations([plantFixture({ location: 'Salon' }), plantFixture({ location: 'Balcon' }), plantFixture({ location: null }), plantFixture({ location: 'Salon' })])).toEqual([
      'Balcon',
      'Salon',
    ])
  })

  it('photo principale = plus petite position', () => {
    expect(mainPhotoPath({ photos: [{ id: 'b', storage_path: 'b', position: 1 }, { id: 'a', storage_path: 'a', position: 0 }] })).toBe('a')
    expect(mainPhotoPath({ photos: [] })).toBeUndefined()
  })

  it('jour civil d’un arrosage et conversion pour le moteur', () => {
    expect(wateredOn({ watered_at: '2026-10-23T22:30:00Z' })).toBe('2026-10-24')
    expect(toEngineEvent(eventFixture({ scheduled_on: null, watered_at: '2026-10-23T22:30:00Z' }))).toEqual({ id: 'event-1', scheduledOn: null, wateredOn: '2026-10-24' })
  })
})
