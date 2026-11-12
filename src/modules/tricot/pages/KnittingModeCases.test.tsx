// Mode tricoter : les combinaisons d'une étape (sections, répétitions, diagrammes, adaptation), écran complet.

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { Adaptation } from '../lib/adapt'
import type { KnitChart } from '../lib/chart'
import type { KnitProject, KnitStep, StepSection } from '../lib/pattern'
import { KnittingModePage } from './KnittingModePage'

const rows = (n: number | null, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: n === null ? '5 cm' : null })
const repeat = (every: number, times: number | null, actions: StepSection['actions']): StepSection => ({ kind: 'repeat', rows: null, every, times, actions, text: '', pattern: null })

const TORSADE: KnitChart = {
  id: 'c1',
  stepId: 's1',
  title: 'Torsade',
  gridTop: 0,
  gridBottom: 1,
  rows: 4,
  startRow: 1,
  repeats: true,
  flat: false,
  oddOnly: false,
  imagePath: 'c1.png',
  imageUrl: 'https://cdn.test/c1.png',
}

function project(step: Partial<KnitStep>, extra: Partial<KnitProject> = {}): KnitProject {
  return {
    id: 'p1',
    title: 'Pull',
    size: 'M',
    sizes: [],
    sizeIndex: null,
    pdfPath: null,
    yarns: [],
    patternGauge: { stitches: null, rows: null },
    myGauge: { stitches: null, rows: null },
    charts: [],
    chartHints: [],
    abbreviations: [],
    yarnChecks: [],
    steps: [
      { id: 's1', position: 0, title: 'Devant', instructions: '', totalRows: 20, stitches: 60, sections: [], rowCount: 0, times: 1, pass: 1, notes: '', done: false, highlights: {}, translation: null, ...step },
      { id: 's2', position: 1, title: 'Col', instructions: '', totalRows: null, stitches: null, sections: [], rowCount: 0, times: 1, pass: 1, notes: '', done: false, highlights: {}, translation: null },
    ],
    ...extra,
  }
}

async function open(value: KnitProject) {
  const api = fakeApi()
  api.knitting.getProject.mockResolvedValue(value)
  renderWithApp(<KnittingModePage />, { api, route: '/tricot/p1/tricoter', path: '/tricot/:id/tricoter' })
  const line = await screen.findByRole('region', { name: /à tricoter$/ })
  return {
    line,
    upcoming: () => screen.queryByRole('list', { name: 'Ensuite' })?.querySelectorAll('li') ?? [],
    stitches: () => screen.getByText(/En fin de rang/).textContent,
    add: async (n = 1) => {
      for (let i = 0; i < n; i++) await userEvent.setup().click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    },
  }
}

const texts = (items: ArrayLike<Element>) => Array.from(items, (li) => li.textContent)

