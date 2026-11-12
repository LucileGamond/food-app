import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { AppError } from '@/api'
import type { KnitProject, KnitStep, ReadPattern } from '../lib/pattern'
import { EMPTY_YARN, type QueuedPattern, type StashItem } from '../lib/yarn'
import { KnittingImportPage } from './KnittingImportPage'
import { KnittingPage } from './KnittingPage'
import { KnittingProjectPage } from './KnittingProjectPage'
import { openFold } from '@/test/openFold'

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos – côtes',
  instructions: 'Monter 64 m.',
  totalRows: 18,
  stitches: 64,
  sections: [],
  rowCount: 0,
  times: 1,
  pass: 1,
  notes: '',
  done: false,
  highlights: {},
  translation: null,
  ...overrides,
})

const PROJECT: KnitProject = {
  charts: [],
  chartHints: [],
  abbreviations: [],
  yarnChecks: [],
  sizes: [],
  sizeIndex: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  pdfPath: 'u-lucile/abc.pdf',
  steps: [
    step({ id: 's1', done: true, rowCount: 18 }),
    step({
      id: 's2',
      position: 1,
      title: 'Emmanchures',
      instructions: 'Tricoter 4 rangs, puis diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
      totalRows: 30,
      stitches: 56,
      rowCount: 8,
      sections: [
        { kind: 'rows', rows: 4, every: null, times: null, text: 'jersey', pattern: null },
        { kind: 'repeat', rows: null, every: 6, times: 4, text: '1 diminution de chaque côté', pattern: null },
      ],
    }),
    step({ id: 's3', position: 2, title: 'Encolure', totalRows: null, stitches: null }),
  ],
}

const PATTERN: ReadPattern = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  gauge: { stitches: 22, rows: 30 },
  steps: PROJECT.steps.map(({ title, instructions, totalRows, stitches, sections }) => ({ title, instructions, totalRows, stitches, sections })),
}

// Le projet est gardé sur le téléphone (hors ligne) : chaque test repart sans copie.
beforeEach(() => localStorage.clear())

describe('KnittingPage', () => {
  it('liste les projets avec leur avancée', async () => {
    const api = fakeApi()
    api.knitting.listProjects.mockResolvedValue([
      { id: 'p1', title: 'Pull Bergamote', size: 'M', updatedAt: '', stepsDone: 1, stepsTotal: 3 },
      { id: 'p2', title: 'Bonnet', size: '4 ans', updatedAt: '', stepsDone: 2, stepsTotal: 2 },
    ])
    renderWithApp(<KnittingPage />, { api })
    const list = await screen.findByRole('list', { name: 'Projets de tricot' })
    expect(within(list).getByRole('link', { name: /Pull Bergamote/ })).toHaveAttribute('href', '/tricot/p1')
    expect(within(list).getByText('Taille M · 1 / 3 étapes')).toBeInTheDocument()
    expect(within(list).getByText('Taille 4 ans · terminé')).toBeInTheDocument()
  })

  it('invite à charger un premier patron, et propose de réessayer en cas d’erreur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listProjects.mockRejectedValueOnce(new Error('réseau'))
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucun projet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Nouveau patron' })[0]).toHaveAttribute('href', '/tricot/nouveau')
  })
})

