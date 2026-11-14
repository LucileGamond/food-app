import type { ReadPattern } from './pattern'
import { findReading, readingFromJson, readingSizeLabel, type StoredReading } from './readings'

const READ: ReadPattern = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  sizeIndex: 1,
  gauge: { stitches: 22, rows: 30 },
  steps: [
    { title: 'Dos – côtes', instructions: 'Monter 60 (64-68) m.', totalRows: 18, stitches: 64, sections: [], times: 1 },
    {
      title: 'Manches',
      instructions: 'Diminuer.',
      totalRows: 40,
      stitches: null,
      sections: [{ kind: 'repeat', rows: null, every: 6, times: 4, text: '1 diminution de chaque côté', pattern: 'tous les 6 rangs' }],
      times: 2,
    },
  ],
  charts: [{ page: 3, title: 'Torsade', rows: 8, step: 1, flat: true, oddOnly: false }],
  abbreviations: [{ abbr: 'm.', meaning: 'maille' }],
  sizeChart: null,
  missingParts: [],
  needles: [3.5, 4],
}

const stored = (reading: ReadPattern, sizeIndex = reading.sizeIndex ?? null): StoredReading => ({ sizeIndex, sizeLabel: readingSizeLabel(reading), readAt: '2026-11-13T10:00:00Z', reading })

describe('lectures gardées', () => {
  it('cohérence : une lecture gardée en base puis relue est la même', () => {
    expect(readingFromJson(JSON.parse(JSON.stringify(READ)))).toEqual(READ)
  })

  it('écarte une lecture abîmée et nettoie ce qui dépasse', () => {
    expect(readingFromJson(null)).toBeNull()
    expect(readingFromJson({ sizes: [], steps: 'non' })).toBeNull()
    expect(readingFromJson({ sizes: [], steps: [{ title: ' ' }] })).toBeNull()
    const cleaned = readingFromJson({ title: '', sizes: ['S', 3, ''], sizeIndex: 5, steps: [{ title: 'Dos', totalRows: -1, times: 99, sections: [{ kind: '?' }] }, 'x'], gauge: { stitches: 0 } })
    expect(cleaned).toMatchObject({ title: 'Patron', sizes: ['S'], sizeIndex: null, gauge: null, charts: [], needles: [] })
    expect(cleaned!.steps).toEqual([{ title: 'Dos', instructions: '', totalRows: null, stitches: null, sections: [], times: 1 }])
  })

  it('nomme la taille lue', () => {
    expect(readingSizeLabel(READ)).toBe('M')
    expect(readingSizeLabel({ sizes: [], sizeIndex: null })).toBe('Unique')
    expect(readingSizeLabel({ sizes: ['S'], sizeIndex: undefined })).toBe('Unique')
  })

  it('retrouve la lecture de la taille demandée (« m » = « M »), sinon rien', () => {
    const readings = [stored({ ...READ, sizeIndex: 0 }), stored(READ)]
    expect(findReading(readings, 'm')?.sizeLabel).toBe('M')
    expect(findReading(readings, ' S ')?.sizeLabel).toBe('S')
    expect(findReading(readings, 'L')).toBeNull()
    expect(findReading(readings, 'XXL')).toBeNull()
    expect(findReading([], 'M')).toBeNull()
  })

  it('sans taille demandée : la première taille, comme la lecture par le modèle', () => {
    expect(findReading([stored(READ)], '')).toBeNull()
    expect(findReading([stored(READ), stored({ ...READ, sizeIndex: 0 })], '')?.sizeLabel).toBe('S')
  })

  it('patron en taille unique : sa lecture vaut pour toute taille demandée', () => {
    const single = stored({ ...READ, sizes: [], sizeIndex: null })
    expect(findReading([single], '')).toBe(single)
    expect(findReading([single], 'M')).toBe(single)
  })

  it('cohérence : chaque lecture est retrouvée par le nom de sa propre taille', () => {
    const readings = READ.sizes.map((_, i) => stored({ ...READ, sizeIndex: i }))
    for (const r of readings) expect(findReading(readings, r.sizeLabel)).toBe(r)
  })
})
