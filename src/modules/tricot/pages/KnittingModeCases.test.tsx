// Mode tricoter : les combinaisons d'une étape (sections, répétitions, diagrammes, adaptation), écran complet.

import { cleanup, screen, within } from '@testing-library/react'
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
  await screen.findByRole('heading', { level: 1 })
  // Étape pas prête : pas de rang à tricoter (la préparation dit quoi faire)
  const line = screen.queryByRole('region', { name: /à tricoter$/ }) as HTMLElement
  return {
    api,
    line,
    // Le prochain rang qui demande quelque chose, rappelé en tête de « Toute l'étape »
    upcoming: () => screen.queryAllByText(/^Prochain :/),
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
    expect(texts(upcoming())).toEqual(['Prochain : rang 20, dans 15 — Dernier rang de l’étape, ensuite : Col'])
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('rangs sans répétition : la section en cours, puis le début de la suivante', async () => {
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 2, sections: [rows(4, 'côtes 1/1'), rows(16, 'jersey')] }))
    expect(line).toHaveTextContent('Rang 3 à tricoter4 rangs : côtes 1/1')
    expect(texts(upcoming())).toEqual(['Prochain : rang 5, dans 2 — Nouvelle sous-étape : 16 rangs : jersey'])
    await add(2)
    expect(line).toHaveTextContent('Rang 5 à tricoterNouvelle sous-étape : 16 rangs : jersey')
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('répétition à plusieurs actions : chacune sur son rang, avec la nouvelle section le même rang', async () => {
    // Raglan dès le rang 3 : 1 dim. au 1er rang (−1), 1 aug. au dernier (+1), tous les 4 rangs, 2 fois
    const raglan = repeat(4, 2, [
      { text: '1 dim.', rank: 1, stitches: -1 },
      { text: '1 aug.', rank: null, stitches: 1 },
    ])
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 2, totalRows: 10, sections: [rows(2, 'jersey'), raglan] }))
    expect(line).toHaveTextContent('Rang 3 à tricoterNouvelle sous-étape : 1 dim. (1er rang) + 1 aug. (dernier rang) — tous les 4 rangs (2 fois)1 dim. (1/2)')
    expect(stitches()).toBe('En fin de rang : 59 mailles')
    expect(texts(upcoming())).toEqual(['Prochain : rang 6, dans 3 — 1 aug. (1/2)'])
    await add(3)
    expect(line).toHaveTextContent('Rang 6 à tricoter1 aug. (1/2)')
    expect(stitches()).toBe('En fin de rang : 60 mailles')
  })

  it('répétition jusqu’à la fin de l’étape : numérotée sans total', async () => {
    const { line, upcoming } = await open(project({ rowCount: 7, totalRows: 12, sections: [repeat(4, null, [{ text: '1 aug. de chaque côté', rank: null, stitches: 2 }])] }))
    expect(line).toHaveTextContent('Rang 8 à tricoter1 aug. de chaque côté (2e fois)')
    expect(texts(upcoming())).toEqual(['Prochain : rang 12, dans 4 — 1 aug. de chaque côté (3e fois) · Dernier rang de l’étape, ensuite : Col'])
  })

  it('deux répétitions à la suite : la jonction se lit sans trou ni doublon', async () => {
    // 1 dim. tous les 2 rangs (2 fois) : rangs 2 et 4 ; puis 1 aug. au 1er rang, tous les 3 rangs (2 fois) : rangs 5 et 8
    const sections = [repeat(2, 2, [{ text: '1 dim.', rank: null, stitches: -1 }]), repeat(3, 2, [{ text: '1 aug.', rank: 1, stitches: 1 }])]
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 3, sections }))
    expect(line).toHaveTextContent('Rang 4 à tricoter1 dim. (2/2, dernière fois)')
    expect(stitches()).toBe('En fin de rang : 58 mailles')
    expect(texts(upcoming())).toEqual(['Prochain : rang 5, dans 1 — Nouvelle sous-étape : 1 aug. (1er rang) — tous les 3 rangs (2 fois) · 1 aug. (1/2)'])
    await add()
    expect(line).toHaveTextContent('Rang 5 à tricoterNouvelle sous-étape : 1 aug. (1er rang) — tous les 3 rangs (2 fois)1 aug. (1/2)')
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

  it('étape pas prête : rien ne se compte ni ne s’affiche, la préparation dit quoi faire', async () => {
    const { line } = await open(project({ rowCount: 4, sections: [rows(4, 'jersey'), rows(null, 'jersey')] }, { charts: [TORSADE] }))
    expect(line).toBeNull()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('À préparer avant de tricoterSous-étape 2 (5 cm (à régler) : jersey) : nombre de rangs à régler.')
    expect(within(alert).getByRole('link', { name: 'Préparer l’étape' })).toHaveAttribute('href', '/tricot/p1?etape=s1')
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('chart-strip')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Terminer/ })).not.toBeInTheDocument()
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
      'Rang 221 dim. de chaque côté (3/4) → 54 maillesdans 6',
      'Rang 281 dim. de chaque côté (4/4, dernière fois) → 52 maillesdans 12',
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
    expect(outline).toHaveTextContent('6 rangs : côtesRangs pas encore connus (une sous-étape avant est à régler).')
  })
})

