import {
  daysBetween,
  entriesOf,
  filterFrom,
  formatDeltaKg,
  formatKg,
  formatWeightInput,
  groupByDate,
  parseWeightInput,
  periodStart,
  staleLabel,
  staleProfiles,
  summarize,
  toWeighInValues,
  validateWeighIn,
  weightInputError,
  xTicks,
  yDomain,
  yTicks,
  type WeightEntry,
} from './weights'

const LUCILE = { id: 'l', display_name: 'Lucile' }
const ERIC = { id: 'e', display_name: 'Éric' }

function w(profile_id: string, measured_on: string, weight_kg: number): WeightEntry {
  return { id: `${profile_id}-${measured_on}`, profile_id, measured_on, weight_kg }
}

const ENTRIES = [
  w('l', '2026-06-06', 60.9),
  w('e', '2026-06-06', 71.8),
  w('l', '2026-10-09', 65.0),
  w('l', '2026-08-27', 64.9),
  w('e', '2026-08-27', 72.7),
  w('l', '2025-10-01', 60.0),
]

describe('saisie', () => {
  it('accepte la virgule ou le point', () => {
    expect(parseWeightInput('62,5')).toBe(62.5)
    expect(parseWeightInput(' 62.5 ')).toBe(62.5)
    expect(parseWeightInput('')).toBeNull()
    expect(parseWeightInput('abc')).toBeNaN()
    expect(parseWeightInput('-3')).toBeNaN()
  })

  it('valide les bornes et la précision', () => {
    expect(weightInputError('')).toBeNull()
    expect(weightInputError('62,5')).toBeNull()
    expect(weightInputError('62')).toBeNull()
    expect(weightInputError('62,55')).toBe('Une décimale maximum')
    expect(weightInputError('19,9')).toBe('Entre 20 et 300 kg')
    expect(weightInputError('301')).toBe('Entre 20 et 300 kg')
    expect(weightInputError('6x')).toBe('Poids invalide')
  })

  it('formate les poids et les écarts', () => {
    expect(formatKg(62)).toBe('62,0 kg')
    expect(formatDeltaKg(1.24)).toBe('+1,2 kg')
    expect(formatDeltaKg(-0.36)).toBe('−0,4 kg')
    expect(formatDeltaKg(0.04)).toBe('0,0 kg')
    expect(formatWeightInput(62.5)).toBe('62,5')
    expect(formatWeightInput(null)).toBe('')
  })
})

