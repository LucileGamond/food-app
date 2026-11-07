import { formatOccurrenceTime, formatTime } from './format.ts'
import { isGoogleHost, normalizeIcalUrl } from './ical-url.ts'
import { compareOccurrences, occurrenceDays, occurrencesOn, occursOn, type CalendarOccurrence } from './occurrence.ts'
import { inScope, isAgendaScope } from './scope.ts'

const timed = (title: string, startsAt: string, endsAt: string): CalendarOccurrence => ({ uid: title, title, location: null, allDay: false, startsAt, endsAt })
const allDay = (title: string, startDate: string, endDate: string): CalendarOccurrence => ({ uid: title, title, location: null, allDay: true, startDate, endDate })

describe('jours d’une occurrence (heure de Paris)', () => {
  it('rendez-vous : le jour où il tombe à Paris, pas en UTC', () => {
    // 23 h 30 UTC le 9 = 0 h 30 le 10 à Paris (heure d'hiver)
    expect(occurrenceDays(timed('Tard', '2026-11-09T23:30:00Z', '2026-11-10T00:30:00Z'))).toEqual({ first: '2026-11-10', last: '2026-11-10' })
  })

  it('un rendez-vous qui finit pile à minuit ne déborde pas sur le lendemain', () => {
    const soiree = timed('Soirée', '2026-11-10T19:00:00Z', '2026-11-10T23:00:00Z') // 20 h → minuit à Paris
    expect(occurrenceDays(soiree)).toEqual({ first: '2026-11-10', last: '2026-11-10' })
    expect(occursOn(soiree, '2026-11-11')).toBe(false)
  })

  it('journées entières : fin exclue, sur plusieurs jours', () => {
    const vacances = allDay('Vacances', '2026-11-10', '2026-11-13')
    expect(occurrenceDays(vacances)).toEqual({ first: '2026-11-10', last: '2026-11-12' })
    expect(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'].map((d) => occursOn(vacances, d))).toEqual([false, true, true, false])
  })

  it('rendez-vous sans durée : un instant, le jour de son début', () => {
    expect(occurrenceDays(timed('Rappel', '2026-11-10T08:00:00Z', '2026-11-10T08:00:00Z'))).toEqual({ first: '2026-11-10', last: '2026-11-10' })
  })
})

describe('ordre d’affichage', () => {
  it('journées entières d’abord, puis par heure, puis par titre', () => {
    const list = [
      timed('Dentiste', '2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z'),
      timed('Café', '2026-11-10T08:00:00Z', '2026-11-10T09:00:00Z'),
      allDay('Anniversaire de Léa', '2026-11-10', '2026-11-11'),
      timed('Banque', '2026-11-10T08:00:00Z', '2026-11-10T08:30:00Z'),
      timed('Demain', '2026-11-11T08:00:00Z', '2026-11-11T09:00:00Z'),
    ]
    expect(occurrencesOn(list, '2026-11-10').map((o) => o.title)).toEqual(['Anniversaire de Léa', 'Banque', 'Café', 'Dentiste'])
    expect(compareOccurrences(list[0]!, list[0]!)).toBe(0)
  })
})

describe('horaires', () => {
  it('heures à la française', () => {
    expect(formatTime('2026-11-10T08:00:00Z')).toBe('9 h')
    expect(formatTime('2026-11-10T13:05:00Z')).toBe('14 h 05')
    expect(formatTime('2026-07-10T22:30:00Z')).toBe('0 h 30')
  })

  it('selon le jour regardé', () => {
    expect(formatOccurrenceTime(allDay('Férié', '2026-11-11', '2026-11-12'), '2026-11-11')).toBe('Journée')
    expect(formatOccurrenceTime(timed('Dentiste', '2026-11-10T08:00:00Z', '2026-11-10T09:30:00Z'), '2026-11-10')).toBe('9 h – 10 h 30')
    expect(formatOccurrenceTime(timed('Rappel', '2026-11-10T08:00:00Z', '2026-11-10T08:00:00Z'), '2026-11-10')).toBe('9 h')
    const weekend = timed('Week-end', '2026-11-13T17:00:00Z', '2026-11-15T11:00:00Z')
    expect(['2026-11-13', '2026-11-14', '2026-11-15'].map((d) => formatOccurrenceTime(weekend, d))).toEqual(['dès 18 h', 'Journée', 'jusqu’à 12 h'])
  })
})

describe('agendas affichés', () => {
  it('les miens, ceux de l’autre, les deux', () => {
    expect([inScope('lucile', 'lucile', 'mine'), inScope('eric', 'lucile', 'mine')]).toEqual([true, false])
    expect([inScope('lucile', 'lucile', 'other'), inScope('eric', 'lucile', 'other')]).toEqual([false, true])
    expect([inScope('lucile', 'lucile', 'all'), inScope('eric', 'lucile', 'all')]).toEqual([true, true])
    expect([isAgendaScope('all'), isAgendaScope('tous'), isAgendaScope(null)]).toEqual([true, false, false])
  })
})

describe('adresses iCal', () => {
  const secret = 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-0123abcd/basic.ics'

  it('accepte l’adresse secrète d’un agenda Google, nettoyée', () => {
    expect(normalizeIcalUrl(`  ${secret} `)).toBe(secret)
    expect(normalizeIcalUrl(secret.replace('https://', 'webcal://'))).toBe(secret)
    expect(normalizeIcalUrl('https://calendar.google.com/calendar/ical/fr.french%23holiday%40group.v.calendar.google.com/public/basic.ics')).not.toBeNull()
  })

  it('refuse toute autre adresse', () => {
    for (const url of [
      'http://calendar.google.com/calendar/ical/a/private-b/basic.ics',
      'https://calendar.google.com.evil.test/calendar/ical/a/private-b/basic.ics',
      'https://evil.test/calendar/ical/a/private-b/basic.ics',
      'https://calendar.google.com/calendar/ical/a/private-b/basic.ics?redirect=x',
      'https://calendar.google.com/calendar/embed?src=a',
      '',
    ])
      expect(normalizeIcalUrl(url), url).toBeNull()
  })

  it('hôte Google après redirection', () => {
    expect([isGoogleHost('https://calendar.google.com/x'), isGoogleHost('https://google.com'), isGoogleHost('https://google.com.evil.test'), isGoogleHost('http://calendar.google.com'), isGoogleHost('pas une url')]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})
