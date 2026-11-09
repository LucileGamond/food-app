import ICAL from 'ical.js'
import { createIcalProvider, MAX_ICS_CHARS } from './ical-provider.ts'
import { parseIcs, plainText } from './ics.ts'
import { CalendarSyncError, syncWindow } from './provider.ts'

const PARIS = `BEGIN:VTIMEZONE
TZID:Europe/Paris
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`

const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', PARIS, ...events, 'END:VCALENDAR'].join('\r\n')

const vevent = (lines: string) => `BEGIN:VEVENT\r\n${lines.trim().split('\n').map((l) => l.trim()).join('\r\n')}\r\nEND:VEVENT`

// Du 3 novembre au 1er décembre 2026
const WINDOW = { from: new Date('2026-11-03T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') }

describe('lecture iCal', () => {
  it('rendez-vous dans le fuseau du fichier, en UTC, ou sans fuseau (heure de Paris)', () => {
    const ics = calendar(
      vevent(`UID:dentiste@google.com
        DTSTART;TZID=Europe/Paris:20261110T090000
        DTEND;TZID=Europe/Paris:20261110T100000
        SUMMARY:Dentiste
        LOCATION:12 rue des Lilas\\, Lyon`),
      vevent(`UID:visio@google.com
        DTSTART:20261112T130000Z
        DURATION:PT45M
        SUMMARY:Visio`),
      vevent(`UID:flottant@google.com
        DTSTART:20261113T180000
        DTEND:20261113T190000
        SUMMARY:Yoga`),
    )
    expect(parseIcs(ics, WINDOW)).toEqual([
      { uid: 'dentiste@google.com', title: 'Dentiste', location: '12 rue des Lilas, Lyon', description: null, allDay: false, startsAt: '2026-11-10T08:00:00.000Z', endsAt: '2026-11-10T09:00:00.000Z' },
      { uid: 'visio@google.com', title: 'Visio', location: null, description: null, allDay: false, startsAt: '2026-11-12T13:00:00.000Z', endsAt: '2026-11-12T13:45:00.000Z' },
      { uid: 'flottant@google.com', title: 'Yoga', location: null, description: null, allDay: false, startsAt: '2026-11-13T17:00:00.000Z', endsAt: '2026-11-13T18:00:00.000Z' },
    ])
  })

  it('journées entières, anniversaires annuels, titre manquant', () => {
    const ics = calendar(
      vevent(`UID:vacances
        DTSTART;VALUE=DATE:20261120
        DTEND;VALUE=DATE:20261123
        SUMMARY:Vacances`),
      vevent(`UID:anniv
        DTSTART;VALUE=DATE:19900415
        RRULE:FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=8
        SUMMARY:Anniversaire de Léa`),
      vevent(`UID:sans-titre
        DTSTART;VALUE=DATE:20261105`),
    )
    expect(parseIcs(ics, WINDOW)).toEqual([
      { uid: 'vacances', title: 'Vacances', location: null, description: null, allDay: true, startDate: '2026-11-20', endDate: '2026-11-23' },
      { uid: 'anniv#2026-11-08', title: 'Anniversaire de Léa', location: null, description: null, allDay: true, startDate: '2026-11-08', endDate: '2026-11-09' },
      { uid: 'sans-titre', title: 'Sans titre', location: null, description: null, allDay: true, startDate: '2026-11-05', endDate: '2026-11-06' },
    ])
  })

  it('récurrences : dans la période seulement, dates exclues, occurrence déplacée ou annulée, heure d’été', () => {
    const ics = calendar(
      vevent(`UID:piscine
        DTSTART;TZID=Europe/Paris:20261007T190000
        DTEND;TZID=Europe/Paris:20261007T200000
        RRULE:FREQ=WEEKLY;BYDAY=WE
        EXDATE;TZID=Europe/Paris:20261111T190000
        SUMMARY:Piscine`),
      // 18 novembre : déplacée à 20 h
      vevent(`UID:piscine
        RECURRENCE-ID;TZID=Europe/Paris:20261118T190000
        DTSTART;TZID=Europe/Paris:20261118T200000
        DTEND;TZID=Europe/Paris:20261118T210000
        SUMMARY:Piscine (tard)`),
      // 25 novembre : annulée
      vevent(`UID:piscine
        RECURRENCE-ID;TZID=Europe/Paris:20261125T190000
        DTSTART;TZID=Europe/Paris:20261125T190000
        DTEND;TZID=Europe/Paris:20261125T200000
        STATUS:CANCELLED
        SUMMARY:Piscine`),
    )
    expect(parseIcs(ics, WINDOW).map((o) => [o.uid, o.title, o.allDay ? '' : o.startsAt])).toEqual([
      ['piscine#2026-11-04T19:00:00', 'Piscine', '2026-11-04T18:00:00.000Z'],
      ['piscine#2026-11-18T19:00:00', 'Piscine (tard)', '2026-11-18T19:00:00.000Z'],
    ])
    // Heure d'été : 19 h à Paris = 17 h UTC
    const summer = parseIcs(ics, { from: new Date('2026-10-06T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') })
    expect(summer.map((o) => (o.allDay ? '' : o.startsAt))).toEqual(['2026-10-07T17:00:00.000Z'])
  })

  it('ignore les événements annulés ou hors période', () => {
    const ics = calendar(
      vevent(`UID:annule
        DTSTART:20261110T080000Z
        STATUS:CANCELLED
        SUMMARY:Annulé`),
      vevent(`UID:passe
        DTSTART:20250110T080000Z
        SUMMARY:L'an dernier`),
      vevent(`UID:hebdo-annule
        DTSTART:20261104T080000Z
        RRULE:FREQ=WEEKLY
        STATUS:CANCELLED
        SUMMARY:Annulé aussi`),
    )
    expect(parseIcs(ics, WINDOW)).toEqual([])
  })

  it('une exception sans son événement devient un rendez-vous simple', () => {
    const ics = calendar(
      vevent(`UID:orpheline
        RECURRENCE-ID:20261110T080000Z
        DTSTART:20261110T090000Z
        DTEND:20261110T100000Z
        SUMMARY:Seule`),
    )
    expect(parseIcs(ics, WINDOW).map((o) => o.title)).toEqual(['Seule'])
  })

  it('plusieurs exceptions d’une même série reçues sans elle : chacune garde son propre uid', () => {
    // Invitée à trois réunions isolées de la série hebdomadaire d'un collègue.
    const ics = calendar(
      ...['20261110', '20261117', '20261124'].map((day) =>
        vevent(`UID:serie-collegue
          RECURRENCE-ID:${day}T080000Z
          DTSTART:${day}T090000Z
          DTEND:${day}T100000Z
          SUMMARY:Point d'équipe`),
      ),
    )
    const uids = parseIcs(ics, WINDOW).map((o) => o.uid)
    expect(uids).toEqual(['serie-collegue#2026-11-10T08:00:00Z', 'serie-collegue#2026-11-17T08:00:00Z', 'serie-collegue#2026-11-24T08:00:00Z'])
    expect(new Set(uids).size).toBe(3)
  })

  it('série ancienne : les répétitions passées ne sont pas détaillées, sauf celle déplacée dans la période', () => {
    const ics = calendar(
      vevent(`UID:quotidien
        DTSTART:19900101T070000Z
        DTEND:19900101T073000Z
        RRULE:FREQ=DAILY
        SUMMARY:Café`),
      // Répétition de 2025 déplacée dans la période
      vevent(`UID:quotidien
        RECURRENCE-ID:20250101T070000Z
        DTSTART:20261105T150000Z
        DTEND:20261105T153000Z
        SUMMARY:Café rattrapé`),
    )
    const details = vi.spyOn(ICAL.Event.prototype, 'getOccurrenceDetails')
    const occurrences = parseIcs(ics, WINDOW)
    // 28 jours de la période (et l'exception) : pas les ~13 000 répétitions depuis 1990
    expect(details.mock.calls.length).toBeLessThan(40)
    expect(occurrences.filter((o) => o.title === 'Café')).toHaveLength(28)
    expect(occurrences.find((o) => o.title === 'Café rattrapé')).toMatchObject({ uid: 'quotidien#2025-01-01T07:00:00Z', startsAt: '2026-11-05T15:00:00.000Z' })
    details.mockRestore()
  })

  it('description en texte simple, même quand Google y met du HTML', () => {
    const ics = calendar(
      vevent(`UID:visio
        DTSTART:20261110T080000Z
        SUMMARY:Visio
        DESCRIPTION:Ordre du jour :<br>1. Budget<br/><b>2. Vacances</b><br><a href="https://meet.google.com/abc">Rejoindre</a> &amp\\; merci`),
    )
    expect(parseIcs(ics, WINDOW)[0]!.description).toBe('Ordre du jour :\n1. Budget\n2. Vacances\nRejoindre (https://meet.google.com/abc) & merci')
    expect(plainText('<a href="https://x.test">https://x.test</a>')).toBe('https://x.test')
    expect(plainText('A&#233;  \n\n\n\nB')).toBe('Aé\n\nB')
    expect([plainText(''), plainText('  <br> '), plainText(undefined)]).toEqual([null, null, null])
  })

  it('refuse un contenu qui n’est pas un agenda', () => {
    expect(() => parseIcs('<html>Connexion</html>', WINDOW)).toThrow(CalendarSyncError)
    expect(() => parseIcs('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD', WINDOW)).toThrow('Le contenu reçu n’est pas un agenda lisible.')
  })
})

