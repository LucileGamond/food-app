import { EMPTY_YARN } from './yarn'
import { projectRowsDone, sanitizeYarnChecks, withYarnCheck, yarnVerdict } from './yarnLeft'

// 50 g / 100 m, 10 pelotes = 1 000 m
const YARN = { ...EMPTY_YARN, weight_g: 50, length_m: 100, skeins: 10 }
const step = (totalRows: number | null, rowCount = 0, done = false, stitches: number | null = null, times = 1, pass = 1) => ({ totalRows, stitches, rowCount, done, times, pass })

describe('rangs faits', () => {
  it('compte le compteur, ou toute l’étape terminée', () => {
    expect(projectRowsDone([step(100, 80, true), step(50, 10)])).toBe(110)
    expect(projectRowsDone([step(null, 5, true)])).toBe(5)
  })

  it('compte les fois déjà finies d’une étape tricotée plusieurs fois', () => {
    // Dos de 100 rangs fini, 1re manche finie (2e fois, compteur à 0), puis 10 rangs de la 2e
    expect(projectRowsDone([step(100, 100, true), step(80, 0, false, null, 2, 2)])).toBe(180)
    expect(projectRowsDone([step(100, 100, true), step(80, 10, false, null, 2, 2)])).toBe(190)
    expect(projectRowsDone([step(80, 80, true, null, 2, 2)])).toBe(160)
  })
})

describe('assez de laine pour finir ?', () => {
  it('ça passe : la moitié du travail faite avec 400 m, 600 m restants', () => {
    // 200 rangs au total, 100 faits ; 300 g restants = 600 m ; 400 m tricotés → 400 m pour finir
    const verdict = yarnVerdict(YARN, [step(100, 100, true), step(100)], { yarn: 0, grams: 300, rowsDone: 100, at: '' })
    expect(verdict).toEqual({ kind: 'estimate', metersLeft: 600, metersNeeded: 400, status: 'enough', missingMeters: 0, missingSkeins: 0 })
  })

  it('c’est juste, ou il manque des pelotes', () => {
    // 220 g = 440 m restants, 560 m tricotés pour la moitié → il en faut 560 : il manque 120 m, 2 pelotes
    expect(yarnVerdict(YARN, [step(100, 100, true), step(100)], { yarn: 0, grams: 220, rowsDone: 100, at: '' })).toMatchObject({
      status: 'short',
      missingMeters: 120,
      missingSkeins: 2,
    })
    // 255 g = 510 m restants, 490 m tricotés → il en faut 490 : marge 20 m < 10 %
    expect(yarnVerdict(YARN, [step(100, 100, true), step(100)], { yarn: 0, grams: 255, rowsDone: 100, at: '' })).toMatchObject({ status: 'tight', missingMeters: 0 })
  })

  it('pondère par les mailles quand chaque étape les donne', () => {
    // Dos de 100 rangs × 100 m., manche de 100 rangs × 50 m. : la manche demande moitié moins de laine
    const verdict = yarnVerdict(YARN, [step(100, 100, true, 100), step(100, 0, false, 50)], { yarn: 0, grams: 300, rowsDone: 100, at: '' })
    expect(verdict).toMatchObject({ metersNeeded: 200, status: 'enough' })
  })

  it('manque d’informations', () => {
    expect(yarnVerdict(undefined, [step(100)], { yarn: 0, grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'missing-yarn' })
    expect(yarnVerdict({ ...YARN, weight_g: null }, [step(100)], { yarn: 0, grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'missing-yarn' })
    expect(yarnVerdict(YARN, [step(100), step(null), step(null)], { yarn: 0, grams: 10, rowsDone: 5, at: '' })).toEqual({ kind: 'unknown-rows', steps: 2 })
    expect(yarnVerdict(YARN, [step(100)], { yarn: 0, grams: 10, rowsDone: 0, at: '' })).toEqual({ kind: 'too-early' })
    // Plus de laine pesée qu'au départ : la pesée ou la laine notée est fausse
    expect(yarnVerdict(YARN, [step(100)], { yarn: 0, grams: 600, rowsDone: 5, at: '' })).toEqual({ kind: 'heavier' })
  })

  it('une étape à faire deux fois compte deux fois (même verdict que deux étapes)', () => {
    const check = { yarn: 0, grams: 300, rowsDone: 180, at: '' }
    const twice = yarnVerdict(YARN, [step(100, 100, true), step(80, 0, false, null, 2, 2)], check)
    const split = yarnVerdict(YARN, [step(100, 100, true), step(80, 80, true), step(80)], check)
    expect(twice).toEqual(split)
    // 400 m tricotés pour 180 rangs ; il en reste 80 : ≈ 178 m
    expect(twice).toMatchObject({ kind: 'estimate', metersNeeded: 178 })
  })
})

describe('pesées lues en base', () => {
  it('garde les pesées bien formées, une par laine', () => {
    expect(sanitizeYarnChecks([{ yarn: 1, grams: 82.5, rows_done: 140, at: '2026-11-08' }])).toEqual([{ yarn: 1, grams: 82.5, rowsDone: 140, at: '2026-11-08' }])
    expect(sanitizeYarnChecks(null)).toEqual([])
    expect(sanitizeYarnChecks({ yarn: 0, grams: 1, rows_done: 3 })).toEqual([])
    expect(
      sanitizeYarnChecks([
        { yarn: 0, grams: 82, rows_done: 1.5 },
        { yarn: 0, grams: -1, rows_done: 3 },
        { grams: 1, rows_done: 3 },
        null,
        { yarn: 0, grams: 1, rows_done: 3 },
        { yarn: 0, grams: 2, rows_done: 4 },
      ]),
    ).toEqual([{ yarn: 0, grams: 1, rowsDone: 3, at: '' }])
  })

  it('une nouvelle pesée remplace celle de la même laine', () => {
    const a = { yarn: 1, grams: 10, rowsDone: 5, at: '' }
    const b = { yarn: 0, grams: 20, rowsDone: 5, at: '' }
    expect(withYarnCheck([a], b)).toEqual([b, a])
    expect(withYarnCheck([a, b], { ...a, grams: 4 })).toEqual([b, { ...a, grams: 4 }])
  })
})