describe('KnittingImportPage', () => {
  const pdf = () => new File(['%PDF-1.4'], 'bergamote.pdf', { type: 'application/pdf' })

  function renderImport(api = fakeApi()) {
    return renderWithApp(<KnittingImportPage />, {
      api,
      route: '/tricot/nouveau',
      path: '/tricot/nouveau',
      extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} />,
    })
  }

  it('lit le patron pour la taille choisie, montre les étapes puis enregistre le projet', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const charts = [
      { page: 4, title: 'Torsade', rows: 24, step: 1, flat: true, oddOnly: false },
      { page: 6, title: '', rows: null, step: null, flat: null, oddOnly: false },
    ]
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, charts })
    api.knitting.createProject.mockResolvedValue('p9')
    renderImport(api)

    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choisis le PDF du patron.')
    const file = pdf()
    await user.upload(screen.getByLabelText('Patron (PDF)'), file)
    await user.type(screen.getByLabelText('Taille choisie'), ' M ')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(file, 'M')

    const steps = await screen.findByRole('list', { name: 'Étapes lues' })
    expect(within(steps).getAllByRole('listitem').filter((li) => li.parentElement === steps)).toHaveLength(3)
    expect(within(steps).getByText('30 rangs · 56 mailles')).toBeInTheDocument()
    expect(within(steps).getByText('4 rangs : jersey')).toBeInTheDocument()
    expect(within(steps).getByText('1 diminution de chaque côté — tous les 6 rangs (4 fois)')).toBeInTheDocument()
    expect(screen.getByText('Taille M · 3 étapes · échantillon 22 m. × 30 rangs pour 10 cm')).toBeInTheDocument()
    // Diagrammes repérés : sous leur étape, ou à part
    expect(within(steps).getAllByRole('listitem')[1]).toHaveTextContent('Diagramme : Torsade, page 4')
    expect(screen.getByText(/Autres diagrammes repérés/)).toHaveTextContent('Autres diagrammes repérés : Diagramme, page 6')

    await user.clear(screen.getByLabelText('Nom du projet'))
    await user.type(screen.getByLabelText('Nom du projet'), 'Pull de Noël')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith({ title: 'Pull de Noël', size: 'M', pdf: file, steps: PATTERN.steps, gauge: { stitches: 22, rows: 30 }, queued: null, chartHints: charts, sizes: ['S', 'M', 'L'], sizeIndex: 1, abbreviations: [] })
    expect(await screen.findByText('Projet ouvert')).toBeInTheDocument()
  })

  it('étape à tricoter 2 fois lue dans le patron : annoncée, puis gardée à l’enregistrement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const steps = [{ title: 'Manches', instructions: 'Tricoter 2 manches identiques.', totalRows: 90, stitches: 50, times: 2, sections: [] }]
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, steps })
    api.knitting.createProject.mockResolvedValue('p9')
    renderImport(api)
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.type(screen.getByLabelText('Taille choisie'), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByText('90 rangs · 50 mailles · à tricoter 2 fois')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ steps }))
  })

  it('affiche le message de la lecture (taille introuvable) et permet de recommencer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const { AppError } = await import('@/api')
    api.knitting.readPattern.mockRejectedValueOnce(new AppError('Taille « XXL » introuvable. Tailles du patron : S, M, L.')).mockResolvedValueOnce(PATTERN)
    renderImport(api)
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.type(screen.getByLabelText('Taille choisie'), 'XXL')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tailles du patron : S, M, L.')

    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    await user.click(await screen.findByRole('button', { name: 'Recommencer' }))
    expect(screen.getByRole('button', { name: 'Lire le patron' })).toBeInTheDocument()
  })

  it('refuse un PDF trop lourd et signale un enregistrement impossible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    api.knitting.createProject.mockRejectedValueOnce(new Error('réseau'))
    renderImport(api)
    const heavy = pdf()
    Object.defineProperty(heavy, 'size', { value: 21 * 1024 * 1024 })
    await user.upload(screen.getByLabelText('Patron (PDF)'), heavy)
    await user.type(screen.getByLabelText('Taille choisie'), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(screen.getByRole('alert')).toHaveTextContent('PDF trop lourd (20 Mo au plus).')

    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le projet' }))
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer le projet' })).toBeEnabled()
  })
})

/** Page du projet : liste des étapes et cartes repliées ; STEP : l'étape en cours (?etape vide). */
const OVERVIEW = '/tricot/p1'
const STEP = '/tricot/p1?etape'

