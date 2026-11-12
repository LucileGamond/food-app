import type { StepSection } from './pattern'
import { finishSubstep, substepCounts } from './substeps'

const rows = (n: number | null, text: string, pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern })
const repeat = (every: number | null, times: number | null, pattern: string | null = null, at?: StepSection['at']): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  actions: [{ text: '1 aug.', rank: null }],
  text: '',
  pattern,
  ...(at ? { at } : {}),
})

describe('compteur des sous-étapes', () => {
  // Manche : 12 rangs de côtes, puis augmentations tous les 8 rangs 6 fois, puis 10 rangs
  const SLEEVE = { sections: [rows(12, 'côtes 1/1'), repeat(8, 6), rows(10, 'jersey')], totalRows: 70 }

  it('chaque sous-étape compte ses rangs, tirés du rang de l’étape', () => {
    expect(substepCounts(SLEEVE, 1)).toEqual([{ index: 0, title: '12 rangs : côtes 1/1', row: 1, rows: 12, finishable: true }])
    expect(substepCounts(SLEEVE, 17)).toMatchObject([{ index: 1, row: 5, rows: 48, finishable: false }])
    expect(substepCounts(SLEEVE, 70)).toMatchObject([{ index: 2, row: 10, rows: 10 }])
    expect(substepCounts(SLEEVE, 71)).toEqual([])
    expect(substepCounts({ sections: [], totalRows: 20 }, 3)).toEqual([])
  })

  it('« en même temps » : chaque sous-étape en cours a son propre rang', () => {
    const step = { sections: [repeat(2, 10), repeat(2, 3, null, { row: 15, pattern: null })], totalRows: 25 }
    expect(substepCounts(step, 16).map((c) => [c.index, c.row, c.rows])).toEqual([
      [0, 16, 20],
      [1, 2, 6],
    ])
  })

  it('longueur à mesurer (« 30 cm » sans échantillon) : comptée librement, puis fixée aux rangs tricotés', () => {
    const step = { sections: [rows(12, 'côtes'), rows(null, 'jersey', '30 cm'), rows(4, 'côtes')], totalRows: null }
    expect(substepCounts(step, 40)).toEqual([{ index: 1, title: '30 cm (à régler) : jersey', row: 28, rows: null, finishable: true }])
    // 27 rangs tricotés : la suite commence au rang 40
    const sections = finishSubstep(step.sections, 1, 27)
    expect(sections[1]).toEqual(rows(27, 'jersey', '30 cm'))
    expect(substepCounts({ sections, totalRows: null }, 40)).toMatchObject([{ index: 2, row: 1, rows: 4 }])
  })

  it('finir plus tôt une longueur convertie : le calcul est remplacé par les rangs tricotés', () => {
    const measured = { ...rows(15, 'jersey', '5 cm'), measured: { rowsPer10: 30, source: 'pattern' as const } }
    expect(finishSubstep([measured], 0, 12)).toEqual([rows(12, 'jersey', '5 cm')])
    // Rien à finir : répétition, aucun rang tricoté, sous-étape inconnue
    expect(finishSubstep([repeat(2, 3)], 0, 4)).toEqual([repeat(2, 3)])
    expect(finishSubstep([measured], 0, 0)).toEqual([measured])
    expect(finishSubstep([measured], 3, 2)).toEqual([measured])
  })

  it('rythme à régler (« tous les 5 cm ») : pas de compteur', () => {
    expect(substepCounts({ sections: [rows(2, 'côtes'), repeat(null, 3, 'tous les 5 cm')], totalRows: null }, 4)).toEqual([])
  })
})