describe('fournisseur iCal', () => {
  const url = 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-abc/basic.ics'
  const ok = calendar(
    vevent(`UID:a
      DTSTART:20261110T080000Z
      SUMMARY:Rdv`),
  )

  it('télécharge l’adresse et lit l’agenda', async () => {
    const fetchMock = vi.fn(async () => new Response(ok))
    const provider = createIcalProvider(fetchMock as unknown as typeof fetch)
    expect(provider.kind).toBe('ical')
    expect((await provider.fetchOccurrences({ provider: 'ical', url }, WINDOW)).map((o) => o.title)).toEqual(['Rdv'])
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('ne va chercher que chez Google', async () => {
    const fetchMock = vi.fn()
    await expect(createIcalProvider(fetchMock).fetchOccurrences({ provider: 'ical', url: 'https://evil.test/basic.ics' }, WINDOW)).rejects.toThrow('Adresse d’agenda non autorisée.')
    expect(fetchMock).not.toHaveBeenCalled()
    const redirected = Object.defineProperty(new Response(ok), 'url', { value: 'https://evil.test/basic.ics' })
    await expect(createIcalProvider(async () => redirected).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Adresse d’agenda non autorisée.')
  })

  it('messages lisibles selon la réponse', async () => {
    const fetchWith = (response: Response | Error) => createIcalProvider(async () => (response instanceof Error ? Promise.reject(response) : response))
    await expect(fetchWith(new Response('', { status: 404 })).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Agenda introuvable')
    await expect(fetchWith(new Response('', { status: 403 })).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Google refuse l’accès')
    await expect(fetchWith(new Response('', { status: 503 })).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Agenda injoignable')
    await expect(fetchWith(new TypeError('réseau')).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Agenda injoignable')
    await expect(fetchWith(new Response('x'.repeat(MAX_ICS_CHARS + 1))).fetchOccurrences({ provider: 'ical', url }, WINDOW)).rejects.toThrow('Agenda trop volumineux.')
  })
})

describe('période synchronisée', () => {
  it('la semaine passée et les deux mois à venir', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    expect(syncWindow(now)).toEqual({ from: new Date('2026-11-03T12:00:00Z'), to: new Date('2027-01-09T12:00:00Z') })
  })
})
