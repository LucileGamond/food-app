import { describe, expect, it } from 'vitest'
import { adviseSize, defaultEase, describeAdvice, describeProfile, parseMeasure, sanitizeSizeChart, styleOf, type MeasureProfile, type SizeChart } from './sizing'

const SIZES = ['S', 'M', 'L']
const FINISHED: SizeChart = {
  kind: 'finished',
  easeCm: null,
  rows: [
    { label: 'Tour de poitrine', measure: 'chest', values: [92, 101, 110] },
    { label: 'Longueur totale', measure: 'other', values: [58, 60, 62] },
  ],
}
const LEA: MeasureProfile = { id: 'm1', name: 'Léa', measures: { chest: 92, waist: null, hip: 98, arm: null, head: 55 } }

describe('taille selon les mesures', () => {
  it('vise la mesure plus l’aisance sur un vêtement fini', () => {
    const advice = adviseSize(FINISHED, LEA, 8)
    expect(advice).toEqual({ kind: 'size', index: 1, measure: 'chest', body: 92, target: 100, value: 101 })
    expect(describeAdvice(advice as Extract<typeof advice, { kind: 'size' }>, SIZES, FINISHED)).toBe(
      'Tour de poitrine 92 cm + 8 cm d’aisance = 100 cm → M (101 cm fini, aisance réelle 9 cm).',
    )
    // Ajusté : la plus petite ; oversize : la plus grande
    expect(adviseSize(FINISHED, LEA, 3)).toMatchObject({ index: 0 })
    expect(adviseSize(FINISHED, LEA, 25)).toMatchObject({ index: 2 })
  })

  it('à égalité, la plus grande taille', () => {
    expect(adviseSize(FINISHED, LEA, 4.5)).toMatchObject({ index: 1, target: 96.5 })
  })

  it('tableau des mesures du corps : la mesure seule, sans aisance', () => {
    const body: SizeChart = { kind: 'body', easeCm: null, rows: [{ label: 'Poitrine', measure: 'chest', values: [88, 94, 100] }] }
    const advice = adviseSize(body, LEA, 20)
    expect(advice).toMatchObject({ index: 1, target: 92 })
    expect(describeAdvice(advice as Extract<typeof advice, { kind: 'size' }>, SIZES, body)).toBe('Tour de poitrine 92 cm → M (tableau du patron : 94 cm).')
  })

  it('prend la mesure suivante si la poitrine manque ; la longueur de bras sans aisance', () => {
    const hips: SizeChart = { kind: 'finished', easeCm: null, rows: [{ label: 'Hanches', measure: 'hip', values: [100, 106, null] }] }
    expect(adviseSize(hips, LEA, 8)).toMatchObject({ measure: 'hip', index: 1, target: 106 })
    const arm: SizeChart = { kind: 'finished', easeCm: null, rows: [{ label: 'Manche', measure: 'arm', values: [44, 46, 48] }] }
    const advice = adviseSize(arm, { ...LEA, measures: { ...LEA.measures, arm: 46 } }, 8)
    expect(advice).toMatchObject({ measure: 'arm', index: 1, target: 46 })
    expect(describeAdvice(advice as Extract<typeof advice, { kind: 'size' }>, SIZES, arm)).toBe('Longueur de bras 46 cm → M (46 cm dans le patron).')
  })

  it('sans tableau ou sans mesure commune : pas de conseil', () => {
    expect(adviseSize(null, LEA, 8)).toEqual({ kind: 'no-chart' })
    expect(adviseSize({ ...FINISHED, rows: [] }, LEA, 8)).toEqual({ kind: 'no-chart' })
    expect(adviseSize(FINISHED, { ...LEA, measures: { chest: null, waist: null, hip: null, arm: null, head: null } }, 8)).toEqual({ kind: 'no-match' })
  })

  it('aisance de départ et style', () => {
    expect(defaultEase(FINISHED)).toBe(8)
    expect(defaultEase({ ...FINISHED, easeCm: 12 })).toBe(12)
    expect(styleOf(15)).toBe('loose')
    expect(styleOf(12)).toBeNull()
  })

  it('valide le tableau lu et les mesures saisies', () => {
    expect(sanitizeSizeChart({ kind: 'finished', easeCm: 5, rows: [{ label: ' Poitrine ', measure: 'chest', values: [90, 'x', 500, 7] }] }, 3)).toEqual({
      kind: 'finished',
      easeCm: 5,
      rows: [{ label: 'Poitrine', measure: 'chest', values: [90, null, null] }],
    })
    expect(sanitizeSizeChart({ kind: 'body', easeCm: 99, rows: [{ label: 'Tour', measure: 'cou', values: [30] }, { label: '', values: [1] }, 3] }, 1)).toEqual({
      kind: 'body',
      easeCm: null,
      rows: [{ label: 'Tour', measure: 'other', values: [30] }],
    })
    expect(sanitizeSizeChart({ kind: 'body', rows: [] }, 2)).toBeNull()
    expect(sanitizeSizeChart({ kind: 'autre', rows: [] }, 2)).toBeNull()
    expect(sanitizeSizeChart(null, 2)).toBeNull()
    expect(sanitizeSizeChart(FINISHED, 0)).toBeNull()
    expect(parseMeasure(' 92,5 ')).toBe(92.5)
    expect(parseMeasure('')).toBeNull()
    expect(parseMeasure('5')).toBeUndefined()
    expect(parseMeasure('beaucoup')).toBeUndefined()
    expect(describeProfile(LEA)).toBe('poitrine 92 · hanches 98 · tête 55 cm')
    expect(describeProfile({ ...LEA, measures: { chest: null, waist: null, hip: null, arm: null, head: null } })).toBe('Aucune mesure notée')
  })
})
