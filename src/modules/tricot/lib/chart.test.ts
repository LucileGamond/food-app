import { chartPosition, chartRows, describeHint, describePosition, describeReading, newChartForm, sanitizeHints, formToSetup, moveNearestLine, rowBand, sanitizeSetup, setupToForm, type ChartForm } from './chart'

describe('chartPosition', () => {
  // En rond : chaque tour est dessiné et se lit de droite à gauche.
  const chart = { rows: 8, startRow: 1, repeats: true, flat: false, oddOnly: false }
  const round = (chartRow: number, repeat = 1) => ({ kind: 'row', chartRow, repeat, line: chartRow, drawn: true, side: 'endroit', direction: 'rtl' })

  it('suit le compteur de l’étape, rang 1 du diagramme au premier rang', () => {
    expect(chartPosition(chart, 1)).toEqual(round(1))
    expect(chartPosition(chart, 8)).toEqual(round(8))
  })

  it('recommence le motif après le dernier rang', () => {
    expect(chartPosition(chart, 9)).toEqual(round(1, 2))
    expect(chartPosition(chart, 20)).toEqual(round(4, 3))
  })

  it('commence plus loin dans l’étape', () => {
    const late = { ...chart, startRow: 5 }
    expect(chartPosition(late, 4)).toEqual({ kind: 'before', startRow: 5 })
    expect(chartPosition(late, 5)).toEqual(round(1))
  })

  it('s’arrête après le dernier rang sans répétition', () => {
    const once = { ...chart, repeats: false }
    expect(chartPosition(once, 8)).toEqual(round(8))
    expect(chartPosition(once, 9)).toEqual({ kind: 'after' })
  })

  it('à plat : endroit de droite à gauche, envers de gauche à droite', () => {
    const flat = { ...chart, flat: true }
    expect(chartPosition(flat, 3)).toMatchObject({ chartRow: 3, line: 3, side: 'endroit', direction: 'rtl', drawn: true })
    expect(chartPosition(flat, 4)).toMatchObject({ chartRow: 4, line: 4, side: 'envers', direction: 'ltr', drawn: true })
  })

  it('à plat, rangs endroit seuls dessinés : une ligne pour deux rangs', () => {
    const odd = { ...chart, flat: true, oddOnly: true, repeats: false }
    expect(chartRows(odd)).toBe(16)
    expect(chartPosition(odd, 5)).toMatchObject({ chartRow: 5, line: 3, side: 'endroit', drawn: true })
    expect(chartPosition(odd, 6)).toMatchObject({ chartRow: 6, line: 3, side: 'envers', drawn: false })
    expect(chartPosition(odd, 16)).toMatchObject({ chartRow: 16, line: 8 })
    expect(chartPosition(odd, 17)).toEqual({ kind: 'after' })
    // En rond, l'option est sans effet
    expect(chartRows({ ...odd, flat: false })).toBe(8)
  })
})

describe('rowBand', () => {
  it('place les rangs de bas en haut, à hauteur égale', () => {
    const chart = { gridTop: 0.1, gridBottom: 0.9, rows: 4 }
    const first = rowBand(chart, 1)
    expect(first.bottom).toBeCloseTo(0.9)
    expect(first.top).toBeCloseTo(0.7)
    const last = rowBand(chart, 4)
    expect(last.top).toBeCloseTo(0.1)
    expect(last.bottom).toBeCloseTo(0.3)
  })
})

describe('sanitizeSetup', () => {
  it('garde un calage valide (les numeric arrivent parfois en texte)', () => {
    expect(sanitizeSetup({ grid_top: '0.1000', grid_bottom: 0.9, rows: 24, start_row: 3 })).toEqual({ gridTop: 0.1, gridBottom: 0.9, rows: 24, startRow: 3 })
  })

  it('remplace un calage abîmé par l’image entière', () => {
    expect(sanitizeSetup({ grid_top: 0.9, grid_bottom: 0.1, rows: 0, start_row: -2 })).toEqual({ gridTop: 0, gridBottom: 1, rows: 1, startRow: 1 })
  })
})

