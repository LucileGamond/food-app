import type { StepSection } from './pattern'
import { OUTLINE_OPEN_ROWS, outlineIndexAt, stepOutline } from './outline'

const rows = (n: number | null, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: n === null ? '5 cm' : null })
const repeat = (every: number, times: number | null, text: string, stitches?: number): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  actions: [{ text, rank: null, ...(stitches === undefined ? {} : { stitches }) }],
  text: '',
  pattern: null,
})

const summary = (step: Parameters<typeof stepOutline>[0], next: string | null = 'Col') =>
  stepOutline(step, next).map((s) => ({ title: s.title, range: s.range, rows: s.rows.map((r) => r.row), quiet: s.quiet, toSet: s.toSet, cut: s.cut }))

describe('étape entière', () => {
  it('sections, rangs à faire, rangs sans rien, et la fin de l’étape après la dernière section', () => {
    // 4 rangs de côtes, puis 1 dim. tous les 6 rangs (4 fois) : rangs 10, 16, 22, 28 ; 30 rangs en tout
    const step = { sections: [rows(4, 'côtes'), repeat(6, 4, '1 dim. de chaque côté', -2)], totalRows: 30, stitches: 52 }
    expect(summary(step)).toEqual([
      { title: '4 rangs : côtes', range: 'Rangs 1 à 4', rows: [], quiet: 4, toSet: false, cut: false },
      { title: '1 dim. de chaque côté — tous les 6 rangs (4 fois)', range: 'Rangs 5 à 28', rows: [10, 16, 22, 28], quiet: 20, toSet: false, cut: false },
      { title: null, range: 'Rangs 29 à 30', rows: [30], quiet: 1, toSet: false, cut: false },
    ])
    const outline = stepOutline(step, 'Col')
    // Mailles après chaque action : 60 au départ
    expect(outline[1]!.rows.map((r) => r.stitches)).toEqual([58, 56, 54, 52].map((stitches) => ({ kind: 'sure', stitches })))
    expect(outline[2]!.rows[0]).toEqual({ row: 30, events: [{ kind: 'step-end', next: 'Col' }], stitches: null })
  })

  it('sans section : la fin de l’étape seulement ; sans nombre de rangs : rien', () => {
    expect(summary({ sections: [], totalRows: 12, stitches: null }, null)).toEqual([{ title: null, range: 'Rangs 1 à 12', rows: [12], quiet: 11, toSet: false, cut: false }])
    expect(stepOutline({ sections: [], totalRows: 12, stitches: null }, null)[0]!.rows[0]!.events).toEqual([{ kind: 'step-end', next: null }])
    expect(summary({ sections: [], totalRows: null, stitches: null })).toEqual([])
  })

  it('section à régler : listée sans rangs, comme les suivantes', () => {
    expect(summary({ sections: [rows(4, 'côtes'), rows(null, 'jersey'), rows(6, 'côtes')], totalRows: 40, stitches: 60 })).toEqual([
      { title: '4 rangs : côtes', range: 'Rangs 1 à 4', rows: [], quiet: 4, toSet: false, cut: false },
      { title: '5 cm (à régler) : jersey', range: 'À partir du rang 5', rows: [], quiet: 0, toSet: true, cut: false },
      { title: '6 rangs : côtes', range: null, rows: [], quiet: 0, toSet: false, cut: false },
    ])
  })

  it('répétition jusqu’à la fin d’une étape sans nombre de rangs : coupée', () => {
    const [section] = stepOutline({ sections: [repeat(10, null, '1 aug.')], totalRows: null, stitches: null }, null)
    expect(section!.cut).toBe(true)
    expect(section!.rows).toHaveLength(OUTLINE_OPEN_ROWS / 10)
    // Mailles inconnues : pas affichées
    expect(section!.rows[0]!.stitches).toBeNull()
  })

  it('effet deviné : mailles en estimation', () => {
    const [section] = stepOutline({ sections: [repeat(2, 2, '1 dim.')], totalRows: 4, stitches: 10 }, null)
    expect(section!.rows[0]!.stitches).toEqual({ kind: 'estimate', stitches: 11, reasons: ['Effet de « 1 dim. » deviné : -1 mailles.'] })
  })

  it('section du rang en cours', () => {
    const outline = stepOutline({ sections: [rows(4, 'côtes'), repeat(6, 4, '1 dim.')], totalRows: 30, stitches: null }, null)
    expect(outlineIndexAt(outline, 1)).toBe(0)
    expect(outlineIndexAt(outline, 5)).toBe(1)
    expect(outlineIndexAt(outline, 29)).toBe(2)
    expect(outlineIndexAt(outline, 31)).toBeNull()
  })
})
