import { knitProject, knitStep, rows } from '@/test/knitFactories'
import type { KnitChart } from './chart'
import { gaugeOfStep, projectView } from './projectView'

const chart = (overrides: Partial<KnitChart> = {}): KnitChart => ({
  id: 'c1',
  stepId: 's1',
  title: 'Torsade',
  imagePath: 'u/c1.jpg',
  imageUrl: null,
  gridTop: 0,
  gridBottom: 1,
  rows: 8,
  startRow: 1,
  endRow: null,
  sectionId: null,
  repeats: false,
  flat: false,
  oddOnly: false,
  ...overrides,
})

describe('projectView', () => {
  it('projet sans étape : aucune étape en cours, aucun diagramme', () => {
    const view = projectView(knitProject({ steps: [] }))
    expect(view.steps).toEqual([])
    expect(view.current).toBeUndefined()
    expect(view.charts).toEqual([])
    expect(view.following).toBe(false)
  })

  it('étape en cours : la première non terminée', () => {
    const view = projectView(knitProject({ steps: [knitStep({ id: 'a', done: true }), knitStep({ id: 'b' }), knitStep({ id: 'c' })] }))
    expect(view.current?.id).toBe('b')
  })

  it('aiguilles proposées : celles du patron et celles des échantillons, sans doublon', () => {
    const view = projectView(
      knitProject({
        needles: [4, 3.5],
        gauges: [
          { needle: 4, stitches: 22, rows: 30, checked: false },
          { needle: 5, stitches: 18, rows: 24, checked: false },
          { needle: null, stitches: 20, rows: 28, checked: false },
        ],
      }),
    )
    expect(view.needles).toEqual([4, 3.5])
    expect([...view.needleChoices].sort()).toEqual([3.5, 4, 5])
  })

  it('projet ancien sans aiguilles ni échantillons : listes vides', () => {
    const view = projectView(knitProject({ needles: undefined, gauges: undefined }))
    expect(view.needles).toEqual([])
    expect(view.gauges).toEqual([])
    expect(view.needleChoices).toEqual([])
  })

  it('diagrammes : avec et sans sous-étape, avec et sans répétition', () => {
    const step = knitStep({ id: 's1', totalRows: 20, sections: [{ ...rows(4, 'côtes'), id: 'x1' }, { ...rows(16, 'torsades'), id: 'x2' }] })
    const view = projectView(knitProject({ steps: [step], charts: [chart({ id: 'libre' }), chart({ id: 'suit', sectionId: 'x2', repeats: true })] }))
    expect(view.charts.map((c) => c.id)).toEqual(['libre', 'suit'])
    // Le diagramme rattaché à la 2e sous-étape commence après les 4 rangs de côtes.
    expect(view.charts.find((c) => c.id === 'suit')!.startRow).toBe(5)
    expect(view.charts.find((c) => c.id === 'libre')!.startRow).toBe(1)
  })
})

describe('gaugeOfStep', () => {
  const patternGauge = { stitches: 20, rows: 28 }

  it('patron adapté suivi : l’échantillon du patron (les nombres sont déjà recalculés)', () => {
    const project = knitProject({ patternGauge })
    const step = knitStep({ sections: [{ ...rows(4, ''), needle: 4 }] })
    expect(gaugeOfStep(project, { following: true, needles: [4], gauges: [{ needle: 4, stitches: 22, rows: 30, checked: false }] }, step)).toEqual(patternGauge)
  })

  it('l’échantillon de l’aiguille de la première sous-étape', () => {
    const project = knitProject({ patternGauge })
    const step = knitStep({ sections: [{ ...rows(4, ''), needle: 4 }, { ...rows(4, ''), needle: 5 }] })
    const gauges = [
      { needle: 4, stitches: 22, rows: 30, checked: false },
      { needle: 5, stitches: 18, rows: 24, checked: false },
    ]
    expect(gaugeOfStep(project, { following: false, needles: [4, 5], gauges }, step)).toEqual({ stitches: 22, rows: 30 })
  })

  it('sans sous-étape : l’aiguille héritée de l’étape d’avant, sinon l’échantillon du patron', () => {
    const project = knitProject({ patternGauge })
    const gauges = [{ needle: 5, stitches: 18, rows: 24, checked: false }]
    expect(gaugeOfStep(project, { following: false, needles: [4, 5], gauges }, { ...knitStep(), needleFrom: 5 })).toEqual({ stitches: 18, rows: 24 })
    expect(gaugeOfStep(project, { following: false, needles: [4, 5], gauges }, knitStep())).toEqual(patternGauge)
  })
})
