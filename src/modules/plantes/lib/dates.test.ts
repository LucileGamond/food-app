import { formatFullDate, formatLongDate, formatRelativeDay, formatShortDate, formatTime, parisToday } from './dates'

describe('dates des arrosages', () => {
  it('jour du foyer : heure de Paris, quel que soit le fuseau de l’appareil', () => {
    expect(parisToday(new Date('2026-10-24T12:00:00Z'))).toBe('2026-10-24')
    expect(parisToday(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
  })

  it('formats français', () => {
    expect(formatLongDate('2026-10-20')).toBe('mardi 20 octobre')
    expect(formatShortDate('2026-10-20')).toBe('20 oct.')
    expect(formatFullDate('2026-10-20')).toBe('20 octobre 2026')
    expect(formatTime('2026-10-24T07:05:00Z')).toBe('9 h 05')
  })

  it('jours relatifs', () => {
    const ref = '2026-10-24'
    expect(formatRelativeDay('2026-10-24', ref)).toBe('aujourd’hui')
    expect(formatRelativeDay('2026-10-23', ref)).toBe('hier')
    expect(formatRelativeDay('2026-10-25', ref)).toBe('demain')
    expect(formatRelativeDay('2026-10-28', ref)).toBe('dans 4 jours')
    expect(formatRelativeDay('2026-10-20', ref)).toBe('il y a 4 jours')
    expect(formatRelativeDay('2026-11-05', ref)).toBe('le 5 nov.')
  })
})
