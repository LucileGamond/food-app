import type { Adaptation } from './adapt'
import { projectSummary, type SummarySource } from './projectSummary'

const step = (id: string, overrides: Partial<SummarySource['steps'][number]> = {}): SummarySource['steps'][number] => ({
  id,
  title: `Étape ${id}`,
  totalRows: 40,
  rowCount: 0,
  times: 1,
  pass: 1,
  done: false,
  ...overrides,
})

const ADAPTED: Adaptation = { request: 'manches plus longues', active: true, at: '2026-11-08T10:00:00Z', size: 'M', steps: [{ stepId: 's2', totalRows: 56, stitches: null, sections: [], note: '' }] }

const source = (overrides: Partial<SummarySource> = {}): SummarySource => ({
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  updatedAt: '2026-11-10T08:00:00Z',
  adaptation: null,
  steps: [step('s1', { done: true }), step('s2', { rowCount: 12, times: 2, pass: 2 }), step('s3')],
  hues: ['#d0563a'],
  ...overrides,
})

describe('résumé d’un projet', () => {
  it('étape en cours : la première non terminée, avec son numéro et son avancée', () => {
    expect(projectSummary(source())).toEqual({
      id: 'p1',
      title: 'Pull Bergamote',
      size: 'M',
      updatedAt: '2026-11-10T08:00:00Z',
      stepsDone: 1,
      stepsTotal: 3,
      current: { number: 2, title: 'Étape s2', rowCount: 12, totalRows: 40, times: 2, pass: 2 },
      hues: ['#d0563a'],
    })
  })

  it('projet terminé ou sans étape : pas d’étape en cours', () => {
    expect(projectSummary(source({ steps: [step('s1', { done: true })] })).current).toBeNull()
    expect(projectSummary(source({ steps: [] }))).toMatchObject({ current: null, stepsDone: 0, stepsTotal: 0 })
  })

  it('taille suivie : celle choisie parmi les tailles du patron', () => {
    expect(projectSummary(source({ sizes: ['S', 'M', 'L'], sizeIndex: 2 })).size).toBe('L')
  })

  it('patron adapté suivi : les rangs de l’étape en cours sont ceux de l’adaptation', () => {
    expect(projectSummary(source({ adaptation: ADAPTED })).current?.totalRows).toBe(56)
    // En pause (faite pour M, L suivie) ou abandonnée : les rangs du patron
    expect(projectSummary(source({ adaptation: ADAPTED, sizes: ['M', 'L'], sizeIndex: 1 })).current?.totalRows).toBe(40)
    expect(projectSummary(source({ adaptation: { ...ADAPTED, active: false } })).current?.totalRows).toBe(40)
  })
})