describe('formToSetup', () => {
  const form: ChartForm = { stepId: 's1', title: '  Torsade  ', gridTop: 0.123456, gridBottom: 0.9, rows: '24', startRow: '1', repeats: true, flat: true, oddOnly: true }

  it('convertit le formulaire', () => {
    expect(formToSetup(form)).toEqual({ stepId: 's1', title: 'Torsade', gridTop: 0.1235, gridBottom: 0.9, rows: 24, startRow: 1, repeats: true, flat: true, oddOnly: true })
    expect(formToSetup({ ...form, stepId: '' })).toMatchObject({ stepId: null })
    // En rond, tous les tours sont dessinés
    expect(formToSetup({ ...form, flat: false })).toMatchObject({ flat: false, oddOnly: false })
  })

  it('refuse un nombre de rangs ou un premier rang invalide', () => {
    expect(formToSetup({ ...form, rows: '' })).toMatch(/Lignes de la grille/)
    expect(formToSetup({ ...form, rows: '2.5' })).toMatch(/Lignes de la grille/)
    expect(formToSetup({ ...form, rows: '501' })).toMatch(/Lignes de la grille/)
    expect(formToSetup({ ...form, startRow: '0' })).toMatch(/Premier rang/)
  })

  it('refuse des traits croisés', () => {
    expect(formToSetup({ ...form, gridTop: 0.5, gridBottom: 0.5 })).toMatch(/trait du haut/)
  })

  it('repart du calage enregistré', () => {
    expect(setupToForm({ stepId: null, title: '', gridTop: 0, gridBottom: 1, rows: 8, startRow: 2, repeats: false, flat: true, oddOnly: false })).toEqual({
      stepId: '',
      title: '',
      gridTop: 0,
      gridBottom: 1,
      rows: '8',
      startRow: '2',
      repeats: false,
      flat: true,
      oddOnly: false,
    })
  })
})

describe('moveNearestLine', () => {
  it('déplace le trait le plus proche, sans croiser l’autre', () => {
    expect(moveNearestLine({ gridTop: 0, gridBottom: 1 }, 0.2)).toEqual({ gridTop: 0.2, gridBottom: 1 })
    expect(moveNearestLine({ gridTop: 0, gridBottom: 1 }, 0.8)).toEqual({ gridTop: 0, gridBottom: 0.8 })
    expect(moveNearestLine({ gridTop: 0.4, gridBottom: 0.5 }, 0.46).gridBottom).toBeCloseTo(0.46)
    expect(moveNearestLine({ gridTop: 0.4, gridBottom: 0.41 }, 0.43).gridBottom).toBeCloseTo(0.43)
    expect(moveNearestLine({ gridTop: 0.4, gridBottom: 0.41 }, 0.39).gridTop).toBeCloseTo(0.39)
    expect(moveNearestLine({ gridTop: 0.4, gridBottom: 0.41 }, 0.404).gridTop).toBeCloseTo(0.39)
    expect(moveNearestLine({ gridTop: 0.4, gridBottom: 0.5 }, 1.4)).toEqual({ gridTop: 0.4, gridBottom: 1 })
  })
})

describe('describePosition', () => {
  const row = { kind: 'row', chartRow: 5, repeat: 1, line: 5, drawn: true, side: 'endroit', direction: 'rtl' } as const

  it('annonce le rang et le passage dans le motif', () => {
    const chart = { rows: 24, flat: true, oddOnly: false }
    expect(describePosition(row, chart)).toBe('Rang 5 sur 24')
    expect(describePosition({ ...row, repeat: 2 }, chart)).toBe('Rang 5 sur 24 · 2e fois')
    expect(describePosition(row, { ...chart, oddOnly: true })).toBe('Rang 5 sur 48')
  })

  it('donne le sens de lecture', () => {
    expect(describeReading(row, true)).toBe('Endroit, de droite à gauche')
    expect(describeReading({ ...row, side: 'envers', direction: 'ltr' }, true)).toBe('Envers, de gauche à droite')
    expect(describeReading({ ...row, side: 'envers', direction: 'ltr', drawn: false }, true)).toMatch(/^Envers, non dessiné/)
    expect(describeReading(row, false)).toBe('Tour de droite à gauche')
  })
})

