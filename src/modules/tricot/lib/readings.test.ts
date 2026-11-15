import type { ReadPattern } from './pattern'
import { findReading, readingFromJson, readingKey, readingSizeLabel, readPatternFromResponse, readSizeIndex, type StoredReading } from './readings'

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

  it('lecture sans tailles d’un patron en plusieurs tailles : elle ne vaut pas pour une autre taille', () => {
    // Première lecture où le modèle n'a pas relevé les tailles, puis une lecture en M
    const unsized = stored({ ...READ, sizes: [], sizeIndex: null })
    const medium = stored(READ)
    for (const readings of [[unsized, medium], [medium, unsized]]) {
      expect(findReading(readings, 'M')).toBe(medium)
      expect(findReading(readings, 'L')).toBeNull()
    }
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

describe('taille d’une lecture', () => {
  it('prend la taille donnée par la lecture, sinon celle demandée, sinon la première', () => {
    expect(readSizeIndex({ sizes: ['S', 'M'], sizeIndex: 1 }, 'S')).toBe(1)
    expect(readSizeIndex({ sizes: ['S', 'M'], sizeIndex: undefined }, ' m ')).toBe(1)
    expect(readSizeIndex({ sizes: ['S', 'M'], sizeIndex: null }, '')).toBe(0)
    expect(readSizeIndex({ sizes: ['S', 'M'], sizeIndex: null }, 'XXL')).toBeNull()
    expect(readSizeIndex({ sizes: [], sizeIndex: null }, 'M')).toBeNull()
  })

  it('garde une lecture sous sa taille, pas si elle est inconnue parmi plusieurs', () => {
    expect(readingKey({ sizes: ['S', 'M'], sizeIndex: 1 })).toEqual({ sizeIndex: 1, sizeLabel: 'M' })
    expect(readingKey({ sizes: [], sizeIndex: undefined })).toEqual({ sizeIndex: null, sizeLabel: 'Unique' })
    expect(readingKey({ sizes: ['S'], sizeIndex: null })).toEqual({ sizeIndex: null, sizeLabel: 'Unique' })
    expect(readingKey({ sizes: ['S', 'M'], sizeIndex: null })).toBeNull()
  })

  it('cohérence : une lecture gardée sous sa taille est retrouvée par cette taille', () => {
    const read = { ...READ, sizeIndex: readSizeIndex({ ...READ, sizeIndex: undefined }, 'L') }
    const key = readingKey(read)!
    expect(findReading([{ ...key, readAt: '', reading: read }], 'L')?.sizeLabel).toBe('L')
  })
})

describe('lecture renvoyée par l’IA', () => {
  it('taille retrouvée, passages et aiguilles bornés, tableau et parties manquantes nettoyés', () => {
    const raw = {
      ...READ,
      sizeIndex: undefined,
      steps: [{ ...READ.steps[0]!, times: 40 }],
      sizeChart: { kind: 'body', easeCm: null, rows: 'abîmé' },
      missingParts: ['Col', '', 3],
      needles: [3.5, 99],
    } as unknown as ReadPattern
    const read = readPatternFromResponse(raw, 'L')
    expect(read.sizeIndex).toBe(2)
    expect(read.steps[0]!.times).toBe(1)
    expect(read.sizeChart).toBeNull()
    expect(read.missingParts).toEqual(['Col'])
    expect(read.needles).toEqual([3.5])
    expect(read.title).toBe('Pull Bergamote')
  })
})