describe('mode tricoter : consignes « en même temps »', () => {
  const at = (row: number | null, pattern: string | null = null) => ({ at: { row, pattern } })
  const action = (text: string, stitches: number) => [{ text, rank: null, stitches }]
  // Empiècement raglan inventé : corps et manches tous les 2 rangs, encolure qui commence pendant les deux
  const YOKE: StepSection[] = [
    repeat(2, 10, action('raglan corps', -4)),
    { ...repeat(2, 11, action('raglan manches', -4)), ...at(1) },
    { ...repeat(1, 1, action('20 m centrales en attente', -20)), ...at(15) },
    repeat(2, 2, action('encolure : 2 m de chaque côté', -4)),
  ]

  it('le rang réunit les consignes qui tombent dessus, la suite les mêle, les mailles les comptent toutes', async () => {
    // 22 rangs, 100 mailles à la fin ; corps −40, manches −44, encolure −28 : 212 au départ
    const { line, upcoming, stitches, add } = await open(project({ rowCount: 13, totalRows: 22, stitches: 100, sections: YOKE }))
    expect(line).toHaveTextContent('Rang 14 à tricoterraglan corps (7/10)raglan manches (7/11)')
    expect(stitches()).toBe(`En fin de rang : ${212 - 7 * 8} mailles`)
    expect(texts(upcoming())).toEqual(['Prochain : rang 15, dans 1 — Nouvelle sous-étape : En même temps, dès le rang 15 : 20 m centrales en attente — à chaque rang (1 fois) · 20 m centrales en attente (1/1, dernière fois)'])
    await add(1)
    expect(line).toHaveTextContent('Rang 15 à tricoter')
    expect(stitches()).toBe(`En fin de rang : ${212 - 7 * 8 - 20} mailles`)
  })

  it('encolure « à 5 cm » sans échantillon : à régler dès le début ; avec l’échantillon : convertie, avec le rappel', async () => {
    const sections = YOKE.map((s, i) => (i === 2 ? { ...s, ...at(null, '5 cm') } : s))
    const first = await open(project({ rowCount: 0, totalRows: 22, stitches: 100, sections }))
    expect(first.line).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Sous-étape 3 (En même temps, à 5 cm (à régler) : 20 m centrales en attente — à chaque rang (1 fois)) : rang de début « en même temps » à régler.')
    expect(first.upcoming()).toHaveLength(0)
  })

  it('encolure « à 5 cm » avec l’échantillon du patron : rang calculé (≈), rappel à vérifier', async () => {
    const sections = YOKE.map((s, i) => (i === 2 ? { ...s, ...at(null, '5 cm') } : s))
    // 5 cm × 28 rangs pour 10 cm = 14 rangs : début au rang 15
    await open(project({ rowCount: 13, totalRows: 22, stitches: 100, sections }, { patternGauge: { stitches: 22, rows: 28 } }))
    // Calculé, mais à vérifier avant de tricoter
    expect(screen.getByRole('alert')).toHaveTextContent('calcul à vérifier (début : 5 cm × 28 rangs pour 10 cm (échantillon du patron) ≈ rang 15)')
    cleanup()
    // Vérifié (rang 15 gardé) : le mode suit
    const checked = YOKE.map((s, i) => (i === 2 ? { ...s, ...at(15, '5 cm') } : s))
    const { upcoming } = await open(project({ rowCount: 13, totalRows: 22, stitches: 100, sections: checked }, { patternGauge: { stitches: 22, rows: 28 } }))
    expect(texts(upcoming())[0]).toBe('Prochain : rang 15, dans 1 — Nouvelle sous-étape : En même temps, dès le rang 15 : 20 m centrales en attente — à chaque rang (1 fois) · 20 m centrales en attente (1/1, dernière fois)')
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
    expect(texts(upcoming())).toEqual(['Prochain : rang 16, dans 8 — 1 aug. de chaque côté (2/3)'])
  })

  it('cm du patron convertis avec l’échantillon : le mode sait quoi faire, et rappelle de vérifier', async () => {
    // 4 rangs de côtes, puis « 5 cm » de jersey : 5 × 30 / 10 = 15 rangs (rangs 5 à 19), puis 1 rang de côtes
    const sections = [rows(4, 'côtes'), rows(null, 'jersey'), rows(1, 'côtes')]
    const { line } = await open(project({ rowCount: 3, sections }, { patternGauge: { stitches: 22, rows: 30 } }))
    // Le calcul est fait, mais il se vérifie avant de tricoter
    expect(line).toBeNull()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sous-étape 2 (15 rangs (≈ 5 cm) : jersey) : calcul à vérifier (5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ 15 rangs).')
    expect(within(alert).getByRole('link', { name: 'Préparer l’étape' })).toHaveAttribute('href', '/tricot/p1?etape=s1')
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

describe('mode tricoter : un seul compteur, celui de la sous-étape', () => {
  const counter = () => screen.getByRole('contentinfo')

  it('compte dans la sous-étape en cours ; la finir plus tôt fixe sa longueur aux rangs tricotés', async () => {
    const step = { totalRows: null, rowCount: 14, sections: [rows(12, 'côtes'), rows(10, 'jersey'), rows(4, 'côtes')] }
    const { api } = await open(project(step))
    expect(counter()).toHaveTextContent('2 / 10rangs faits · 10 rangs : jersey')
    expect(counter()).toHaveTextContent('Étape : 14 rangs')
    await userEvent.setup().click(within(counter()).getByRole('button', { name: 'Sous-étape finie (2 rangs)' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s1', { sections: [rows(12, 'côtes'), rows(2, 'jersey'), rows(4, 'côtes')] })
  })

  it('longueur connue : rangs sur le total de la sous-étape, l’étape en petit, et la finir plus tôt', async () => {
    await open(project({ rowCount: 11, sections: [rows(12, 'côtes'), rows(8, 'jersey')] }))
    expect(counter()).toHaveTextContent('11 / 12rangs faits · 12 rangs : côtes')
    expect(counter()).toHaveTextContent('Étape : 11 / 20 rangs')
    expect(within(counter()).getByRole('button', { name: 'Sous-étape finie (11 rangs)' })).toBeInTheDocument()
  })

  it('« en même temps » : les autres sous-étapes en cours rappelées sous le compteur', async () => {
    const together = [rows(20, 'jersey'), { ...rows(6, 'encolure'), at: { row: 5, pattern: null } }]
    await open(project({ rowCount: 6, sections: together }))
    expect(counter()).toHaveTextContent('6 / 20rangs faits · 20 rangs : jersey')
    expect(counter()).toHaveTextContent('En même temps : 2 / 6')
  })
})
