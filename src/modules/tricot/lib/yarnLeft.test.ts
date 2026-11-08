import { EMPTY_YARN } from './yarn'
import { projectRowsDone, sanitizeYarnCheck, yarnVerdict } from './yarnLeft'

// 50 g / 100 m, 10 pelotes = 1 000 m
const YARN = { ...EMPTY_YARN, weight_g: 50, length_m: 100, skeins: 10 }
const step = (totalRows: number | null, rowCount = 0, done = false, stitches: number | null = null) => ({ totalRows, stitches, rowCount, done })

describe('rangs faits', () => {
  it('compte le compteur, ou toute l’étape terminée', () => {
    expect(projectRowsDone([step(100, 80, true), step(50, 10)])).toBe(110)
    expect(projectRowsDone([step(null, 5, true)])).toBe(5)
  })
})

describe('assez de laine pour finir ?', () => {
  it('ça passe : la moitié du travail faite avec 400 m, 600 m restants', () => {
    // 200 rangs au total, 100 faits ; 300 g restants = 600 m ; 400 m tricotés → 400 m pour finir
    const verdict = yarnVerdict(YARN, [step(100, 100, true), step(100)], { grams: 300, rowsDone: 100, at: '' })
    expect(verdict).toEqual({ kind: 'estimate', metersLeft: 600, metersNeeded: 400, status: 'enough', missingMeters: 0, missingSkeins: 0 })
  })

  it('c’est juste, ou il manque des pelotes', () => {
    // 220 g = 440 m restants, 560 m tricotés pour la moitié → il en faut 560 : il manque 120 m, 2 pelotes
    expect(yarnVerdict(YARN, [step(100, 100, true), step(100)], { grams: 220, rowsDone: 100, at: '' })).toMatchObject({
      status: 'short',
      missingMeters: 120,
      missingSkeins: 2,
    })
    // 255 g = 510 m restants, 490 m tricotés → il en faut 490 : marge 20 m < 10 %
    expect(yarnVerdict(YARN, [step(100, 100, true), step(100)], { grams: 255, rowsDone: 100, at: '' })).toMatchObject({ status: 'tight', missingMeters: 0 })
  })

  it('pondère par les mailles quand chaque étape les donne', () => {
    // Dos de 100 rangs × 100 m., manche de 100 rangs × 50 m. : la manche demande moitié moins de laine
    const verdict = yarnVerdict(YARN, [step(100, 100, true, 100), step(100, 0, false, 50)], { grams: 300, rowsDone: 100, at: '' })
    expect(verdict).toMatchObject({ metersNeeded: 200, status: 'enough' })
  })

  it('manque d’informations', () => {
    expect(yarnVerdict(undefined, [step(100)], { grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'missing-yarn' })
    expect(yarnVerdict({ ...YARN, weight_g: null }, [step(100)], { grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'missing-yarn' })
    expect(yarnVerdict(YARN, [step(100), step(null), step(null)], { grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'unknown-rows', steps: 2 })
    expect(yarnVerdict(YARN, [step(100)], { grams: 10, rowsDone: 0, at: '' })).toEqual({ kind: 'too-early' })
    // Plus de laine pesée qu'au départ : la pesée est trop tôt ou fausse
    expect(yarnVerdict(YARN, [step(100)], { grams: 600, rowsDone: 5, at: '' })).toEqual({ kind: 'too-early' })
  })
})

describe('pesée lue en base', () => {
  it('garde une pesée bien formée', () => {
    expect(sanitizeYarnCheck({ grams: 82.5, rows_done: 140, at: '2026-11-08' })).toEqual({ grams: 82.5, rowsDone: 140, at: '2026-11-08' })
    expect(sanitizeYarnCheck({ grams: 82, rows_done: 1.5 })).toBeNull()
    expect(sanitizeYarnCheck(null)).toBeNull()
    expect(sanitizeYarnCheck({ grams: -1, rows_done: 3 })).toBeNull()
    expect(sanitizeYarnCheck({ grams: 1, rows_done: 3 })).toEqual({ grams: 1, rowsDone: 3, at: '' })
  })
})
