import {
  currentHour, addDays, formatCompactDate, formatDay, formatFullDate, formatRange, formatShortDate, nextDays, parseIsoDate, toIsoDate, todayIso } from './dates'

describe('dates', () => {
  it('convertit une date locale en ISO sans décalage de fuseau', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayIso(new Date(2026, 9, 20, 0, 1))).toBe('2026-10-20')
  })

  it('parse une date ISO et refuse les dates invalides', () => {
    expect(parseIsoDate('2026-10-20').getDate()).toBe(20)
    expect(() => parseIsoDate('2026-02-30')).toThrow('Date invalide')
    expect(() => parseIsoDate('20/10/2026')).toThrow('Date invalide')
  })

  it('ajoute des jours en traversant les mois, les années et le changement d’heure', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDays('2026-10-20', -7)).toBe('2026-10-13')
  })

  it('donne une fenêtre glissante de 7 jours par défaut', () => {
    expect(nextDays('2026-10-29')).toEqual([
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ])
    expect(nextDays('2026-10-20', 2)).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('formate les dates en français', () => {
    expect(formatDay('2026-10-20')).toBe('Mardi 20 octobre')
    expect(formatShortDate('2026-11-01')).toBe('1 novembre')
    expect(formatRange('2026-10-20')).toBe('Du 20 octobre au 26 octobre')
    expect(formatFullDate('2025-08-26')).toBe('26 août 2025')
    expect(formatCompactDate('2025-12-23')).toBe('23 déc. 2025')
  })
})

describe('currentHour', () => {
  it('donne l’heure locale', () => {
    expect(currentHour(new Date(2026, 9, 24, 21, 5))).toBe(21)
  })
})
