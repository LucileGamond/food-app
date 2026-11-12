import { convertSection, convertSections, describeConversion, parseMeasure, rowGauge, rowsFor, validateSection } from './measure'
import { describeSection, sanitizeSections, type StepSection } from './pattern'

const NONE = { stitches: null, rows: null }
const toSet = (pattern: string): StepSection => ({ kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern })
const repeatToSet = (pattern: string): StepSection => ({ kind: 'repeat', rows: null, every: null, times: 3, actions: [{ text: '1 aug.', rank: null }], text: '', pattern })

describe('mesures du patron en rangs', () => {
  it('lit une longueur en cm, mm ou pouces', () => {
    expect(parseMeasure('5 cm')).toBe(5)
    expect(parseMeasure('tous les 2,5 cm')).toBe(2.5)
    expect(parseMeasure('Tricoter 50 mm')).toBe(5)
    expect(parseMeasure('2"')).toBeCloseTo(5.08)
    expect(parseMeasure('every 2 inches')).toBeCloseTo(5.08)
    expect(parseMeasure('tous les 6 rangs')).toBeNull()
    expect(parseMeasure('jusqu’à l’emmanchure')).toBeNull()
    expect(parseMeasure(null)).toBeNull()
  })

  it('échantillon : celui de la tricoteuse d’abord, sinon celui du patron', () => {
    expect(rowGauge({ mine: { stitches: 20, rows: 28 }, pattern: { stitches: 22, rows: 30 } })).toEqual({ rowsPer10: 28, source: 'mine' })
    expect(rowGauge({ mine: { stitches: 20, rows: null }, pattern: { stitches: 22, rows: 30 } })).toEqual({ rowsPer10: 30, source: 'pattern' })
    expect(rowGauge({ mine: NONE, pattern: NONE })).toBeNull()
  })

  it('arrondit au rang le plus proche, au moins 1', () => {
    expect(rowsFor(5, 30)).toBe(15)
    expect(rowsFor(5, 27)).toBe(14) // 13,5
    expect(rowsFor(2.5, 26)).toBe(7) // 6,5
    expect(rowsFor(0.1, 20)).toBe(1)
  })

  it('convertit une section à régler (rangs ou rythme), marquée à vérifier', () => {
    const gauge = { rowsPer10: 30, source: 'mine' as const }
    expect(convertSection(toSet('5 cm'), gauge)).toEqual({ ...toSet('5 cm'), rows: 15, measured: gauge })
    expect(convertSection(repeatToSet('tous les 4 cm'), gauge)).toEqual({ ...repeatToSet('tous les 4 cm'), every: 12, measured: gauge })
    // Sans échantillon, ou mesure illisible : inchangée
    expect(convertSection(toSet('5 cm'), null)).toEqual(toSet('5 cm'))
    expect(convertSection(toSet('jusqu’à l’emmanchure'), gauge)).toEqual(toSet('jusqu’à l’emmanchure'))
  })

  it('suit l’échantillon tant que ce n’est pas validé ; validé ou réglé à la main, ne bouge plus', () => {
    const converted = convertSection(toSet('5 cm'), { rowsPer10: 30, source: 'pattern' })
    // Échantillon de la tricoteuse saisi ensuite : recalculé
    expect(convertSection(converted, { rowsPer10: 24, source: 'mine' })).toMatchObject({ rows: 12, measured: { rowsPer10: 24, source: 'mine' } })
    const validated = validateSection(converted)
    expect(validated).toEqual({ ...toSet('5 cm'), rows: 15 })
    expect(convertSection(validated, { rowsPer10: 24, source: 'mine' })).toBe(validated)
    // Sections sans mesure : jamais touchées
    const plain: StepSection = { kind: 'rows', rows: 10, every: null, times: null, text: 'côtes', pattern: null }
    expect(convertSections([plain], { rowsPer10: 24, source: 'mine' })).toEqual([plain])
  })

  it('explique le calcul et le rappelle dans la description', () => {
    const rows = convertSection(toSet('2,5 cm'), { rowsPer10: 26.5, source: 'mine' })
    expect(describeConversion(rows)).toBe('2,5 cm × 26,5 rangs pour 10 cm (ton échantillon) ≈ 7 rangs')
    expect(describeSection(rows)).toBe('7 rangs (≈ 2,5 cm) : jersey')
    const repeat = convertSection(repeatToSet('tous les 5 cm'), { rowsPer10: 30, source: 'pattern' })
    expect(describeConversion(repeat)).toBe('5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ 15 rangs')
    expect(describeSection(repeat)).toBe('1 aug. — tous les 15 rangs (≈ 5 cm) (3 fois)')
    expect(describeConversion(validateSection(repeat))).toBeNull()
    expect(describeSection(validateSection(repeat))).toBe('1 aug. — tous les 15 rangs (3 fois)')
  })

  it('le marqueur « à vérifier » est gardé en base s’il est bien formé', () => {
    const measured = { rowsPer10: 30, source: 'mine' }
    expect(sanitizeSections([{ ...toSet('5 cm'), rows: 15, measured }])[0]!.measured).toEqual(measured)
    expect(sanitizeSections([{ ...toSet('5 cm'), rows: 15, measured: { rowsPer10: 0, source: 'mine' } }])[0]!.measured).toBeUndefined()
    expect(sanitizeSections([{ ...toSet('5 cm'), rows: 15, measured: { rowsPer10: 30, source: 'autre' } }])[0]!.measured).toBeUndefined()
  })
})