describe('mode tricoter : sans diagramme', () => {
  it('sans section ni répétition : rien de particulier, la fin de l’étape, les mailles ne changent pas', async () => {
    const { line, upcoming, stitches } = await open(project({ rowCount: 4 }))
    expect(line).toHaveTextContent('Rang 5 à tricoterRien de particulier sur ce rang.')
    expect(texts(upcoming())).toEqual(['rang 20Dernier rang de l’étape, ensuite : Coldans 15'])
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('rangs sans répétition : la section en cours, puis le début de la suivante', async () => {
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 2, sections: [rows(4, 'côtes 1/1'), rows(16, 'jersey')] }))
    expect(line).toHaveTextContent('Rang 3 à tricoter4 rangs : côtes 1/1')
    expect(texts(upcoming())).toEqual(['rang 5Nouvelle section : 16 rangs : jerseydans 2', 'rang 20Dernier rang de l’étape, ensuite : Coldans 17'])
    await add(2)
    expect(line).toHaveTextContent('Rang 5 à tricoterNouvelle section : 16 rangs : jersey')
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('répétition à plusieurs actions : chacune sur son rang, avec la nouvelle section le même rang', async () => {
    // Raglan dès le rang 3 : 1 dim. au 1er rang (−1), 1 aug. au dernier (+1), tous les 4 rangs, 2 fois
    const raglan = repeat(4, 2, [
      { text: '1 dim.', rank: 1, stitches: -1 },
      { text: '1 aug.', rank: null, stitches: 1 },
    ])
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 2, totalRows: 10, sections: [rows(2, 'jersey'), raglan] }))
    expect(line).toHaveTextContent('Rang 3 à tricoterNouvelle section : 1 dim. (1er rang) + 1 aug. (dernier rang) — tous les 4 rangs (2 fois)1 dim. (1/2)')
    expect(stitches()).toBe('En fin de rang : 59 mailles')
    expect(texts(upcoming())).toEqual(['rang 61 aug. (1/2)dans 3', 'rang 71 dim. (2/2, dernière fois)dans 4', 'rang 101 aug. (2/2, dernière fois)Dernier rang de l’étape, ensuite : Coldans 7'])
    await add(3)
    expect(line).toHaveTextContent('Rang 6 à tricoter1 aug. (1/2)')
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('répétition jusqu’à la fin de l’étape : numérotée sans total', async () => {
    const { line, upcoming } = await open(project({ rowCount: 7, totalRows: 12, sections: [repeat(4, null, [{ text: '1 aug. de chaque côté', rank: null, stitches: 2 }])] }))
    expect(line).toHaveTextContent('Rang 8 à tricoter1 aug. de chaque côté (2e fois)')
    expect(texts(upcoming())).toEqual(['rang 121 aug. de chaque côté (3e fois)Dernier rang de l’étape, ensuite : Coldans 4'])
  })

  it('deux répétitions à la suite : la jonction se lit sans trou ni doublon', async () => {
    // 1 dim. tous les 2 rangs (2 fois) : rangs 2 et 4 ; puis 1 aug. au 1er rang, tous les 3 rangs (2 fois) : rangs 5 et 8
    const sections = [repeat(2, 2, [{ text: '1 dim.', rank: null, stitches: -1 }]), repeat(3, 2, [{ text: '1 aug.', rank: 1, stitches: 1 }])]
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 3, sections }))
    expect(line).toHaveTextContent('Rang 4 à tricoter1 dim. (2/2, dernière fois)')
    expect(stitches()).toBe('En fin de rang : 58 mailles')
    expect(texts(upcoming())).toEqual([
      'rang 5Nouvelle section : 1 aug. (1er rang) — tous les 3 rangs (2 fois)1 aug. (1/2)dans 1',
      'rang 81 aug. (2/2, dernière fois)dans 4',
      'rang 20Dernier rang de l’étape, ensuite : Coldans 16',
    ])
    await add()
    expect(line).toHaveTextContent('Rang 5 à tricoterNouvelle section : 1 aug. (1er rang) — tous les 3 rangs (2 fois)1 aug. (1/2)')
    expect(stitches()).toBe('En fin de rang : 59 mailles')
  })
})

