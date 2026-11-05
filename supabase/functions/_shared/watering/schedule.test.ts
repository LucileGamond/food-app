import { describe, expect, it } from 'vitest'
import { blockStartMonth, isDone, occurrences, plantSchedule, scheduleBetween, upcoming, type WateringEvent, type WateringRule } from './schedule.ts'

function rule(overrides: Partial<WateringRule> = {}): WateringRule {
  return { id: 'r', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], firstWateringOn: '2026-01-01', intervalCount: 1, intervalUnit: 'week', amountMl: 250, ...overrides }
}

const dates = (list: { date: string }[]) => list.map((o) => o.date)

// Le cactus de l'exemple : 1 L par mois en été, 200 ml toutes les 6 semaines en hiver, rien entre les deux.
const SUMMER = rule({ id: 'ete', months: [6, 7, 8], firstWateringOn: '2026-06-05', intervalCount: 1, intervalUnit: 'month', amountMl: 1000 })
const WINTER = rule({ id: 'hiver', months: [11, 12, 1, 2], firstWateringOn: '2026-11-15', intervalCount: 6, intervalUnit: 'week', amountMl: 200 })

describe('blockStartMonth', () => {
  it('trouve le début du bloc, y compris à cheval sur deux années', () => {
    expect(blockStartMonth([6, 7, 8])).toBe(6)
    expect(blockStartMonth([12, 1, 2, 11])).toBe(11)
    expect(blockStartMonth([3])).toBe(3)
  })

  it('renvoie null pour toute l’année', () => {
    expect(blockStartMonth([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBeNull()
  })
})

describe('occurrences', () => {
  it('toute l’année : une échéance par intervalle à partir du 1er arrosage', () => {
    expect(dates(occurrences(rule({ firstWateringOn: '2026-10-01' }), '2026-09-01', '2026-10-31'))).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
      '2026-10-29',
    ])
  })

  it('tous les N jours, en plein milieu d’une longue série', () => {
    const r = rule({ firstWateringOn: '2025-01-01', intervalCount: 3, intervalUnit: 'day' })
    // 2025-01-01 + 657 jours = 2026-10-20, multiple de 3
    expect(dates(occurrences(r, '2026-10-20', '2026-10-28'))).toEqual(['2026-10-20', '2026-10-23', '2026-10-26'])
  })

  it('rien avant le tout premier arrosage', () => {
    expect(occurrences(rule({ firstWateringOn: '2027-01-01' }), '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('porte la règle et la quantité', () => {
    expect(occurrences(SUMMER, '2026-06-01', '2026-06-30')).toEqual([{ date: '2026-06-05', ruleId: 'ete', amountMl: 1000 }])
  })

  it('saison d’été : seulement les mois choisis, et le rythme reprend chaque année au même jour', () => {
    expect(dates(occurrences(SUMMER, '2026-01-01', '2027-12-31'))).toEqual([
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
      '2027-06-05',
      '2027-07-05',
      '2027-08-05',
    ])
  })

  it('saison d’hiver à cheval sur deux années', () => {
    expect(dates(occurrences(WINTER, '2026-01-01', '2027-03-31'))).toEqual(['2026-11-15', '2026-12-27', '2027-02-07'])
  })

  it('les années suivantes, le rythme couvre aussi le début de la période (avant le jour d’ancrage)', () => {
    const r = rule({ months: [11, 12, 1, 2], firstWateringOn: '2026-12-10', intervalCount: 2, intervalUnit: 'week' })
    // 2026 : rien avant le 10 déc. ; 2027-2028 : séries calées sur le 10 déc. dans les deux sens.
    expect(dates(occurrences(r, '2026-11-01', '2027-01-31'))).toEqual(['2026-12-10', '2026-12-24', '2027-01-07', '2027-01-21'])
    expect(dates(occurrences(r, '2027-11-01', '2027-12-31'))).toEqual(['2027-11-12', '2027-11-26', '2027-12-10', '2027-12-24'])
  })

  it('« tous les mois » depuis le 31 : dernier jour des mois courts, sans dérive', () => {
    const r = rule({ firstWateringOn: '2026-01-31', intervalCount: 1, intervalUnit: 'month' })
    expect(dates(occurrences(r, '2026-01-01', '2026-05-31'))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('1er arrosage un 29 février : 28 février les années non bissextiles', () => {
    const r = rule({ months: [2], firstWateringOn: '2028-02-29', intervalCount: 1, intervalUnit: 'month' })
    expect(dates(occurrences(r, '2028-01-01', '2030-12-31'))).toEqual(['2028-02-29', '2029-02-28', '2030-02-28'])
  })

  it('une fréquence plus longue que la période donne une seule échéance par an', () => {
    const r = rule({ months: [4], firstWateringOn: '2026-04-10', intervalCount: 2, intervalUnit: 'month' })
    expect(dates(occurrences(r, '2026-01-01', '2027-12-31'))).toEqual(['2026-04-10', '2027-04-10'])
  })

  it('intervalle vide ou inversé', () => {
    expect(occurrences(SUMMER, '2026-09-01', '2026-10-31')).toEqual([])
    expect(occurrences(SUMMER, '2026-08-31', '2026-06-01')).toEqual([])
  })
})

describe('scheduleBetween / upcoming', () => {
  it('fusionne et trie les échéances de plusieurs règles', () => {
    expect(dates(scheduleBetween([WINTER, SUMMER], '2026-06-01', '2027-01-31'))).toEqual([
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
      '2026-11-15',
      '2026-12-27',
    ])
  })

  it('donne les N prochaines échéances', () => {
    expect(dates(upcoming([SUMMER, WINTER], '2026-08-06', 3))).toEqual(['2026-11-15', '2026-12-27', '2027-02-07'])
  })

  it('aucune règle : aucune échéance', () => {
    expect(upcoming([], '2026-01-01', 5)).toEqual([])
  })
})

describe('isDone', () => {
  const occ = { date: '2026-10-20', ruleId: 'r', amountMl: 250 }
  const ev = (scheduledOn: string | null, wateredOn: string): WateringEvent => ({ id: 'e', scheduledOn, wateredOn })

  it('fait si un arrosage couvre explicitement l’échéance, même en avance', () => {
    expect(isDone(occ, [ev('2026-10-20', '2026-10-19')])).toBe(true)
    expect(isDone(occ, [ev('2026-10-13', '2026-10-20')])).toBe(false)
  })

  it('fait si un arrosage hors planning a eu lieu le jour même ou après', () => {
    expect(isDone(occ, [ev(null, '2026-10-20')])).toBe(true)
    expect(isDone(occ, [ev(null, '2026-10-22')])).toBe(true)
    expect(isDone(occ, [ev(null, '2026-10-19')])).toBe(false)
  })
})

describe('plantSchedule', () => {
  const weekly = rule({ id: 'w', firstWateringOn: '2026-10-01' }) // jeudis

  it('échéance du jour à faire', () => {
    expect(plantSchedule([weekly], [], '2026-10-22')).toEqual({
      pending: { date: '2026-10-22', ruleId: 'w', amountMl: 250 },
      overdueDays: 0,
      next: { date: '2026-10-29', ruleId: 'w', amountMl: 250 },
    })
  })

  it('en retard : seule la dernière échéance compte, avec le nombre de jours de retard', () => {
    const s = plantSchedule([weekly], [], '2026-10-24')
    expect(s.pending?.date).toBe('2026-10-22')
    expect(s.overdueDays).toBe(2)
  })

  it('rien à faire une fois arrosée', () => {
    const s = plantSchedule([weekly], [{ id: 'e', scheduledOn: '2026-10-22', wateredOn: '2026-10-22' }], '2026-10-24')
    expect(s.pending).toBeNull()
    expect(s.overdueDays).toBe(0)
    expect(s.next?.date).toBe('2026-10-29')
  })

  it('hors saison : rien à faire, prochaine échéance à la saison suivante', () => {
    const s = plantSchedule([SUMMER, WINTER], [{ id: 'e', scheduledOn: '2026-08-05', wateredOn: '2026-08-05' }], '2026-10-24')
    expect(s.pending).toBeNull()
    expect(s.next).toEqual({ date: '2026-11-15', ruleId: 'hiver', amountMl: 200 })
  })

  it('un oubli de la saison terminée n’est plus à faire', () => {
    // 5 août jamais arrosé ; en octobre l'été est fini.
    expect(plantSchedule([SUMMER, WINTER], [], '2026-10-24')).toMatchObject({ pending: null, overdueDays: 0 })
    // …mais le 20 août il l'était encore.
    expect(plantSchedule([SUMMER], [], '2026-08-20')).toMatchObject({ pending: { date: '2026-08-05' }, overdueDays: 15 })
  })

  it('sans règle : ni échéance ni prochaine date', () => {
    expect(plantSchedule([], [], '2026-10-24')).toEqual({ pending: null, overdueDays: 0, next: null })
  })
})
