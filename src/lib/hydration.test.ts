import { parisTime, startOfDay, formatCl, formatElapsed, formatLiters, lastDrink, nextReminder, totalMl, type WaterIntake } from './hydration'

// Heures locales (Europe/Paris dans les tests)
const at = (time: string) => new Date(`2026-11-10T${time}:00`)
const glass = (time: string, volume_ml = 200): WaterIntake => ({ id: time, volume_ml, drunk_at: at(time).toISOString() })

describe('hydratation', () => {
  it('additionne et met en forme', () => {
    expect(totalMl([glass('10:00'), glass('11:00', 330)])).toBe(530)
    expect(formatLiters(1500)).toBe('1,5 L')
    expect(formatLiters(530)).toBe('0,53 L')
    expect(formatLiters(0)).toBe('0 L')
    expect(formatCl(330)).toBe('33 cl')
    expect(formatElapsed(35 * 60_000)).toBe('35 min')
    expect(formatElapsed(130 * 60_000)).toBe('2 h 10')
    expect(formatElapsed(120 * 60_000)).toBe('2 h')
    expect(formatElapsed(-5)).toBe('0 min')
  })

  it('retrouve le dernier verre', () => {
    expect(lastDrink([])).toBeNull()
    expect(lastDrink([glass('14:05'), glass('09:30')])).toEqual(at('14:05'))
  })

  it('prévoit le rappel 4 h après le dernier verre, ou après 9 h', () => {
    expect(nextReminder([], 1500, at('08:00'))).toEqual(at('13:00'))
    expect(nextReminder([glass('07:00')], 1500, at('08:00'))).toEqual(at('13:00'))
    expect(nextReminder([glass('14:05')], 1500, at('15:00'))).toEqual(at('18:05'))
  })

  it('journée et rappels à l’heure de Paris, quel que soit le fuseau du téléphone', () => {
    // 10 janvier (hiver, UTC+1) et 10 juillet (été, UTC+2)
    expect(startOfDay(new Date('2026-01-10T15:00:00Z')).toISOString()).toBe('2026-01-09T23:00:00.000Z')
    expect(startOfDay(new Date('2026-07-10T15:00:00Z')).toISOString()).toBe('2026-07-09T22:00:00.000Z')
    // 23 h 30 UTC le 10 juillet : déjà le 11 à Paris
    expect(startOfDay(new Date('2026-07-10T23:30:00Z')).toISOString()).toBe('2026-07-10T22:00:00.000Z')
    expect(parisTime(new Date('2026-07-10T15:00:00Z'), 9).toISOString()).toBe('2026-07-10T07:00:00.000Z')
  })

  it('heure passée : annonce le rappel suivant, 4 h après le précédent', () => {
    // Rien bu : rappel parti à 13 h, le suivant vers 17 h, puis 21 h
    expect(nextReminder([], 1500, at('15:00'))).toEqual(at('17:00'))
    expect(nextReminder([], 1500, at('13:00'))).toEqual(at('17:00'))
    expect(nextReminder([], 1500, at('18:30'))).toEqual(at('21:00'))
    // Après 21 h : le suivant tomberait après 23 h
    expect(nextReminder([], 1500, at('21:30'))).toBeNull()
    expect(nextReminder([glass('10:00')], 1500, at('16:00'))).toEqual(at('18:00'))
  })

  it('pas de rappel une fois l’objectif atteint, ni après 23 h', () => {
    expect(nextReminder([glass('10:00', 1500)], 1500, at('11:00'))).toBeNull()
    expect(nextReminder([glass('19:30')], 1500, at('20:00'))).toBeNull()
  })
})