describe('mode tricoter : avec diagramme', () => {
  it('sans répétition : le rang du diagramme et sa bande, à chaque rang', async () => {
    const { line, add } = await open(project({ rowCount: 5 }, { charts: [TORSADE] }))
    // Rang 6 : 2e passage du motif de 4 rangs, rang 2
    expect(line).toHaveTextContent('Rang 6 à tricoterRien de particulier sur ce rang.Torsade : rang 2 sur 4 · 2e fois · Tour de droite à gauche')
    expect(within(line).getByTestId('chart-strip')).toBeInTheDocument()
    await add()
    expect(line).toHaveTextContent('Torsade : rang 3 sur 4 · 2e fois')
  })

  it('avec répétition : l’action, le diagramme et les mailles ensemble', async () => {
    const { line, stitches } = await open(project({ rowCount: 5, sections: [repeat(6, 3, [{ text: '1 dim. de chaque côté', rank: null, stitches: -2 }])] }, { charts: [TORSADE] }))
    expect(line).toHaveTextContent('Rang 6 à tricoter1 dim. de chaque côté (1/3)Torsade : rang 2 sur 4 · 2e fois')
    expect(within(line).getByTestId('chart-strip')).toBeInTheDocument()
    expect(stitches()).toBe('En fin de rang : 64 mailles')
  })

  it('d’une autre étape : pas affiché', async () => {
    const { line } = await open(project({ rowCount: 5 }, { charts: [{ ...TORSADE, stepId: 's2' }] }))
    expect(line).not.toHaveTextContent('Torsade')
    expect(screen.queryByTestId('chart-strip')).not.toBeInTheDocument()
  })

  it('au-delà d’une section à régler : ni diagramme ni mailles, seulement le renvoi vers la préparation', async () => {
    const { line } = await open(project({ rowCount: 5, sections: [rows(4, 'jersey'), rows(null, 'jersey')] }, { charts: [TORSADE] }))
    expect(line).toHaveTextContent('Rang 6 à tricoterLa suite n’est pas connue')
    expect(line).not.toHaveTextContent('Torsade')
    expect(screen.queryByTestId('chart-strip')).not.toBeInTheDocument()
    expect(screen.queryByText(/En fin de rang/)).not.toBeInTheDocument()
  })

  it('diagramme et section à régler sur le même rang : les deux affichés, rien d’annoncé après', async () => {
    const { line, upcoming } = await open(project({ rowCount: 4, sections: [rows(4, 'jersey'), rows(null, 'jersey')] }, { charts: [TORSADE] }))
    expect(line).toHaveTextContent('Rang 5 à tricoterÀ régler avant de continuer : 5 cm (à régler) : jersey Régler')
    expect(within(line).getByRole('link', { name: 'Régler' })).toHaveAttribute('href', '/tricot/p1?etape=s1')
    expect(line).toHaveTextContent('Torsade : rang 1 sur 4 · 2e fois')
    expect(within(line).getByTestId('chart-strip')).toBeInTheDocument()
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : (?) mailles')
    expect(upcoming()).toHaveLength(0)
  })
})

describe('mode tricoter : toute l’étape', () => {
  it('sections et rangs à faire, avec les mailles, ce qui est fait et le rang à tricoter', async () => {
    const user = userEvent.setup()
    // 4 rangs de côtes, puis 1 dim. de chaque côté tous les 6 rangs (4 fois) : rangs 10, 16, 22, 28 ; 30 rangs, 52 mailles à la fin
    await open(project({ rowCount: 15, totalRows: 30, stitches: 52, sections: [rows(4, 'côtes'), repeat(6, 4, [{ text: '1 dim. de chaque côté', rank: null, stitches: -2 }])] }))
    await user.click(screen.getByText('Toute l’étape'))
    const outline = screen.getByRole('list', { name: 'Toute l’étape' })
    const sections = within(outline).getAllByRole('listitem').filter((li) => li.parentElement === outline)
    expect(sections.map((li) => li.firstChild?.textContent)).toEqual(['4 rangs : côtes', '1 dim. de chaque côté — tous les 6 rangs (4 fois)', 'Fin de l’étape'])
    expect(sections[0]).toHaveTextContent('Rangs 1 à 4 · 4 rangs sans rien de particulier')
    expect(sections[1]).toHaveAttribute('aria-current', 'step')
    const decreases = within(sections[1]!).getAllByRole('listitem')
    expect(decreases.map((li) => li.textContent)).toEqual([
      'Rang 101 dim. de chaque côté (1/4) → 58 mailles',
      'Rang 161 dim. de chaque côté (2/4) → 56 maillesà tricoter',
      'Rang 221 dim. de chaque côté (3/4) → 54 mailles',
      'Rang 281 dim. de chaque côté (4/4, dernière fois) → 52 mailles',
    ])
    expect(within(decreases[0]!).getByLabelText('Fait')).toBeInTheDocument()
    expect(decreases[1]).toHaveAttribute('aria-current', 'step')
    expect(sections[2]).toHaveTextContent('Rang 30Dernier rang de l’étape, ensuite : Col')
  })

  it('section à régler : signalée, la suite sans rangs', async () => {
    const user = userEvent.setup()
    await open(project({ rowCount: 1, sections: [rows(4, 'côtes'), rows(null, 'jersey'), rows(6, 'côtes')] }))
    await user.click(screen.getByText('Toute l’étape'))
    const outline = screen.getByRole('list', { name: 'Toute l’étape' })
    expect(outline).toHaveTextContent('5 cm (à régler) : jerseyÀ régler en rangs dans la préparation : la suite se calculera.')
    expect(outline).toHaveTextContent('6 rangs : côtesRangs pas encore connus (une section avant est à régler).')
  })
})

