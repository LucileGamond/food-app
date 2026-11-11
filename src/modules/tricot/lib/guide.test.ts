import type { KnitChart } from './chart'
import { chartsAt, createGuide, describeEvent, sectionSource, stepEndSource, stepGuide, type GuideSource } from './guide'
import type { StepSection } from './pattern'

const rows = (n: number | null, text = 'jersey'): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: n === null ? 'Jersey sur 5 cm' : null })
const repeat = (every: number | null, times: number | null, actions: { text: string; rank: number | null }[]): StepSection => ({ kind: 'repeat', rows: null, every, times, actions, text: '', pattern: every === null ? 'tous les 5 cm' : null })

// Devant : 4 rangs de côtes, 1 dim. tous les 2 rangs (3 fois, au 2e rang), puis 6 rangs de jersey : 16 rangs.
const FRONT = [rows(4, 'côtes 1/1'), repeat(2, 3, [{ text: '1 dim. de chaque côté', rank: 2 }]), rows(6)]

const chart = (overrides: Partial<KnitChart> = {}): KnitChart => ({
  id: 'c1',
  stepId: 's1',
  title: 'Torsade',
  gridTop: 0,
  gridBottom: 1,
  rows: 4,
  startRow: 5,
  repeats: false,
  flat: true,
  oddOnly: false,
  imagePath: 'x.jpg',
  imageUrl: 'https://cdn.test/x.jpg',
  ...overrides,
})

describe('guide du rang', () => {
  it('dit ce qui se fait sur le rang : début de section, action numérotée, section en cours', () => {
    const guide = stepGuide({ sections: FRONT, totalRows: 16 }, [], 'Col')
    expect(guide.at(1)).toMatchObject({ events: [{ kind: 'section', text: '4 rangs : côtes 1/1' }], context: '4 rangs : côtes 1/1', unknown: false })
    expect(guide.at(5).events).toEqual([{ kind: 'section', text: '1 dim. de chaque côté (dernier rang) — tous les 2 rangs (3 fois)' }])
    expect(guide.at(6).events).toEqual([{ kind: 'action', text: '1 dim. de chaque côté', count: 1, times: 3 }])
    // Rang sans rien de particulier : seulement la section en cours
    expect(guide.at(7)).toMatchObject({ events: [], context: '1 dim. de chaque côté (dernier rang) — tous les 2 rangs (3 fois)' })
    expect(guide.at(16).events).toEqual([{ kind: 'step-end', next: 'Col' }])
  })

  it('annonce les prochains rangs qui demandent quelque chose, jusqu’à la fin de l’étape', () => {
    const guide = stepGuide({ sections: FRONT, totalRows: 16 }, [], 'Col')
    expect(guide.upcoming(6).map((u) => [u.row, u.inRows, u.events.map(describeEvent)])).toEqual([
      [8, 2, ['1 dim. de chaque côté (2/3)']],
      [10, 4, ['1 dim. de chaque côté (3/3, dernière fois)']],
      [11, 5, ['Nouvelle section : 6 rangs : jersey']],
      [16, 10, ['Dernier rang de l’étape, ensuite : Col']],
    ])
    expect(guide.upcoming(6, 2)).toHaveLength(2)
    expect(guide.upcoming(16)).toEqual([])
  })

  it('plusieurs événements sur le même rang restent ensemble', () => {
    const guide = stepGuide({ sections: [rows(2), repeat(2, 1, [{ text: '1 aug.', rank: 1 }])], totalRows: 4 }, [], null)
    expect(guide.upcoming(0)[1]).toEqual({ row: 3, inRows: 3, events: [{ kind: 'section', text: '1 aug. (1er rang) — tous les 2 rangs (1 fois)' }, { kind: 'action', text: '1 aug.', count: 1, times: 1 }] })
  })

  it('section à régler : annoncée, puis plus rien n’est prévu au-delà', () => {
    const guide = stepGuide({ sections: [rows(4), rows(null), repeat(2, 3, [{ text: '1 dim.', rank: null }])], totalRows: 40 }, [], 'Col')
    expect(guide.upcoming(0).map((u) => u.row)).toEqual([1, 5])
    expect(describeEvent(guide.upcoming(0)[1]!.events[0]!)).toBe('À régler avant de continuer : Jersey sur 5 cm (à régler) : jersey')
    expect(guide.at(5).unknown).toBe(false)
    expect(guide.at(6)).toMatchObject({ unknown: true, events: [] })
    // Une répétition au rythme inconnu bloque de la même façon
    expect(sectionSource([repeat(null, 3, [{ text: '1 dim.', rank: null }])], 30).unknownFrom).toBe(1)
  })

  it('répétition jusqu’à la fin de l’étape : numérotée sans total', () => {
    const guide = stepGuide({ sections: [repeat(4, null, [{ text: '1 aug.', rank: null }])], totalRows: 12 }, [], null)
    expect(guide.at(12).events.map(describeEvent)).toEqual(['1 aug. (3e fois)', 'Dernier rang de l’étape, et du projet'])
  })

  it('étape sans nombre de rangs : pas de fin annoncée', () => {
    expect(stepEndSource(null, 'Col').eventsAt(10)).toEqual([])
    const guide = stepGuide({ sections: [], totalRows: null }, [], 'Col')
    expect(guide.at(3)).toEqual({ row: 3, events: [], context: null, charts: [], unknown: false })
    expect(guide.upcoming(3)).toEqual([])
  })

  it('les diagrammes accompagnent le rang sans encombrer « Ensuite »', () => {
    const torsade = chart()
    const guide = stepGuide({ sections: [rows(12)], totalRows: 12 }, [torsade], null)
    expect(guide.at(2).charts).toEqual([{ chart: torsade, position: { kind: 'before', startRow: 5 } }])
    expect(guide.at(6).charts[0]!.position).toMatchObject({ kind: 'row', chartRow: 2, side: 'envers', direction: 'ltr' })
    // Fini au rang 8 : rappelé au rang 9, puis plus rien
    expect(guide.at(9).charts[0]!.position).toEqual({ kind: 'after' })
    expect(guide.at(10).charts).toEqual([])
    expect(guide.upcoming(0).map((u) => u.row)).toEqual([1, 12])
    expect(chartsAt([chart({ repeats: true })], 30)[0]!.position).toMatchObject({ kind: 'row', repeat: 7 })
  })

  it('une nouvelle source s’ajoute sans toucher aux autres', () => {
    const buttonholes: GuideSource = { unknownFrom: null, eventsAt: (row) => (row % 10 === 0 ? [{ kind: 'action', text: 'boutonnière', count: row / 10, times: null }] : []) }
    const guide = createGuide({ sources: [sectionSource(FRONT, 16), buttonholes], totalRows: 16 })
    expect(guide.at(10).events.map(describeEvent)).toEqual(['1 dim. de chaque côté (3/3, dernière fois)', 'boutonnière (1re fois)'])
  })
})