describe('diagrammes repérés', () => {
  const hint = { page: 4, title: 'Torsade', rows: 24, step: 1, flat: true, oddOnly: true }

  it('garde les repérages bien formés', () => {
    expect(sanitizeHints([hint, { page: 0 }, 'x', { page: 5, rows: 9999, step: -1, flat: false, oddOnly: true }])).toEqual([
      hint,
      { page: 5, title: '', rows: null, step: null, flat: false, oddOnly: false },
    ])
    expect(sanitizeHints(null)).toEqual([])
  })

  it('pré-remplit le calage d’un nouveau diagramme', () => {
    const steps = [{ id: 's1' }, { id: 's2' }]
    expect(newChartForm('s1', hint, steps)).toMatchObject({ stepId: 's2', title: 'Torsade', rows: '24', flat: true, oddOnly: true })
    // Étape inconnue : l'étape en cours ; sens non précisé : à plat
    expect(newChartForm('s1', { ...hint, step: 7, flat: null, rows: null }, steps)).toMatchObject({ stepId: 's1', rows: '', flat: true })
    expect(newChartForm('s1', { ...hint, flat: false }, steps)).toMatchObject({ flat: false, oddOnly: false })
    expect(newChartForm('s1')).toEqual({ stepId: 's1', title: '', gridTop: 0, gridBottom: 1, rows: '', startRow: '1', repeats: true, flat: true, oddOnly: false })
  })

  it('décrit un repérage', () => {
    expect(describeHint(hint)).toBe('Torsade, page 4')
    expect(describeHint({ ...hint, title: '' })).toBe('Diagramme, page 4')
  })
})

describe('diagramme rattaché à une sous-étape', () => {
  const chart = { rows: 4, startRow: 5, endRow: 12, repeats: true, flat: false, oddOnly: false }

  it('montré de son premier à son dernier rang, plus après', () => {
    expect(chartPosition(chart, 4)).toEqual({ kind: 'before', startRow: 5 })
    expect(chartPosition(chart, 12)).toMatchObject({ kind: 'row', chartRow: 4, repeat: 2 })
    expect(chartPosition(chart, 13)).toEqual({ kind: 'after' })
    // Sans dernier rang : jusqu'à la fin de l'étape
    expect(chartPosition({ ...chart, endRow: null }, 40)).toMatchObject({ kind: 'row' })
  })

  it('formulaire : dernier rang facultatif, après le premier', () => {
    const form: ChartForm = { stepId: 's1', title: '', gridTop: 0.1, gridBottom: 0.9, rows: '4', startRow: '5', repeats: true, flat: false, oddOnly: false }
    expect(formToSetup({ ...form, endRow: '12' })).toMatchObject({ startRow: 5, endRow: 12 })
    expect(formToSetup({ ...form, endRow: '' })).not.toHaveProperty('endRow')
    expect(formToSetup({ ...form, endRow: '4' })).toBe('Le dernier rang vient après le premier.')
    expect(formToSetup({ ...form, endRow: 'x' })).toBe('Dernier rang : un nombre entier entre 1 et 5000.')
    expect(setupToForm({ stepId: 's1', title: '', gridTop: 0, gridBottom: 1, rows: 4, startRow: 5, endRow: 12, repeats: true, flat: false, oddOnly: false })).toMatchObject({ startRow: '5', endRow: '12' })
    expect(sanitizeSetup({ grid_top: 0, grid_bottom: 1, rows: 4, start_row: 5, end_row: 12 })).toMatchObject({ endRow: 12 })
    expect(sanitizeSetup({ grid_top: 0, grid_bottom: 1, rows: 4, start_row: 5, end_row: 3 })).not.toHaveProperty('endRow')
  })
})