describe('KnittingProjectPage', () => {
  function renderProject(api = fakeApi(), project: KnitProject | null = PROJECT, route = STEP) {
    api.knitting.getProject.mockResolvedValue(project && structuredClone(project))
    return renderWithApp(<KnittingProjectPage />, {
      api,
      route,
      path: '/tricot/:id',
      extraRoutes: <Route path="/tricot" element={<p>Liste des projets</p>} />,
    })
  }

  it('page du projet : étapes à ouvrir, cartes repliées', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    const nav = await screen.findByRole('navigation', { name: 'Étapes' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Dos – côtes18 / 18 rangs(terminée)', '2Emmanchures8 / 30 rangsEn cours', '3Encolure'])
    expect(links[1]).toHaveAttribute('aria-current', 'step')
    expect(within(links[0]!).getByText('(terminée)')).toBeInTheDocument()
    // Pas d'interrupteur d'écran ni de compteur ici ; les cartes sont repliées.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    for (const title of ['Laine et échantillon', 'Patron adapté à moi', 'Assez de laine pour finir ?', 'Notes et photos']) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false')
    }

    await user.click(links[2]!)
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Pull Bergamote' }))
    expect(await screen.findByRole('navigation', { name: 'Étapes' })).toBeInTheDocument()
  })

  it('règle, ajoute, déplace et supprime des sections', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    // Réglée : l'action passe dans la liste des actions de la répétition
    const decrease = { ...legacy!, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null }] }

    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    await user.clear(within(form).getByLabelText('Tous les … rangs'))
    await user.type(within(form).getByLabelText('Tous les … rangs'), '8')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }] })
    expect(await screen.findByText('Rangs 5 à 36 · prochaine fois : rang 12')).toBeInTheDocument()

    // Nouvelle section sans répétition, à la fin
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-étape' }))
    const added = screen.getByRole('form', { name: 'Sous-étape' })
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    expect(within(added).getByRole('alert')).toHaveTextContent('Indique le nombre de rangs.')
    await user.type(within(added).getByLabelText('Nombre de rangs'), '10')
    await user.type(within(added).getByLabelText('Description (facultatif)'), 'côtes')
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    const rows10 = { kind: 'rows', rows: 10, every: null, times: null, text: 'côtes', pattern: null }
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }, rows10] })
    expect(await screen.findByText('Rangs 37 à 46')).toBeInTheDocument()

    // Une répétition se crée aussi
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-étape' }))
    const repeatForm = screen.getByRole('form', { name: 'Sous-étape' })
    await user.click(within(repeatForm).getByRole('radio', { name: 'Répétition' }))
    await user.click(within(repeatForm).getByRole('button', { name: 'Enregistrer' }))
    expect(within(repeatForm).getByRole('alert')).toHaveTextContent('Indique quoi faire')
    await user.click(within(repeatForm).getByRole('button', { name: 'Annuler' }))

    // Déplacer, puis supprimer
    await user.click(screen.getByRole('button', { name: 'Actions pour « 10 rangs : côtes »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Monter' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, rows10, { ...decrease, every: 8 }] })
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Descendre' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, jersey, { ...decrease, every: 8 }] })
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Supprimer cette sous-étape ?' })
    expect(confirm).toHaveTextContent('« 4 rangs : jersey »')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, { ...decrease, every: 8 }] })
  })

  it('place plusieurs actions dans une répétition', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByRole('combobox', { name: 'Rang de l’action 1' })).toHaveValue('last')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 1' }), '1')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.type(within(form).getByRole('textbox', { name: 'Action 2' }), '1 augmentation')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 2' }), 'last')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.click(within(form).getByRole('button', { name: 'Retirer l’action 3' }))
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [
        PROJECT.steps[1]!.sections[0],
        {
          ...PROJECT.steps[1]!.sections[1],
          text: '',
          actions: [
            { text: '1 diminution de chaque côté', rank: 1 },
            { text: '1 augmentation', rank: null },
          ],
        },
      ],
    })

  })

  it('note les mailles ajoutées ou retirées par chaque action', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    const stitches = within(form).getByRole('textbox', { name: 'Mailles de l’action 1' })
    // Effet deviné d'après le texte, proposé en exemple
    expect(stitches).toHaveValue('')
    expect(stitches).toHaveAttribute('placeholder', '-2')
    await user.type(stitches, 'beaucoup')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Mailles : un nombre entier entre -200 et 200')
    await user.clear(stitches)
    await user.type(stitches, '−2')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [jersey, { ...legacy, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }],
    })
  })

  it('montre la mesure du patron d’une section à régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ kind: 'repeat', rows: null, every: null, times: 3, text: '1 augmentation', pattern: 'tous les 5 cm' }]
    renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Déroulé de l’étape' })
    expect(within(sections).getByText('1 augmentation — tous les 5 cm (rangs à régler)')).toBeInTheDocument()
    expect(within(sections).getByText(/^Indique ton échantillon/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Actions pour « 1 augmentation/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    expect(screen.getByText('tous les 5 cm', { selector: 'span' })).toBeInTheDocument()
  })

  it('convertit les cm du patron en rangs avec l’échantillon : calcul expliqué, à valider ou régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.myGauge = { stitches: 20, rows: 26 }
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' },
      { kind: 'repeat', rows: null, every: null, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm' },
    ]
    const { api } = renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Déroulé de l’étape' })
    // 5 cm × 26 rangs pour 10 cm = 13 rangs ; 2,5 cm × 26 = 6,5 → 7 rangs
    expect(within(sections).getByText('13 rangs (≈ 5 cm) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 1 à 13')).toBeInTheDocument()
    expect(within(sections).getByText('1 augmentation — tous les 7 rangs (≈ 2,5 cm) (3 fois)')).toBeInTheDocument()
    const notes = within(sections).getAllByRole('note')
    expect(notes[0]).toHaveTextContent('Converti depuis le patron : 5 cm × 26 rangs pour 10 cm (ton échantillon) ≈ 13 rangs (arrondi). Vérifie ce nombre, puis valide-le')

    // Valider : enregistré comme un nombre de rangs ordinaire, l'autre section reste à vérifier
    await user.click(within(notes[0]!).getByRole('button', { name: 'Valider' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [
        { kind: 'rows', rows: 13, every: null, times: null, text: 'jersey', pattern: '5 cm' },
        { kind: 'repeat', rows: null, every: 7, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm', measured: { rowsPer10: 26, source: 'mine' } },
      ],
    })

    // Régler : le formulaire part du nombre calculé ; enregistré, il est validé
    await user.click(within(notes[1]!).getByRole('button', { name: 'Régler' }))
    expect(screen.getByLabelText('Tous les … rangs')).toHaveValue('7')
    await user.clear(screen.getByLabelText('Tous les … rangs'))
    await user.type(screen.getByLabelText('Tous les … rangs'), '8')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [expect.anything(), { kind: 'repeat', rows: null, every: 8, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm' }],
    })
  })

  it('section « en même temps » : début à un rang, réglé dans le formulaire ; hauteur du patron convertie', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.steps[1]!.sections = [
      { kind: 'repeat', rows: null, every: 2, times: 10, actions: [{ text: 'raglan', rank: null }], text: '', pattern: null },
      { kind: 'repeat', rows: null, every: 2, times: 2, actions: [{ text: 'encolure', rank: null }], text: '', pattern: null, at: { row: null, pattern: '5 cm' } },
    ]
    const { api } = renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Déroulé de l’étape' })
    // 5 cm × 30 rangs pour 10 cm = 15 rangs : début au rang 16
    expect(within(sections).getByText('En même temps, dès le rang 16 (≈ 5 cm) : encolure — tous les 2 rangs (2 fois)')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 16 à 19')).toBeInTheDocument()
    expect(within(sections).getByRole('note')).toHaveTextContent('Converti depuis le patron : début : 5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ rang 16 (arrondi).')

    // Régler : « En même temps » au rang 18, enregistré validé (hauteur du patron gardée)
    await user.click(within(within(sections).getByRole('note')).getByRole('button', { name: 'Régler' }))
    expect(screen.getByRole('radio', { name: 'En même temps' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('à 5 cm')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('À partir du rang'))
    await user.type(screen.getByLabelText('À partir du rang'), '18')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', {
      sections: [expect.anything(), { kind: 'repeat', rows: null, every: 2, times: 2, actions: [{ text: 'encolure', rank: null }], text: '', pattern: null, at: { row: 18, pattern: '5 cm' } }],
    })

    // Repasser la section « à la suite » : plus de début
    await user.click(screen.getByRole('button', { name: /^Actions pour « En même temps/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    await user.click(screen.getByRole('radio', { name: 'À la suite' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [expect.anything(), expect.not.objectContaining({ at: expect.anything() })] })
  })

  it('cm du patron sans échantillon : invite à le renseigner', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' }]
    renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Déroulé de l’étape' })
    expect(within(sections).getByText('5 cm (à régler) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText(/Indique ton échantillon \(ou celui du patron\) dans « Laine et échantillon »/)).toBeInTheDocument()
    expect(within(sections).queryByRole('note')).not.toBeInTheDocument()
  })

  it('prépare une étape : notes, étape suivante ou précédente, reprise d’une étape terminée, sans compteur', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 3 · 56 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByText('8 rangs faits sur 30')).toBeInTheDocument()
    expect(screen.getByText('Rangs 5 à 28 · prochaine fois : rang 10')).toBeInTheDocument()
    // On tricote dans le mode tricoter : pas de compteur ni d'écran allumé ici
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toHaveAttribute('href', '/tricot/p1/tricoter?etape=s2')

    const notes = screen.getByLabelText('Notes')
    await user.type(notes, 'Aiguilles 4,5')
    await user.tab()
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { notes: 'Aiguilles 4,5' })

    // Étape suivante / précédente
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }))
    expect(screen.getByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Étape suivante' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Étape précédente' }))
    await user.click(screen.getByRole('button', { name: 'Étape précédente' }))
    expect(screen.getByRole('heading', { name: 'Dos – côtes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Étape précédente' })).toBeDisabled()

    // Une étape terminée se rouvre
    await user.click(screen.getByRole('button', { name: 'Reprendre l’étape' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s1', { done: false })
  })

  it('étape à tricoter plusieurs fois : nombre de fois et fois en cours, rappelés dans la liste', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('À tricoter'), '2 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 2, pass: 1 })
    expect(screen.getByText('8 rangs faits sur 30 · 1re fois sur 2')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('En cours'), '2e fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { pass: 2 })
    // Moins de fois que la fois en cours : elle redescend avec.
    await user.selectOptions(screen.getByLabelText('À tricoter'), '1 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 1, pass: 1 })
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
  })

  it('préparation : toute l’étape, rang par rang, avec le rang en cours', async () => {
    const user = userEvent.setup()
    renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    await user.click(screen.getByText('Toute l’étape'))
    const outline = screen.getByRole('list', { name: 'Toute l’étape' })
    expect(outline).toHaveTextContent('Rang 101 diminution de chaque côté (1/4) → 62 (?) mailles')
    expect(within(outline).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')).toHaveTextContent(/^1 diminution de chaque côté — tous les 6 rangs/)
  })

  it('liste des étapes : la fois en cours d’une étape tricotée plusieurs fois', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1] = { ...project.steps[1]!, times: 2, pass: 2 }
    renderProject(fakeApi(), project, OVERVIEW)
    expect(await screen.findByText('8 / 30 rangs · 2e fois sur 2')).toBeInTheDocument()
  })

  it('page du projet : « Tricoter » ouvre le mode tricoter sur l’étape en cours', async () => {
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    expect(await screen.findByRole('link', { name: 'Tricoter' })).toHaveAttribute('href', '/tricot/p1/tricoter')
  })

  it('ouvre le PDF d’origine et supprime le projet', async () => {
    const user = userEvent.setup()
    const tab = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    const { api } = renderProject(fakeApi(), PROJECT, OVERVIEW)
    await user.click(await screen.findByRole('button', { name: 'Voir le PDF' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(api.knitting.pdfUrl).toHaveBeenCalledWith('u-lucile/abc.pdf')
    await vi.waitFor(() => expect(tab.location.href).toBe('https://cdn.test/u-lucile/abc.pdf'))
    open.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Actions sur le projet' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer le projet' }))
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', pdfPath: 'u-lucile/abc.pdf' }))
    expect(await screen.findByText('Liste des projets')).toBeInTheDocument()
    // Copie hors ligne et avancée en attente oubliées
    expect(localStorage.getItem('life:tricot:projet:p1')).toBeNull()
  })

  it('signale un projet introuvable ou illisible', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), null)
    expect(await screen.findByText('Projet introuvable')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Retour aux projets' }))
    expect(await screen.findByText('Liste des projets')).toBeInTheDocument()
  })

  it('propose de réessayer le chargement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getProject.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
  })
})

