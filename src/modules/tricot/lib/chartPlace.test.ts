import { placeChart, placeCharts } from './chartPlace'
import type { StepSection } from './pattern'

const rows = (n: number | null, text: string, id?: string, pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern, ...(id ? { id } : {}) })

describe('diagramme qui suit sa sous-étape', () => {
  const chart = { stepId: 's1', sectionId: 'jersey', startRow: 5, endRow: 49 }

  it('placé sur les rangs d’aujourd’hui de sa sous-étape', () => {
    const step = { sections: [rows(4, 'côtes', 'cotes'), rows(50, 'jersey', 'jersey')], totalRows: null }
    expect(placeChart(chart, step)).toMatchObject({ startRow: 5, endRow: 54 })
    // Une sous-étape ajoutée avant : il se décale
    expect(placeChart(chart, { ...step, sections: [rows(4, 'côtes', 'cotes'), rows(2, 'mousse'), rows(50, 'jersey', 'jersey')] })).toMatchObject({ startRow: 7, endRow: 56 })
  })

  it('sans dernier rang : de son début à la fin de l’étape ; longueur inconnue : sans fin', () => {
    const step = { sections: [rows(4, 'côtes'), rows(50, 'jersey', 'jersey')], totalRows: null }
    expect(placeChart({ ...chart, endRow: null }, step)).toMatchObject({ startRow: 5, endRow: null })
    expect(placeChart(chart, { sections: [rows(4, 'côtes'), rows(null, 'jersey', 'jersey', '15 cm')], totalRows: null })).toMatchObject({ startRow: 5, endRow: null })
  })

  it('sous-étape introuvable, rangs inconnus ou pas de lien : rangs enregistrés gardés', () => {
    expect(placeChart(chart, { sections: [rows(4, 'côtes')], totalRows: null })).toBe(chart)
    expect(placeChart(chart, { sections: [rows(null, 'côtes', undefined, '5 cm'), rows(10, 'jersey', 'jersey')], totalRows: null })).toBe(chart)
    expect(placeChart({ ...chart, sectionId: null }, { sections: [rows(50, 'jersey', 'jersey')], totalRows: null })).toMatchObject({ startRow: 5, endRow: 49 })
    expect(placeChart(chart, undefined)).toBe(chart)
  })

  it('chaque diagramme placé sur l’étape où il est', () => {
    const steps = [{ id: 's1', sections: [rows(10, 'jersey', 'jersey')], totalRows: null }, { id: 's2', sections: [rows(3, 'côtes'), rows(10, 'jersey', 'jersey')], totalRows: null }]
    expect(placeCharts([chart, { ...chart, stepId: 's2' }], steps).map((c) => [c.startRow, c.endRow])).toEqual([
      [1, 10],
      [4, 13],
    ])
  })
})
