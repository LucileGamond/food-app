import { computePresence, keywordsTooLong, matchesKeyword, MAX_KEYWORDS_CHARS, parisInstant, parseKeywords, type PresenceEvent, type PresenceRule } from './presence'

const LUCILE = '11111111-1111-1111-1111-111111111111'
const ERIC = '22222222-2222-2222-2222-222222222222'
const PROFILES = [
  { id: ERIC, display_name: 'Eric' },
  { id: LUCILE, display_name: 'Lucile' },
]
const RULES: PresenceRule[] = [{ profileId: LUCILE, weekdayLunchAtWork: true, ignoredKeywords: ['escalade'] }]

// Lundi 9 novembre 2026 (heure d'hiver : Paris = UTC+1)
const MONDAY = '2026-11-09'
const SATURDAY = '2026-11-14'

const timed = (ownerId: string, title: string, startsAt: string, endsAt: string): PresenceEvent => ({ ownerId, title, allDay: false, startsAt, endsAt })

function slot(result: ReturnType<typeof computePresence>, date: string, mealSlot: 'LUNCH' | 'DINNER') {
  return result.find((s) => s.date === date && s.slot === mealSlot)!
}

describe('parisInstant', () => {
  it('convertit une heure de Paris en instant, été comme hiver', () => {
    expect(new Date(parisInstant('2026-11-09', 12 * 60)).toISOString()).toBe('2026-11-09T11:00:00.000Z')
    expect(new Date(parisInstant('2026-07-01', 19 * 60)).toISOString()).toBe('2026-07-01T17:00:00.000Z')
  })
})

describe('matchesKeyword', () => {
  it('ignore casse et accents, et les mots-clés vides', () => {
    expect(matchesKeyword('Séance d’ESCALADE', ['escalade'])).toBe(true)
    expect(matchesKeyword('Escalade', ['  '])).toBe(false)
    expect(matchesKeyword('Dentiste', ['escalade'])).toBe(false)
  })
})

describe('computePresence', () => {
  it('donne deux créneaux par jour, midi puis soir', () => {
    const result = computePresence({ days: [MONDAY, SATURDAY], profiles: PROFILES, rules: [], events: [] })
    expect(result.map((s) => `${s.date} ${s.slot}`)).toEqual([`${MONDAY} LUNCH`, `${MONDAY} DINNER`, `${SATURDAY} LUNCH`, `${SATURDAY} DINNER`])
  })

  it('créneau déjà fini (fin du repas passée) : marqué passé, personne à remplir', () => {
    // Lundi 9 à 20 h à Paris : le midi est passé, le soir (jusqu'à 21 h) non.
    const now = Date.parse('2026-11-09T19:00:00Z')
    const result = computePresence({ days: [MONDAY, SATURDAY], profiles: PROFILES, rules: [], events: [], now })
    expect(result.map((s) => s.past)).toEqual([true, false, false, false])
    expect(slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: [], events: [] }), MONDAY, 'LUNCH').past).toBe(false)
  })

  it('sans règle ni rendez-vous : tout le monde à la maison et libre pour cuisiner', () => {
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: [], events: [] }), MONDAY, 'DINNER')
    expect(s.people).toEqual([ERIC, LUCILE])
    expect(s.freeCooks).toEqual([ERIC, LUCILE])
    expect(s.notes).toEqual({})
  })

  it('midi en semaine au travail, pas le week-end', () => {
    const result = computePresence({ days: [MONDAY, SATURDAY], profiles: PROFILES, rules: RULES, events: [] })
    expect(slot(result, MONDAY, 'LUNCH')).toMatchObject({ people: [ERIC], notes: { [LUCILE]: 'Au travail' } })
    expect(slot(result, MONDAY, 'DINNER').people).toEqual([ERIC, LUCILE])
    expect(slot(result, SATURDAY, 'LUNCH').people).toEqual([ERIC, LUCILE])
  })

  it('un rendez-vous pendant le repas retire la personne', () => {
    const events = [timed(ERIC, 'Dîner chez Paul', '2026-11-09T19:30:00Z', '2026-11-09T22:00:00Z')]
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: RULES, events }), MONDAY, 'DINNER')
    expect(s.people).toEqual([LUCILE])
    expect(s.notes[ERIC]).toBe('20 h 30 Dîner chez Paul')
  })

  it('un rendez-vous avant le repas laisse la personne à table mais pas aux fourneaux', () => {
    // 17 h – 18 h 30 à Paris : fini avant 19 h, mais dans l'heure et demie qui précède.
    const events = [timed(ERIC, 'Kiné', '2026-11-09T16:00:00Z', '2026-11-09T17:30:00Z')]
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: RULES, events }), MONDAY, 'DINNER')
    expect(s.people).toEqual([ERIC, LUCILE])
    expect(s.freeCooks).toEqual([LUCILE])
    expect(s.notes[ERIC]).toBe('Occupé avant : 17 h Kiné')
  })

  it('l’escalade n’empêche pas de manger à la maison, mais de cuisiner', () => {
    const events = [timed(LUCILE, 'Escalade', '2026-11-09T17:30:00Z', '2026-11-09T19:30:00Z')]
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: RULES, events }), MONDAY, 'DINNER')
    expect(s.people).toEqual([ERIC, LUCILE])
    expect(s.freeCooks).toEqual([ERIC])
    expect(s.notes[LUCILE]).toBe('18 h 30 Escalade (mange à la maison)')
  })

  it('le mot-clé ne vaut que pour la personne qui l’a choisi', () => {
    const events = [timed(ERIC, 'Escalade', '2026-11-09T18:00:00Z', '2026-11-09T20:00:00Z')]
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: RULES, events }), MONDAY, 'DINNER')
    expect(s.people).toEqual([LUCILE])
  })

  it('ignore les journées entières et les rendez-vous d’un autre jour', () => {
    const events: PresenceEvent[] = [
      { ownerId: ERIC, title: 'Anniversaire de Paul', allDay: true },
      timed(ERIC, 'Dentiste', '2026-11-10T18:00:00Z', '2026-11-10T19:00:00Z'),
    ]
    const s = slot(computePresence({ days: [MONDAY], profiles: PROFILES, rules: RULES, events }), MONDAY, 'DINNER')
    expect(s.people).toEqual([ERIC, LUCILE])
    expect(s.notes).toEqual({})
  })
})

describe('parseKeywords', () => {
  it('découpe, nettoie et dédoublonne', () => {
    expect(parseKeywords(' escalade, Yoga ,, Escalade ; piscine\n')).toEqual(['escalade', 'Yoga', 'piscine'])
    expect(parseKeywords('')).toEqual([])
    expect(parseKeywords(Array.from({ length: 25 }, (_, i) => `k${i}`).join(','))).toHaveLength(20)
  })

  it('signale des mots-clés trop longs pour être enregistrés', () => {
    const long = Array.from({ length: 12 }, (_, i) => `${'x'.repeat(38)}${i}`)
    expect(keywordsTooLong(long)).toBe(true)
    expect(keywordsTooLong(['escalade', 'yoga'])).toBe(false)
    expect(MAX_KEYWORDS_CHARS).toBe(400)
  })
})