describe('laine et échantillon du projet', () => {
  /** Page du projet, carte « Laine et échantillon » ouverte. */
  async function renderProject(api = fakeApi(), project: KnitProject = PROJECT) {
    api.knitting.getProject.mockResolvedValue(structuredClone(project))
    const result = renderWithApp(<KnittingProjectPage />, { api, route: OVERVIEW, path: '/tricot/:id' })
    await openFold('Laine et échantillon')
    return result
  }

  it('ajoute une laine lue sur la photo de l’étiquette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockResolvedValue({ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', length_m: 125, needle_mm: 3.5 })
    await renderProject(api)
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    expect(within(panel).getByText(/Aucune laine notée/)).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '6')
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'etiquette.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Marque')).toHaveValue('Phildar'))
    expect(within(dialog).getByLabelText(/Aiguilles/)).toHaveValue('3,5')
    // Le nombre de pelotes saisi reste.
    expect(within(dialog).getByLabelText(/Nombre de pelotes/)).toHaveValue('6')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', {
        yarns: [{ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', length_m: 125, needle_mm: 3.5, skeins: 6 }],
        patternGauge: { stitches: null, rows: null },
        myGauge: { stitches: null, rows: null },
      }),
    )
  })

  it('signale une étiquette illisible et une saisie invalide', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockRejectedValue(new AppError('Pas d’étiquette de laine sur cette photo.'))
    await renderProject(api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'chat.jpg', { type: 'image/jpeg' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pas d’étiquette de laine sur cette photo.')
    await user.type(within(dialog).getByLabelText(/Poids/), '12,5')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Poids : un nombre entier de grammes')
    expect(api.knitting.saveProjectInfo).not.toHaveBeenCalled()
  })

  it('montre, modifie et retire les laines', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const yarn = { ...EMPTY_YARN, brand: 'DROPS', name: 'Alpaca', length_m: 167, skeins: 4 }
    await renderProject(api, { ...PROJECT, yarns: [yarn] })
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    expect(within(panel).getByText('DROPS Alpaca')).toBeInTheDocument()
    expect(within(panel).getByText('Environ 668 m de laine en tout.')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Modifier DROPS Alpaca' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifier la laine' })
    await user.clear(within(dialog).getByLabelText('Coloris'))
    await user.type(within(dialog).getByLabelText('Coloris'), '0100 Écru')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [{ ...yarn, color: '0100 Écru' }] })))
    await user.click(within(panel).getByRole('button', { name: 'Retirer DROPS Alpaca' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [] })))
  })

  it('retirer une laine retire sa pesée et garde les autres sur leur laine', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const alpaca = { ...EMPTY_YARN, brand: 'DROPS', name: 'Alpaca' }
    const merino = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino' }
    const kid = { ...EMPTY_YARN, brand: 'DROPS', name: 'Kid-Silk' }
    const checks = [
      { yarn: 0, grams: 50, rowsDone: 10, at: '' },
      { yarn: 1, grams: 40, rowsDone: 10, at: '' },
      { yarn: 2, grams: 20, rowsDone: 10, at: '' },
    ]
    await renderProject(api, { ...PROJECT, yarns: [alpaca, merino, kid], yarnChecks: checks })
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    await user.click(within(panel).getByRole('button', { name: 'Retirer DROPS Merino' }))
    await waitFor(() =>
      expect(api.knitting.saveYarnChecks).toHaveBeenCalledWith('p1', [
        { yarn: 0, grams: 50, rowsDone: 10, at: '' },
        { yarn: 1, grams: 20, rowsDone: 10, at: '' },
      ]),
    )
    // La dernière laine retirée sans pesée derrière elle : rien à décaler
    api.knitting.saveYarnChecks.mockClear()
    await user.click(within(panel).getByRole('button', { name: 'Retirer DROPS Kid-Silk' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [alpaca, merino] })))
    expect(api.knitting.saveYarnChecks).toHaveBeenCalledWith('p1', [{ yarn: 0, grams: 50, rowsDone: 10, at: '' }, { yarn: 1, grams: 40, rowsDone: 10, at: '' }])
  })

  it('recalcule mailles et rangs avec l’échantillon de la tricoteuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    await renderProject(api, { ...PROJECT, patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 30 } })
    expect(screen.getByLabelText('Mailles du patron')).toHaveValue('22')
    // Étape en cours : 30 rangs, 56 mailles à la fin → 61 mailles à 24 m./10 cm, rangs inchangés.
    await user.click(screen.getByRole('link', { name: /Emmanchures/ }))
    expect(await screen.findByText(/56 mailles à la fin \(≈ 61 avec ton échantillon\)/)).toBeInTheDocument()
    expect(screen.queryByText(/rangs avec ton échantillon/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Pull Bergamote' }))
    await openFold('Laine et échantillon')

    const form = screen.getByRole('form', { name: 'Échantillon' })
    const save = within(form).getByRole('button', { name: 'Enregistrer l’échantillon' })
    expect(save).toBeDisabled()
    await user.clear(within(form).getByLabelText('Tes rangs'))
    await user.type(within(form).getByLabelText('Tes rangs'), '0')
    await user.click(save)
    expect(within(form).getByRole('alert')).toHaveTextContent('un nombre entre 1 et 100')
    await user.clear(within(form).getByLabelText('Tes rangs'))
    await user.type(within(form).getByLabelText('Tes rangs'), '27')
    api.knitting.getProject.mockResolvedValue({ ...structuredClone(PROJECT), patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 27 } })
    await user.click(save)
    expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', { yarns: [], patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 27 } })
    await waitFor(() => expect(api.knitting.getProject).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('link', { name: /Emmanchures/ }))
    expect(await screen.findByText('8 rangs faits sur 30 (≈ 27 rangs avec ton échantillon)')).toBeInTheDocument()
  })
})

