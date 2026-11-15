import { adaptationPaused, adaptationToJson, adaptedStepsFromResponse, applyAdaptation, describeChange, followedAdaptation, sanitizeAdaptation, stepsToFollow, withAdaptedSections, type Adaptation } from './adapt'
import { knitStep } from '@/test/knitFactories'
import type { KnitStep, StepSection } from './pattern'

const step = (overrides: Partial<KnitStep>): KnitStep => knitStep({ totalRows: 100, stitches: 88, ...overrides })

const REPEAT: StepSection = { kind: 'repeat', rows: null, every: 8, times: 6, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: null }
const ADAPTED_REPEAT: StepSection = { ...REPEAT, every: 7, times: 7 }
/** « 5 cm » à convertir en rangs, sur l'aiguille donnée (sans aiguille : héritée). */
const fiveCm = (needle?: number): StepSection => ({ kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm', ...(needle !== undefined && { needle }) })

const STEPS = [step({ id: 's1', title: 'Manches', totalRows: 120, stitches: 60, sections: [REPEAT] }), step({ id: 's2', position: 1, title: 'Col' })]

const ADAPTATION: Adaptation = {
  request: '5 cm de plus aux manches',
  active: true,
  at: '2026-11-08T10:00:00Z',
  size: 'M',
  steps: [{ stepId: 's1', totalRows: 136, stitches: 66, sections: [ADAPTED_REPEAT], note: '16 rangs de plus pour 5 cm.' }],
}

type Followed = Parameters<typeof stepsToFollow>[0]
const followed = (overrides: Partial<Followed> = {}): Followed => ({
  steps: STEPS,
  sizes: [],
  sizeIndex: null,
  size: 'M',
  adaptation: null,
  patternGauge: { stitches: 22, rows: 30 },
  needles: [],
  gauges: [],
  ...overrides,
})

describe('patron adapté', () => {
  it('superpose l’adaptation suivie aux étapes, garde l’origine', () => {
    expect(applyAdaptation(STEPS, null, 'M')).toBe(STEPS)
    expect(applyAdaptation(STEPS, { ...ADAPTATION, active: false }, 'M')).toBe(STEPS)
    const [sleeve, collar] = applyAdaptation(STEPS, ADAPTATION, 'M')
    expect(sleeve).toMatchObject({ totalRows: 136, stitches: 66, sections: [ADAPTED_REPEAT], adapted: { note: '16 rangs de plus pour 5 cm.', original: { totalRows: 120, stitches: 60 } } })
    expect(collar).toBe(STEPS[1])
  })

  it('en pause si faite pour une autre taille ; une adaptation d’avant (taille non notée) reste suivie', () => {
    expect(adaptationPaused(ADAPTATION, 'L')).toBe(true)
    expect(applyAdaptation(STEPS, ADAPTATION, 'L')).toBe(STEPS)
    expect(adaptationPaused({ ...ADAPTATION, size: null }, 'L')).toBe(false)
    expect(applyAdaptation(STEPS, { ...ADAPTATION, size: null }, 'L')).not.toBe(STEPS)
  })

  it('sections retouchées à la main : gardées dans l’adaptation ; changement décrit en nombres', () => {
    expect(withAdaptedSections(ADAPTATION, 's1', [REPEAT]).steps[0]!.sections).toEqual([REPEAT])
    expect(describeChange({ totalRows: 120, stitches: 60 }, { totalRows: 136, stitches: 60 })).toBe('120 → 136 rangs')
    expect(describeChange({ totalRows: null, stitches: 60 }, { totalRows: 10, stitches: 66 })).toBe('? → 10 rangs · 60 → 66 mailles')
    expect(describeChange({ totalRows: 120, stitches: 60 }, { totalRows: 120, stitches: 60 })).toBe('')
  })

  it('lit et écrit l’adaptation en base ; une donnée abîmée est ignorée', () => {
    const json = adaptationToJson(ADAPTATION)
    expect(json.steps[0]).toMatchObject({ step_id: 's1', total_rows: 136 })
    expect(sanitizeAdaptation(json)).toEqual(ADAPTATION)
    expect(sanitizeAdaptation(null)).toBeNull()
    expect(sanitizeAdaptation({ active: 'oui', steps: [] })).toBeNull()
    expect(sanitizeAdaptation({ active: true, steps: [{ total_rows: 3 }] })).toBeNull()
    expect(sanitizeAdaptation({ active: true, steps: [{ step_id: 's1', total_rows: 0, sections: 'x', note: 4 }] })).toEqual({
      request: '',
      active: true,
      at: '',
      size: null,
      steps: [{ stepId: 's1', totalRows: null, stitches: null, sections: [], note: '' }],
    })
  })
})

describe('adaptation suivie', () => {
  it('active et faite pour la taille suivie (ou sans taille notée) ; sinon le patron d’origine', () => {
    expect(followedAdaptation(ADAPTATION, 'M')).toBe(ADAPTATION)
    expect(followedAdaptation({ ...ADAPTATION, size: null }, 'L')).not.toBeNull()
    expect(followedAdaptation(ADAPTATION, 'L')).toBeNull()
    expect(followedAdaptation({ ...ADAPTATION, active: false }, 'M')).toBeNull()
    expect(followedAdaptation(null, 'M')).toBeNull()
  })

  it('réponse de l’IA : étapes changées par position → étapes du projet ; position inconnue ignorée', () => {
    const changed = [
      { index: 1, totalRows: 50, stitches: 70, sections: [REPEAT, 'abîmée'], note: 'Plus long.' },
      { index: 5, totalRows: 10, stitches: null, sections: [], note: '' },
    ]
    expect(adaptedStepsFromResponse(STEPS, changed)).toEqual([{ stepId: 's2', totalRows: 50, stitches: 70, sections: [REPEAT], note: 'Plus long.' }])
  })
})

describe('ce qui se tricote (stepsToFollow)', () => {
  it('taille suivie : celle du tableau des tailles choisie, sinon la taille notée', () => {
    expect(stepsToFollow(followed({ sizes: ['S', 'M', 'L'], sizeIndex: 2 })).size).toBe('L')
    expect(stepsToFollow(followed({ sizes: ['S', 'M', 'L'], sizeIndex: null })).size).toBe('M')
    // Index hors du tableau : la taille notée
    expect(stepsToFollow(followed({ sizes: ['S'], sizeIndex: 3 })).size).toBe('M')
  })

  it('suit l’adaptation active faite pour la taille suivie, pas une adaptation en pause ou abandonnée', () => {
    const active = stepsToFollow(followed({ adaptation: ADAPTATION }))
    expect(active.following).toBe(true)
    expect(active.steps[0]).toMatchObject({ totalRows: 136, sections: [ADAPTED_REPEAT] })

    const paused = stepsToFollow(followed({ adaptation: ADAPTATION, sizes: ['M', 'L'], sizeIndex: 1 }))
    expect(paused.following).toBe(false)
    expect(paused.steps[0]).toMatchObject({ totalRows: 120, sections: [REPEAT] })

    expect(stepsToFollow(followed({ adaptation: { ...ADAPTATION, active: false } })).following).toBe(false)
    expect(stepsToFollow(followed()).following).toBe(false)
  })

  it('convertit chaque mesure avec l’échantillon de son aiguille, sinon celui du patron', () => {
    const steps = [step({ sections: [fiveCm(3), fiveCm(4), fiveCm(5)] })]
    const gauges = [
      { needle: 3, stitches: null, rows: 20, checked: false },
      { needle: 4, stitches: null, rows: 36, checked: false },
    ]
    const [shown] = stepsToFollow(followed({ steps, needles: [3, 4, 5], gauges })).steps
    // 5 cm : 10 rangs à 20 rangs / 10 cm, 18 à 36 ; l'aiguille 5 n'a pas d'échantillon → celui du patron (30) : 15
    expect(shown!.sections.map((s) => s.rows)).toEqual([10, 18, 15])
    expect(shown!.sections[0]!.measured).toEqual({ rowsPer10: 20, source: 'mine' })
    expect(shown!.sections[2]!.measured).toEqual({ rowsPer10: 30, source: 'pattern' })
  })

  it('une étape sans aiguille hérite de celle où finit la précédente', () => {
    const steps = [step({ id: 's1', sections: [fiveCm(3), fiveCm(4)] }), step({ id: 's2', position: 1, sections: [fiveCm()] })]
    const gauges = [
      { needle: 3, stitches: null, rows: 20, checked: false },
      { needle: 4, stitches: null, rows: 36, checked: false },
    ]
    const shown = stepsToFollow(followed({ steps, needles: [3, 4], gauges })).steps
    expect(shown[1]!.needleFrom).toBe(4)
    expect(shown[1]!.sections[0]!.rows).toBe(18)
  })

  it('sans échantillon du tout : les mesures restent à régler', () => {
    const steps = [step({ sections: [fiveCm()] })]
    const [shown] = stepsToFollow(followed({ steps, patternGauge: { stitches: null, rows: null } })).steps
    expect(shown!.sections[0]).toEqual(fiveCm())
  })
})