describe('mode tricoter : patron adapté et cas limites', () => {
  it('patron adapté suivi : ses sections, son nombre de rangs et ses mailles', async () => {
    const adaptation: Adaptation = {
      request: '',
      active: true,
      at: '',
      size: 'M',
      steps: [{ stepId: 's1', totalRows: 24, stitches: 66, sections: [repeat(8, 3, [{ text: '1 aug. de chaque côté', rank: null, stitches: 2 }])], note: '' }],
    }
    const { line, upcoming, stitches } = await open(project({ rowCount: 7, sections: [rows(20, 'jersey')] }, { adaptation }))
    expect(line).toHaveTextContent('Rang 8 à tricoter1 aug. de chaque côté (1/3)')
    expect(screen.getByText('/ 24')).toBeInTheDocument()
    // 66 à la fin, 3 fois +2 : 60 au départ, 62 après le rang 8
    expect(stitches()).toBe('En fin de rang : 62 mailles')
    expect(texts(upcoming()).at(-1)).toBe('rang 241 aug. de chaque côté (3/3, dernière fois)Dernier rang de l’étape, ensuite : Coldans 16')
  })

  it('cm du patron convertis avec l’échantillon : le mode sait quoi faire, et rappelle de vérifier', async () => {
    // 4 rangs de côtes, puis « 5 cm » de jersey : 5 × 30 / 10 = 15 rangs (rangs 5 à 19), puis 1 rang de côtes
    const sections = [rows(4, 'côtes'), rows(null, 'jersey'), rows(1, 'côtes')]
    const { line, upcoming, stitches } = await open(project({ rowCount: 3, sections }, { patternGauge: { stitches: 22, rows: 30 } }))
    expect(line).toHaveTextContent('Rang 4 à tricoter4 rangs : côtes')
    expect(texts(upcoming())).toEqual(['rang 5Nouvelle section : 15 rangs (≈ 5 cm) : jerseydans 1', 'rang 20Nouvelle section : 1 rang : côtesDernier rang de l’étape, ensuite : Coldans 16'])
    expect(stitches()).toBe('En fin de rang : 60 mailles')
    expect(screen.getByRole('note')).toHaveTextContent('Des rangs sont calculés depuis les cm du patron avec l’échantillon (≈) : à vérifier. Vérifier')
    expect(within(screen.getByRole('note')).getByRole('link', { name: 'Vérifier' })).toHaveAttribute('href', '/tricot/p1?etape=s1')
  })

  it('calcul validé : plus de rappel', async () => {
    const sections = [{ ...rows(15, 'jersey'), pattern: '5 cm' }]
    const { line } = await open(project({ rowCount: 3, sections, totalRows: 15 }, { patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 20, rows: 20 } }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    // Validé à 15 rangs : l'échantillon (20 rangs pour 10 cm, soit 10 rangs) ne le change plus
    expect(line).toHaveTextContent('Rang 4 à tricoter15 rangs : jersey')
  })

  it('projet sans étape : rien à tricoter', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue({ ...project({}), steps: [] })
    renderWithApp(<KnittingModePage />, { api, route: '/tricot/p1/tricoter', path: '/tricot/:id/tricoter' })
    expect(await screen.findByText('Aucune étape à tricoter')).toBeInTheDocument()
  })
})
