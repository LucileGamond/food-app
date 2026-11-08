import type { KnitProject, KnitStep } from './pattern'
import { clearProgress, forgetProjectCopy, isOffline, loadProjectCopy, pendingFor, pendingProgress, queueProgress, saveProjectCopy, withPending } from './offline'

const step = (id: string, rowCount = 0): KnitStep => ({ id, position: 0, title: id, instructions: '', totalRows: 10, stitches: null, sections: [], rowCount, notes: '', done: false, highlights: {} })
const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  steps: [step('s1', 3), step('s2')],
  charts: [],
  chartHints: [],
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
}

beforeEach(() => localStorage.clear())

describe('copie du projet sur le téléphone', () => {
  it('garde et relit la dernière version', () => {
    expect(loadProjectCopy('p1')).toBeNull()
    saveProjectCopy(PROJECT)
    expect(loadProjectCopy('p1')).toEqual(PROJECT)
    expect(loadProjectCopy('p2')).toBeNull()
    forgetProjectCopy('p1')
    expect(loadProjectCopy('p1')).toBeNull()
  })

  it('ignore une copie abîmée ou un stockage indisponible', () => {
    localStorage.setItem('life:tricot:projet:p1', '{pas du json')
    expect(loadProjectCopy('p1')).toBeNull()
    localStorage.setItem('life:tricot:projet:p1', JSON.stringify({ id: 'p1' }))
    expect(loadProjectCopy('p1')).toBeNull()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveProjectCopy(PROJECT)).not.toThrow()
    setItem.mockRestore()
  })
})

describe('avancée en attente', () => {
  it('fusionne par étape, s’applique au projet et se retire une fois envoyée', () => {
    queueProgress('p1', 's1', { rowCount: 4 })
    queueProgress('p1', 's1', { rowCount: 5, notes: 'Aiguilles 4' })
    queueProgress('p2', 's9', { done: true })
    expect(pendingFor('p1')).toEqual([['s1', { rowCount: 5, notes: 'Aiguilles 4' }]])
    expect(withPending(PROJECT).steps[0]).toMatchObject({ rowCount: 5, notes: 'Aiguilles 4' })
    expect(withPending({ ...PROJECT, id: 'p3' })).toEqual({ ...PROJECT, id: 'p3' })

    // Un rang compté pendant l'envoi : l'attente reste
    clearProgress('s1', { rowCount: 4 })
    expect(pendingFor('p1')).toHaveLength(1)
    clearProgress('s1', { rowCount: 5, notes: 'Aiguilles 4' })
    expect(pendingFor('p1')).toEqual([])
    clearProgress('s9', { done: true })
    expect(pendingProgress()).toEqual({})
    expect(localStorage.getItem('life:tricot:en-attente')).toBeNull()
  })

  it('sait si le navigateur est hors ligne', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(isOffline()).toBe(true)
    online.mockReturnValue(true)
    expect(isOffline()).toBe(false)
    online.mockRestore()
  })
})