describe('patrons à faire plus tard', () => {
  const QUEUED: QueuedPattern = {
    id: 'q1',
    title: 'Gilet Rosée',
    pdfPath: 'u-lucile/gilet.pdf',
    url: null,
    size: 'M',
    yarnIdea: 'Restes de mérinos',
    notes: 'Pour l’hiver',
    priority: 1,
    createdAt: '2026-11-01T10:00:00Z',
    metersNeeded: null,
    needleMm: null,
  }

  it('liste les patrons en attente, les ouvre et les retire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listQueue.mockResolvedValue([{ ...QUEUED, id: 'q2', title: 'Bonnet', pdfPath: null, url: 'https://patrons.exemple/bonnet', priority: 3, size: null, yarnIdea: '', notes: '' }, QUEUED])
    renderWithApp(<KnittingPage />, { api })
    // Repliée par défaut, avec le nombre de patrons
    const toggle = await screen.findByRole('button', { name: 'À faire plus tard' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(await screen.findByText('2 patrons')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Patrons à faire plus tard' })).not.toBeInTheDocument()
    await user.click(toggle)
    const list = await screen.findByRole('list', { name: 'Patrons à faire plus tard' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((i) => i.querySelector('p')?.textContent)).toEqual(['Gilet Rosée', 'Bonnet'])
    expect(items[0]).toHaveTextContent('Bientôt · taille M · Restes de mérinos')
    expect(within(items[0]!).getByRole('link', { name: 'Commencer Gilet Rosée' })).toHaveAttribute('href', '/tricot/nouveau?patron=q1')
    expect(within(items[1]!).getByRole('link', { name: 'Lien' })).toHaveAttribute('href', 'https://patrons.exemple/bonnet')
    expect(within(items[1]!).queryByRole('link', { name: /Commencer/ })).not.toBeInTheDocument()

    const tab = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    await user.click(within(items[0]!).getByRole('button', { name: 'PDF' }))
    await waitFor(() => expect(tab.location.href).toBe('https://cdn.test/u-lucile/gilet.pdf'))
    open.mockRestore()

    await user.click(within(items[0]!).getByRole('button', { name: 'Retirer Gilet Rosée' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(api.knitting.deleteQueued).toHaveBeenCalledWith(QUEUED))
    expect(api.knitting.listQueue).toHaveBeenCalledTimes(2)
  })

  it('invite à mettre un patron de côté depuis « Nouveau patron »', async () => {
    renderWithApp(<KnittingPage />)
    expect(await screen.findByText(/Aucun patron en attente : choisis « Mettre de côté »/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Nouveau patron' })[0]).toHaveAttribute('href', '/tricot/nouveau')
  })

  it('met un patron de côté, avec son PDF', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot" element={<p>Tricot</p>} /> })
    // PDF et taille choisis d'abord pour « Commencer maintenant » : repris en changeant d'avis
    const pdf = new File(['%PDF'], 'Gilet Rosée.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf)
    await user.type(screen.getByLabelText('Taille choisie'), 'M')
    expect(screen.getByRole('radio', { name: 'Commencer maintenant' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Mettre de côté' }))
    expect(screen.getByRole('radio', { name: 'Mettre de côté' })).toBeChecked()
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Gilet Rosée')
    expect(screen.getByLabelText('Taille visée')).toHaveValue('M')
    await user.clear(screen.getByLabelText('Nom du patron'))
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Donne un nom au patron.')
    await user.type(screen.getByLabelText('Nom du patron'), 'Gilet Rosée')
    await user.selectOptions(screen.getByLabelText('Quand'), 'Bientôt')
    await user.type(screen.getByLabelText('Laine envisagée'), 'Mérinos')
    await user.type(screen.getByLabelText('Métrage nécessaire (m)'), '600')
    await user.type(screen.getByLabelText('Aiguilles (mm)'), '4')
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(api.knitting.addToQueue).toHaveBeenCalledWith({ title: 'Gilet Rosée', pdf, url: null, size: 'M', yarnIdea: 'Mérinos', notes: '', priority: 1, metersNeeded: 600, needleMm: 4 })
    expect(await screen.findByText('Tricot')).toBeInTheDocument()
  }, 30_000)

  it('signale un enregistrement impossible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.addToQueue.mockRejectedValue(new AppError('Impossible d’envoyer le PDF.'))
    // Ancienne adresse et `?plus-tard` : « Mettre de côté » d'emblée
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?plus-tard', path: '/tricot/nouveau' })
    expect(screen.getByRole('radio', { name: 'Mettre de côté' })).toBeChecked()
    await user.type(screen.getByLabelText('Nom du patron'), 'Bonnet')
    await user.type(screen.getByLabelText('Ou lien vers le patron'), 'https://patrons.exemple/bonnet')
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’envoyer le PDF.')
  })

  it('commence un patron mis de côté : PDF et taille repris, puis projet créé', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getQueued.mockResolvedValue(QUEUED)
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    renderWithApp(<KnittingImportPage />, {
      api,
      route: '/tricot/nouveau?patron=q1',
      path: '/tricot/nouveau',
      extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} />,
    })
    expect(await screen.findByRole('heading', { name: 'Commencer « Gilet Rosée »' })).toBeInTheDocument()
    expect(api.knitting.downloadPdf).toHaveBeenCalledWith('u-lucile/gilet.pdf', 'Gilet Rosée')
    expect(screen.getByLabelText('Taille choisie')).toHaveValue('M')
    // PDF repris : rien à choisir, ni « Mettre de côté »
    expect(await screen.findByText('Gilet Rosée.pdf')).toBeInTheDocument()
    expect(screen.queryByLabelText('Patron (PDF)')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByText(/échantillon 22 m\. × 30 rangs pour 10 cm/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ queued: QUEUED, gauge: { stitches: 22, rows: 30 } })))
  })

  it('lit un patron sans taille : la première taille du patron est prise', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeIndex: 0 })
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    const file = new File(['%PDF-1.4'], 'p.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), file)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(file, '')
    expect(await screen.findByText(/^Taille S · 3 étapes/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ size: 'S', sizeIndex: 0 }))
  })

  it('patron mis de côté : un autre PDF peut le remplacer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getQueued.mockResolvedValue(QUEUED)
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau' })
    await user.click(await screen.findByRole('button', { name: 'Choisir un autre PDF' }))
    const other = new File(['%PDF-1.4'], 'autre.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), other)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(other, 'M')
  })

  it('patron mis de côté introuvable', async () => {
    const api = fakeApi()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=perdu', path: '/tricot/nouveau' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Patron introuvable, ou sans PDF.')
  })
})

describe('stock de laine', () => {
  const MERINO = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }
  const STASH: StashItem[] = [{ id: 'st1', yarn: MERINO, notes: '', createdAt: '2026-11-01' }]
  const pattern = (id: string, metersNeeded: number | null, needleMm: number | null, pdfPath: string | null = null): QueuedPattern => ({
    id,
    title: id,
    pdfPath,
    url: pdfPath ? null : 'https://patrons.exemple/' + id,
    size: null,
    yarnIdea: '',
    notes: '',
    priority: 2,
    createdAt: '2026-11-01',
    metersNeeded,
    needleMm,
  })

  it('ajoute, modifie et retire une laine du stock', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingPage />, { api })
    const section = await screen.findByRole('region', { name: 'Stock de laine' })
    // Stock vide : le message se voit même replié
    expect(await within(section).findByText(/Aucune laine en stock/)).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Ajouter au stock' }))
    let dialog = await screen.findByRole('dialog', { name: 'Ajouter au stock' })
    await user.type(within(dialog).getByLabelText('Marque'), 'DROPS')
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '8')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveStashItem).toHaveBeenCalledWith({ id: null, yarn: { ...EMPTY_YARN, brand: 'DROPS', skeins: 8 }, notes: '' }))
    expect(api.knitting.listStash).toHaveBeenCalledTimes(2)

    api.knitting.listStash.mockResolvedValue(STASH)
    await user.click(within(section).getByRole('button', { name: 'Ajouter au stock' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }))
    // Recharge avec la laine
    api.knitting.saveStashItem.mockClear()
    renderWithApp(<KnittingPage />, { api })
    // Replié par défaut, avec le nombre de laines
    expect((await screen.findAllByText('1 laine'))[0]).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Stock de laine' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Stock de laine' }).at(-1)!)
    const list = await screen.findByRole('list', { name: 'Stock de laine' })
    await user.click(within(list).getByRole('button', { name: 'Modifier DROPS Merino' }))
    dialog = await screen.findByRole('dialog', { name: 'Modifier la laine' })
    await user.clear(within(dialog).getByLabelText(/Nombre de pelotes/))
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveStashItem).toHaveBeenCalledWith({ id: 'st1', yarn: { ...MERINO, skeins: 5 }, notes: '' }))

    await user.click(within(list).getByRole('button', { name: 'Retirer DROPS Merino du stock' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Retirer' }))
    await waitFor(() => expect(api.knitting.deleteStashItem).toHaveBeenCalledWith('st1'))
  })

  it('cherche d’abord dans les patrons mis de côté, puis des idées avec l’IA', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    // 840 m, aiguilles 4 mm
    api.knitting.listQueue.mockResolvedValue([pattern('Gilet', 600, 4, 'u-lucile/gilet.pdf'), pattern('Pull', 1200, 4), pattern('Bonnet', null, null)])
    api.knitting.yarnIdeas.mockResolvedValue([
      {
        title: 'Snood torsadé',
        why: 'Mérinos doux.',
        meters: 300,
        needleMm: 4.5,
        search: 'cabled cowl',
        patterns: [{ title: 'Cabled Cowl par Jane', url: 'https://www.ravelry.com/patterns/library/cabled-cowl' }],
        weight: 'worsted',
      },
    ])
    renderWithApp(<KnittingPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Stock de laine' }))
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quel patron pour cette laine ?' })
    expect(dialog).toHaveTextContent('DROPS Merino · 840 m en stock')
    const fits = within(dialog).getByRole('list', { name: 'Patrons qui conviennent' })
    expect(within(fits).getAllByRole('listitem')).toHaveLength(1)
    expect(fits).toHaveTextContent('600 m nécessaires, 840 m en stock')
    expect(within(fits).getByRole('link', { name: 'Commencer Gilet' })).toHaveAttribute('href', '/tricot/nouveau?patron=Gilet')
    expect(dialog).toHaveTextContent('À vérifier (métrage ou aiguilles non notés) : Bonnet.')

    await user.click(within(dialog).getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(api.knitting.yarnIdeas).toHaveBeenCalledWith(MERINO)
    const ideas = await within(dialog).findByRole('list', { name: 'Idées de modèles' })
    expect(ideas).toHaveTextContent('Snood torsadé')
    expect(ideas).toHaveTextContent('Mérinos doux. · ≈ 300 m · aiguilles 4,5 mm')
    // Vrai patron trouvé sur internet, puis recherche Ravelry filtrée (tricot, grosseur, métrage en yards, aiguilles à 0,5 mm près)
    expect(within(ideas).getByRole('link', { name: 'Cabled Cowl par Jane · ravelry.com' })).toHaveAttribute('href', 'https://www.ravelry.com/patterns/library/cabled-cowl')
    expect(within(ideas).getByRole('link', { name: 'Plus de patrons sur Ravelry' })).toHaveAttribute(
      'href',
      'https://www.ravelry.com/patterns/search#craft=knitting&weight=worsted&yardage=0%7C918&needles=3.5mm%7C3.75mm%7C4.0mm%7C4.5mm&query=cabled%20cowl',
    )
  })

  it('aucun patron ne convient : les idées sont mises en avant ; erreur lisible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.yarnIdeas.mockRejectedValue(new AppError('La recherche d’idées a échoué.'))
    renderWithApp(<KnittingPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Stock de laine' }))
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Aucun patron mis de côté.')
    await user.click(within(dialog).getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La recherche d’idées a échoué.')
  })

  it('prend une laine du stock pour un projet', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.getProject.mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: OVERVIEW, path: '/tricot/:id' })
    await openFold('Laine et échantillon')
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.selectOptions(await within(dialog).findByLabelText('Prendre dans mon stock'), 'st1')
    expect(within(dialog).getByLabelText('Marque')).toHaveValue('DROPS')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', expect.objectContaining({ yarns: [MERINO] })))
  })
})

