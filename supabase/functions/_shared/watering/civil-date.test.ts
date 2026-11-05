import { describe, expect, it } from 'vitest'
import { addDays, addMonths, compareDates, daysBetween, daysInMonth, isCivilDate, makeDate, parts, toCivilDate } from './civil-date.ts'

describe('dates civiles', () => {
  it('lit et valide une date', () => {
    expect(parts('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
    expect(isCivilDate('2028-02-29')).toBe(true)
    expect(isCivilDate('2026-02-29')).toBe(false)
    expect(isCivilDate('2026-13-01')).toBe(false)
    expect(isCivilDate('26-1-1')).toBe(false)
    expect(() => parts('n/a')).toThrow(RangeError)
  })

  it('compose une date sur 4/2/2 chiffres', () => {
    expect(makeDate(2026, 3, 5)).toBe('2026-03-05')
  })

  it('connaît la longueur des mois, années bissextiles comprises', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('ajoute des jours en traversant mois, années et changements d’heure', () => {
    expect(addDays('2026-10-24', 8)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('ajoute des mois en ramenant au dernier jour si besoin', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-10', -13)).toBe('2024-12-10')
  })

  it('compte les jours entre deux dates et les compare', () => {
    expect(daysBetween('2026-10-01', '2026-10-24')).toBe(23)
    expect(daysBetween('2026-10-24', '2026-10-01')).toBe(-23)
    expect(compareDates('2026-01-02', '2026-01-10')).toBe(-1)
    expect(compareDates('2026-01-10', '2026-01-02')).toBe(1)
    expect(compareDates('2026-01-10', '2026-01-10')).toBe(0)
  })

  it('donne le jour civil à Paris d’un instant UTC', () => {
    expect(toCivilDate('2026-10-24T22:30:00Z')).toBe('2026-10-25')
    expect(toCivilDate(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01')
    expect(toCivilDate('2026-10-24T22:30:00Z', 'UTC')).toBe('2026-10-24')
  })
})