describe('synthèse par personne', () => {
  it('prend la dernière mesure de la personne, même si l’autre s’est pesée plus tard', () => {
    const eric = summarize(ENTRIES, ERIC, null, '2026-10-24')
    expect(eric.latest?.measured_on).toBe('2026-08-27')
    expect(eric.deltaPrevious).toBeCloseTo(0.9)
    expect(eric.daysSinceLatest).toBe(58)
  })

  it('calcule les écarts et min/max sur la période', () => {
    const all = summarize(ENTRIES, LUCILE, null, '2026-10-24')
    expect(all.deltaPeriod).toBeCloseTo(5)
    expect([all.min, all.max]).toEqual([60, 65])

    const recent = summarize(ENTRIES, LUCILE, '2026-08-01', '2026-10-24')
    expect(recent.deltaPeriod).toBeCloseTo(0.1)
    expect([recent.min, recent.max]).toEqual([64.9, 65])
    expect(recent.deltaPrevious).toBeCloseTo(0.1)
  })

  it('gère une personne sans mesure ou avec une seule mesure', () => {
    const none = summarize([], LUCILE, null, '2026-10-24')
    expect(none).toMatchObject({ latest: null, deltaPrevious: null, deltaPeriod: null, min: null, max: null, daysSinceLatest: null })
    const one = summarize([w('l', '2026-10-01', 60)], LUCILE, null, '2026-10-24')
    expect(one).toMatchObject({ deltaPrevious: null, deltaPeriod: null, min: 60, max: 60 })
  })

  it('relance les personnes pas pesées depuis plus de 20 jours', () => {
    const summaries = [summarize(ENTRIES, LUCILE, null, '2026-10-24'), summarize(ENTRIES, ERIC, null, '2026-10-24'), summarize([], { id: 'x', display_name: 'Anne' }, null, '2026-10-24')]
    const stale = staleProfiles(summaries)
    expect(stale.map((s) => s.profile.display_name)).toEqual(['Éric', 'Anne'])
    expect(staleLabel(stale[0]!)).toBe('Éric : dernière pesée il y a 58 jours')
    expect(staleLabel(stale[1]!)).toBe('Anne : aucune pesée enregistrée')
    expect(staleProfiles([summarize([w('l', '2026-10-04', 60)], LUCILE, null, '2026-10-24')])).toEqual([])
  })

  it('trie les mesures d’une personne et compte les jours', () => {
    expect(entriesOf(ENTRIES, 'l').map((e) => e.measured_on)).toEqual(['2025-10-01', '2026-06-06', '2026-08-27', '2026-10-09'])
    expect(daysBetween('2026-10-01', '2026-10-24')).toBe(23)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
})

describe('périodes', () => {
  it('calcule le début de période en mois calendaires', () => {
    expect(periodStart('3m', '2026-10-24')).toBe('2026-07-24')
    expect(periodStart('6m', '2026-10-24')).toBe('2026-04-24')
    expect(periodStart('1y', '2026-10-24')).toBe('2025-10-24')
    expect(periodStart('3m', '2026-05-31')).toBe('2026-02-28')
    expect(periodStart('all', '2026-10-24')).toBeNull()
  })

  it('filtre à partir d’une date', () => {
    expect(filterFrom(ENTRIES, '2026-08-27')).toHaveLength(3)
    expect(filterFrom(ENTRIES, null)).toHaveLength(6)
  })
})

describe('relevés par date', () => {
  it('regroupe par date, du plus récent au plus ancien', () => {
    expect(groupByDate(ENTRIES).slice(0, 2)).toEqual([
      { date: '2026-10-09', weights: { l: 65 } },
      { date: '2026-08-27', weights: { l: 64.9, e: 72.7 } },
    ])
  })
})

describe('formulaire de relevé', () => {
  it('exige une date passée et au moins un poids valide', () => {
    expect(validateWeighIn({ date: '2026-10-24', weights: { l: '62,5', e: '' } }, '2026-10-24')).toEqual({})
    expect(validateWeighIn({ date: '', weights: { l: '62' } }, '2026-10-24').date).toBe('Date obligatoire')
    expect(validateWeighIn({ date: '2026-10-25', weights: { l: '62' } }, '2026-10-24').date).toMatch(/futur/)
    expect(validateWeighIn({ date: '2026-10-24', weights: { l: '', e: ' ' } }, '2026-10-24').form).toBe('Renseigne au moins un poids')
    expect(validateWeighIn({ date: '2026-10-24', weights: { l: '10', e: '70' } }, '2026-10-24').weights).toEqual({ l: 'Entre 20 et 300 kg' })
  })

  it('convertit les champs, un champ vide efface la mesure', () => {
    expect(toWeighInValues({ date: '2026-10-24', weights: { l: '62,5', e: '' } })).toEqual([
      { profile_id: 'l', weight_kg: 62.5 },
      { profile_id: 'e', weight_kg: null },
    ])
  })
})

describe('graphique', () => {
  it('calcule un domaine Y lisible', () => {
    expect(yDomain([])).toEqual([50, 90])
    expect(yDomain([60, 65])).toEqual([59, 66])
    expect(yDomain([62])).toEqual([60, 64])
    expect(yDomain([57.7, 78.5])).toEqual([54, 82])
  })

  it('choisit des graduations Y rondes', () => {
    expect(yTicks([59, 66])).toEqual([60, 62, 64, 66])
    expect(yTicks([60, 64])).toEqual([60, 61, 62, 63, 64])
    expect(yTicks([54, 82])).toEqual([55, 60, 65, 70, 75, 80])
  })

  it('place des graduations X au début des mois, espacées', () => {
    expect(xTicks('2026-07-24', '2026-10-24').map((t) => t.label)).toEqual(['août', 'sept', 'oct'])
    expect(xTicks('2026-07-01', '2026-08-15').map((t) => t.date)).toEqual(['2026-07-01', '2026-08-01'])
    const long = xTicks('2024-01-14', '2026-10-24')
    expect(long.length).toBeLessThanOrEqual(6)
    expect(long[0]?.date).toBe('2024-02-01')
    expect(long.some((t) => /\d{2}$/.test(t.label))).toBe(true)
  })
})