describe('texte du patron et taille mise en valeur', () => {
  const TEXT = 'Monter 60 (64-68) m. et tricoter 6 (6-7) cm.'

  it('à l’import : texte tel quel, nombres de la taille choisie mis en valeur, taille modifiable', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const steps = [{ ...PATTERN.steps[0]!, instructions: TEXT }]
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, steps, sizeIndex: 1 })
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    await user.upload(screen.getByLabelText('Patron (PDF)'), new File(['%PDF-1.4'], 'p.pdf', { type: 'application/pdf' }))
    await user.type(screen.getByLabelText('Taille choisie'), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))

    const list = await screen.findByRole('list', { name: 'Étapes lues' })
    expect(within(list).getByText(/^Monter/)).toHaveTextContent(TEXT)
    expect(within(list).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])
    await user.selectOptions(screen.getByLabelText('Nombres de la taille'), 'L')
    expect(within(list).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['68', '7'])

    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ sizes: ['S', 'M', 'L'], sizeIndex: 2 }))
  })

  it('dans le projet : change la taille mise en valeur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = TEXT
    api.knitting.getProject.mockResolvedValue(project)
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    const article = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    expect(within(article).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])

    api.knitting.getProject.mockResolvedValue({ ...project, sizeIndex: 0 })
    await user.selectOptions(within(article).getByLabelText('Nombres de la taille'), 'S')
    expect(api.knitting.setSizeIndex).toHaveBeenCalledWith('p1', 0)
    await waitFor(() => expect(within(article).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['60', '6']))

    // Aucune : texte sans mise en valeur ; échec : message
    api.knitting.setSizeIndex.mockRejectedValueOnce(new AppError('Impossible de changer la taille mise en valeur.'))
    await user.selectOptions(within(article).getByLabelText('Nombres de la taille'), 'Aucune')
    expect(await screen.findByText('Impossible de changer la taille mise en valeur.')).toBeInTheDocument()
  })

  it('corrige le surlignage nombre par nombre, pour la taille mise en valeur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = TEXT
    renderWithApp(<KnittingProjectPage />, { api: (api.knitting.getProject.mockResolvedValue(project), api), route: STEP, path: '/tricot/:id' })
    const article = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    // Nombres surlignés (boutons enfoncés du texte en mode correction)
    const marks = () => within(article).getAllByRole('button', { pressed: true }).map((m) => m.textContent).filter((t) => /^\d/.test(t ?? ''))

    await user.click(within(article).getByRole('button', { name: 'Corriger le surlignage' }))
    expect(within(article).getByText('Touche un nombre pour le surligner ou retirer son surlignage.')).toBeInTheDocument()
    // « 68 » surligné en plus, « 64 » retiré
    await user.click(within(article).getByRole('button', { name: '68' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: { '1': { '14': true } } })
    await user.click(within(article).getByRole('button', { name: '64, surligné' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: { '1': { '14': true, '11': false } } })
    expect(marks()).toEqual(['68', '6'])

    await user.click(within(article).getByRole('button', { name: 'Annuler mes corrections' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: {} })
    expect(marks()).toEqual(['64', '6'])
    await user.click(within(article).getByRole('button', { name: 'Terminé' }))
    expect(within(article).queryByRole('button', { name: '64, surligné' })).not.toBeInTheDocument()
    expect(within(article).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])
  })
})

