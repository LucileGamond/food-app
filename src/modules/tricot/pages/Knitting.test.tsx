import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { AppError } from '@/api'
import type { KnitProject, KnitStep, ReadPattern, StepSection } from '../lib/pattern'
import { EMPTY_YARN, type StashItem } from '../lib/yarn'
import type { KnitPattern } from '../lib/library'
import { KnittingImportPage } from './KnittingImportPage'
import { KnittingPage } from './KnittingPage'
import { KnittingProjectPage } from './KnittingProjectPage'

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
  gauges: [],
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
  it('liste les projets avec l’étape en cours, et tricote d’un toucher', async () => {
    const api = fakeApi()
    api.knitting.listProjects.mockResolvedValue([
      { id: 'p1', title: 'Pull Bergamote', size: 'M', updatedAt: '', stepsDone: 1, stepsTotal: 3, current: { number: 2, title: 'Manches', rowCount: 12, totalRows: 40, times: 2, pass: 1 } },
      { id: 'p2', title: 'Bonnet', size: '4 ans', updatedAt: '', stepsDone: 2, stepsTotal: 2, current: null },
      { id: 'p3', title: 'Châle', size: 'Unique', updatedAt: '', stepsDone: 0, stepsTotal: 1, current: { number: 1, title: 'Bordure', rowCount: 1, totalRows: null, times: 1, pass: 1 } },
    ])
    renderWithApp(<KnittingPage />, { api })
    const list = await screen.findByRole('list', { name: 'Projets de tricot' })
    expect(within(list).getByRole('link', { name: /^Pull Bergamote/ })).toHaveAttribute('href', '/tricot/p1')
    expect(within(list).getByText('Taille M · étape 2 sur 3 : Manches')).toBeInTheDocument()
    expect(within(list).getByText('12 / 40 rangs · 1re fois sur 2')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'Tricoter « Pull Bergamote »' })).toHaveAttribute('href', '/tricot/p1/tricoter')
    // Projet fini : pas de bouton Tricoter
    expect(within(list).getByText('Taille 4 ans · terminé')).toBeInTheDocument()
    expect(within(list).queryByRole('link', { name: 'Tricoter « Bonnet »' })).not.toBeInTheDocument()
    // Rangs de l'étape inconnus (ou patron adapté suivi) : seulement les rangs faits
    expect(within(list).getByText('1 rang')).toBeInTheDocument()
  })

  it('range la bibliothèque juste sous les projets, puis le stock et les mesures', async () => {
    renderWithApp(<KnittingPage />, { api: fakeApi() })
    const library = await screen.findByRole('link', { name: /Bibliothèque de patrons/ })
    expect(library).toHaveAttribute('href', '/tricot/patrons')
    const headings = await screen.findAllByRole('heading', { level: 2 })
    const stock = headings.find((h) => h.textContent === 'Stock de laine')!
    expect(library.compareDocumentPosition(stock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const titles = headings.map((h) => h.textContent)
    expect(titles.indexOf('Stock de laine')).toBeLessThan(titles.indexOf('Fiches de mesures'))
  })

  it('invite à charger un premier patron, et propose de réessayer en cas d’erreur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listProjects.mockRejectedValueOnce(new Error('réseau'))
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucun projet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Nouveau projet' })[0]).toHaveAttribute('href', '/tricot/nouveau')
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
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), ' M ')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(file, 'M')

    const steps = await screen.findByRole('list', { name: 'Étapes lues' })
    expect(within(steps).getAllByRole('listitem').filter((li) => li.parentElement === steps)).toHaveLength(3)
    expect(within(steps).getByText('30 rangs · 56 mailles à la fin')).toBeInTheDocument()
    expect(within(steps).getByText('4 rangs : jersey')).toBeInTheDocument()
    expect(within(steps).getByText('1 diminution de chaque côté — tous les 6 rangs (4 fois)')).toBeInTheDocument()
    // Plusieurs tailles : la taille se lit dans le choix, pas en double dans l'en-tête
    expect(screen.getByText('3 étapes · échantillon 22 m. × 30 rangs pour 10 cm')).toBeInTheDocument()
    expect(screen.getByLabelText('Taille')).toHaveDisplayValue('M')
    // Diagrammes repérés : sous leur étape, ou à part
    expect(within(steps).getAllByRole('listitem')[1]).toHaveTextContent('Diagramme : Torsade, page 4')
    expect(screen.getByText(/Autres diagrammes repérés/)).toHaveTextContent('Autres diagrammes repérés : Diagramme, page 6')

    await user.clear(screen.getByLabelText('Nom du projet'))
    await user.type(screen.getByLabelText('Nom du projet'), 'Pull de Noël')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith({ title: 'Pull de Noël', size: 'M', pdf: file, steps: PATTERN.steps, gauge: { stitches: 22, rows: 30 }, pattern: null, chartHints: charts, sizes: ['S', 'M', 'L'], sizeIndex: 1, abbreviations: [], needles: [], reading: { ...PATTERN, charts } })
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
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByText('90 rangs · à tricoter 2 fois · 50 mailles à la fin')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ steps }))
  })

  it('lecture arrêtée en route : les parties pas lues sont signalées, et on relit le patron', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValueOnce({ ...PATTERN, missingParts: ['Manches', 'Col'] }).mockResolvedValueOnce({ ...PATTERN, missingParts: [] })
    renderImport(api)
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('La lecture s’est arrêtée en route : parties pas lues « Manches », « Col ».')
    await user.click(within(alert).getByRole('button', { name: 'Relire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledTimes(2)
    expect(api.knitting.readPattern).toHaveBeenLastCalledWith(expect.any(File), 'M')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('affiche le message de la lecture (taille introuvable) et permet de recommencer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const { AppError } = await import('@/api')
    api.knitting.readPattern.mockRejectedValueOnce(new AppError('Taille « XXL » introuvable. Tailles du patron : S, M, L.')).mockResolvedValueOnce(PATTERN)
    renderImport(api)
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), 'XXL')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tailles du patron : S, M, L.')

    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    // Abandonner jette une lecture longue : ça se confirme
    await user.click(await screen.findByRole('button', { name: 'Abandonner cette lecture' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Abandonner' }))
    expect(await screen.findByRole('button', { name: 'Lire le patron' })).toBeInTheDocument()
  })

  it('la fin de la lecture est annoncée et prend le focus', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    renderImport(api)
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf())
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    // Après une attente qui peut durer deux minutes : un message lu, et le focus sur le résultat
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(`Patron lu : ${PATTERN.steps.length} étapes. Vérifie-les, puis enregistre le projet.`)
    expect(document.activeElement).toBe(status.parentElement)
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
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), 'M')
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
/** Onglets du projet : 1 Démarrer (matériel), 2 Préparer (étapes). */
const START = '/tricot/p1?onglet=demarrer'
const PREPARE = '/tricot/p1?onglet=preparer'
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

  it('retour au-dessus du titre : « Tricot » depuis le projet, le nom du projet depuis une étape (C1)', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), PROJECT, STEP)
    const toProject = await screen.findByRole('link', { name: PROJECT.title })
    expect(toProject).toHaveAttribute('href', '/tricot/p1?onglet=preparer')
    await user.click(toProject)
    expect(await screen.findByRole('link', { name: 'Tricot' })).toHaveAttribute('href', '/tricot')
    expect(screen.queryByRole('link', { name: 'Projets' })).not.toBeInTheDocument()
  })

  it('projet issu de la bibliothèque : un lien vers sa fiche patron ; sans patron, pas de lien (E4)', async () => {
    renderProject(fakeApi(), { ...PROJECT, patternId: 'g1' }, OVERVIEW)
    expect(await screen.findByRole('link', { name: 'Fiche du patron' })).toHaveAttribute('href', '/tricot/patrons/g1')
    cleanup()
    renderProject(fakeApi(), { ...PROJECT, patternId: null }, OVERVIEW)
    await screen.findByRole('heading', { name: PROJECT.title })
    expect(screen.queryByRole('link', { name: 'Fiche du patron' })).not.toBeInTheDocument()
  })

  it('en bas de la préparation : les étapes voisines, par leur nom (E2)', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), PROJECT, `${STEP}=s2`)
    const nav = await screen.findByRole('navigation', { name: 'Étapes voisines' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Dos – côtes', 'Encolure'])
    await user.click(within(nav).getByRole('button', { name: 'Encolure' }))
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    // Dernière étape : seulement la précédente
    expect(within(screen.getByRole('navigation', { name: 'Étapes voisines' })).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Emmanchures'])
  })

  it('étape pas commencée : ses sous-étapes se déplacent dans Organiser, pas ici (E3)', async () => {
    const user = userEvent.setup()
    const sections: StepSection[] = [
      { kind: 'rows', rows: 4, every: null, times: null, text: 'côtes', pattern: null },
      { kind: 'rows', rows: 10, every: null, times: null, text: 'jersey', pattern: null },
    ]
    const project = { ...PROJECT, steps: PROJECT.steps.map((s) => (s.id === 's3' ? { ...s, sections } : s)) }
    renderProject(fakeApi(), project, `${STEP}=s3`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 10 rangs : jersey »' }))
    expect(await screen.findByRole('menuitem', { name: 'Déplacer…' })).toHaveAttribute('href', '/tricot/p1?onglet=preparer&vue=organiser')
    expect(screen.queryByRole('menuitem', { name: 'Monter' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toBeInTheDocument()
  })

  it('étape commencée : Organiser ne la touche plus, Monter et Descendre restent dans la préparation (E3)', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), PROJECT, `${STEP}=s2`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    expect(await screen.findByRole('menuitem', { name: 'Descendre' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Déplacer…' })).not.toBeInTheDocument()
  })

  it('projet en trois onglets : Démarrer (matériel), Préparer (étapes), Tricoter (étape en cours)', async () => {
    const user = userEvent.setup()
    // Projet commencé et étape en cours prête : il s'ouvre sur « Tricoter »
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    expect(await screen.findByRole('tab', { name: /3. Tricoter/, selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter' })).toHaveAttribute('href', '/tricot/p1/tricoter')
    // Pas d'interrupteur d'écran ni de compteur ici ; le suivi est replié.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    for (const title of ['Assez de laine pour finir ?', 'Notes et photos']) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false')
    }

    // Démarrer : le matériel, la laine ouverte d'office
    await user.click(screen.getByRole('tab', { name: /1. Démarrer/ }))
    expect(await screen.findByRole('region', { name: 'Laine et échantillon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Laine et échantillon' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Patron adapté à moi' })).toHaveAttribute('aria-expanded', 'false')

    // Préparer : les étapes, qui s'ouvrent une par une
    await user.click(screen.getByRole('tab', { name: /2. Préparer/ }))
    const nav = await screen.findByRole('navigation', { name: 'Étapes' })
    const links = within(within(nav).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['1Dos – côtes18 / 18 rangs(terminée)', '2Emmanchures8 / 30 rangsEn cours', '3Encolure'])
    expect(links[1]).toHaveAttribute('aria-current', 'step')
    expect(within(links[0]!).getByText('(terminée)')).toBeInTheDocument()
    await user.click(links[2]!)
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    // Le retour ramène à « Préparer »
    await user.click(screen.getByRole('link', { name: 'Pull Bergamote' }))
    expect(await screen.findByRole('navigation', { name: 'Étapes' })).toBeInTheDocument()
  })

  it('chaque onglet dit ce qu’il reste à faire, et le projet s’ouvre sur le premier qui demande quelque chose', async () => {
    const project = structuredClone(PROJECT)
    project.needles = []
    project.steps = project.steps.map((s) => ({ ...s, done: false, rowCount: 0 }))
    project.steps[0]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: null }]
    renderProject(fakeApi(), project, OVERVIEW)
    // Rien n'est tricoté et les aiguilles manquent : on commence par Démarrer
    expect(await screen.findByRole('tab', { name: /1. Démarrer/, selected: true })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'Avant de préparer les étapes' })).toHaveTextContent('Aiguilles à indiquer')
    expect(screen.getByRole('tab', { name: /1. Démarrer/ })).toHaveTextContent('à compléter')
    expect(screen.getByRole('tab', { name: /2. Préparer/ })).toHaveTextContent('1 à préparer')
    expect(screen.getByRole('tab', { name: /3. Tricoter/ })).toHaveTextContent('0 / 3')
  })

  it('prête à tricoter : indiquée sur l’étape ; sinon ce qui manque, et le bouton Tricoter bloqué', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 chose à régler, signalée en orange dans les sous-étapes ci-dessous.')
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Tricoter cette étape' })).not.toBeInTheDocument()

    // Réglée : prête, le bouton mène au mode tricoter
    api.knitting.getProject.mockResolvedValue({ ...project, steps: project.steps.map((s) => (s.id === 's2' ? { ...s, sections: [s.sections[0]!, { ...s.sections[1]!, rows: 15 }] } : s)) })
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 5 cm (à régler) : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    await user.type(within(form).getByLabelText('Nombre de rangs'), '15')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toHaveAttribute('href', '/tricot/p1/tricoter?etape=s2')
  })

  it('« À préparer » : le compte, et le bouton ouvre la sous-étape, qui est signalée', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' }]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    // La sous-étape qui manque de quelque chose est encadrée en ambre
    const items = within(screen.getByRole('region', { name: 'Sous-étapes' })).getAllByRole('listitem')
    expect(items[0]!.className).not.toContain('amber')
    expect(items[1]!.className).toContain('amber')
    // Le détail est dans la sous-étape, juste en dessous : ici, le compte seulement
    expect(alert).toHaveTextContent('1 chose à régler, signalée en orange dans les sous-étapes ci-dessous.')
    expect(alert).not.toHaveTextContent('nombre de rangs à régler.5 cm')
    // Le bouton ouvre le formulaire de la première sous-étape à régler
    await user.click(within(alert).getByRole('button', { name: /^Aller à la première/ }))
    const form = await screen.findByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Description (facultatif)')).toHaveValue('jersey')
  })

  it('aiguille de la sous-étape : lisible sur la ligne, modifiable d’un toucher', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    // La 2e hérite de l'aiguille de la 1re
    const pills = await screen.findAllByRole('button', { name: /^Aiguille/ })
    expect(pills.map((b) => b.textContent)).toEqual(['Aiguille 3 mm', 'Aiguille 3 mm'])
    await user.click(pills[1]!)
    const form = await screen.findByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('Comme avant (3 mm)')
  })

  it('aiguille pas encore choisie : signalée sur la sous-étape ; aucune aiguille au projet : rien', async () => {
    const project = structuredClone(PROJECT)
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    expect((await screen.findAllByRole('button', { name: 'Aiguille à choisir' })).length).toBe(2)
    cleanup()
    renderProject(fakeApi(), project, `${STEP}=s2`)
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.queryByRole('button', { name: /Aiguille/ })).not.toBeInTheDocument()
  })

  it('liste des étapes : « À préparer » sur celles qui ne sont pas prêtes', async () => {
    const project = structuredClone(PROJECT)
    project.steps[2]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: '', pattern: '3 cm' }]
    renderProject(fakeApi(), project, PREPARE)
    const nav = await screen.findByRole('navigation', { name: 'Étapes' })
    const links = within(within(nav).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent?.includes('À préparer'))).toEqual([false, false, true])
  })

  it('aiguilles du patron : indiquées dans « Démarrer »', async () => {
    const user = userEvent.setup()
    const { api } = renderProject(fakeApi(), PROJECT, START)
    expect(await screen.findByText('aucune : indique-les pour que chaque sous-étape choisisse la sienne')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier les aiguilles du patron' }))
    const form = screen.getByRole('form', { name: 'Aiguilles du patron' })
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), 'trois')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Des tailles en mm')
    await user.clear(within(form).getByLabelText('Aiguilles du patron (mm)'))
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), '3,5 ; 3')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveNeedles).toHaveBeenCalledWith('p1', [3, 3.5])
  })

  it('aiguilles du patron : un enregistrement qui rate le dit, au lieu de ne rien faire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.saveNeedles.mockRejectedValueOnce(new Error('réseau'))
    renderProject(api, PROJECT, START)
    await user.click(await screen.findByRole('button', { name: 'Modifier les aiguilles du patron' }))
    const form = screen.getByRole('form', { name: 'Aiguilles du patron' })
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), '3 ; 3,5')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Les aiguilles n’ont pas pu être enregistrées. Réessaie.')
    // Le formulaire reste ouvert avec la saisie
    expect(within(form).getByLabelText('Aiguilles du patron (mm)')).toHaveValue('3 ; 3,5')
  })

  it('aiguille de chaque sous-étape : à choisir avec plusieurs aiguilles, héritée de la précédente', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5] }
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    // La préparation compte ; le détail est sur chaque sous-étape, juste en dessous
    expect(alert).toHaveTextContent('2 choses à régler, signalées en orange dans les sous-étapes ci-dessous.')
    expect(within(alert).getByRole('button')).toHaveAccessibleName('Aller à la première: Sous-étape 1 (4 rangs : jersey) : aiguille à choisir.')
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('À choisir')
    await user.selectOptions(within(form).getByLabelText('Aiguille'), '3 mm')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    const sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections })
  })

  it('aiguille héritée : la 2e sous-étape prend celle de la 1re, l’étape est prête', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ ...project.steps[1]!.sections[0]!, needle: 3 }, project.steps[1]!.sections[1]!]
    renderProject(fakeApi(), { ...project, needles: [3, 3.5] }, `${STEP}=s2`)
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
  })

  it('texte par sous-étape : chaque sous-étape montre son paragraphe, le texte complet est replié', async () => {
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = 'Tricoter 4 rangs.\n\nDiminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.'
    project.steps[1]!.sections = [
      { ...project.steps[1]!.sections[0]!, source: 'Tricoter 4 rangs.' },
      { ...project.steps[1]!.sections[1]!, source: 'Diminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.' },
    ]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    const list = (await screen.findByRole('region', { name: 'Sous-étapes' })).querySelector('ol')!
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Tricoter 4 rangs.')
    expect(items[1]).toHaveTextContent('Diminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.')
    // Nombres de la taille M surlignés dans le paragraphe
    expect(within(items[1]!).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['4'])
    expect(screen.getByRole('button', { name: 'Texte complet de l’étape' })).toBeInTheDocument()
  })

  it('diagramme montré dans la sous-étape où il commence', async () => {
    const chart = { id: 'c1', stepId: 's2', title: 'Torsade', gridTop: 0, gridBottom: 1, rows: 4, startRow: 5, endRow: 28, repeats: true, flat: false, oddOnly: false, imagePath: 'c1.png', imageUrl: null }
    renderProject(fakeApi(), { ...PROJECT, charts: [chart] }, `${STEP}=s2`)
    const list = (await screen.findByRole('region', { name: 'Sous-étapes' })).querySelector('ol')!
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).not.toHaveTextContent('Diagramme')
    expect(items[1]).toHaveTextContent('Diagramme « Torsade » : rangs 5 à 28')
  })

  it('échantillon par aiguille : chaque sous-étape convertie avec celui de son aiguille, vérifiée une fois par aiguille', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.needles = [3, 3.5]
    project.gauges = [{ needle: 3, stitches: null, rows: 40, checked: false }]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: '5 cm', needle: 3 },
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '10 cm', needle: 3.5 },
    ]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // Aiguille 3 : son échantillon (40 rangs) ; 3,5 : celui du patron (30 rangs)
    expect(within(sections).getByText('20 rangs (≈ 5 cm) : côtes')).toBeInTheDocument()
    expect(within(sections).getByText('30 rangs (≈ 10 cm) : jersey')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    await user.click(within(sections).getByRole('button', { name: 'Valider pour l’aiguille 3,5 mm' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [
      { needle: 3, stitches: null, rows: 40, checked: false },
      { needle: 3.5, stitches: null, rows: null, checked: true },
    ])
  })

  it('aiguille hors patron : l’échantillon la fait proposer aux sous-étapes', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.needles = [3, 3.5]
    // Elle tricote trop serré : son échantillon est sur une 4,5 mm, que le patron ne conseille pas
    project.gauges = [{ needle: 4.5, stitches: 20, rows: 26, checked: false }]
    project.steps[1]!.sections = [{ kind: 'rows', rows: 10, every: null, times: null, text: 'jersey', pattern: null, needle: 3 }]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 10 rangs : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(Array.from((within(form).getByLabelText('Aiguille') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['À choisir', '3 mm', '3,5 mm', '4,5 mm'])
  })

  it('aiguilles vérifiées : plus rien à valider, l’étape est prête', async () => {
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.needles = [3, 3.5]
    project.gauges = [
      { needle: 3, stitches: null, rows: 40, checked: true },
      { needle: 3.5, stitches: null, rows: null, checked: true },
    ]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: '5 cm', needle: 3 },
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '10 cm', needle: 3.5 },
    ]
    // 20 + 30 rangs convertis : le total de l'étape suit, sinon les sous-étapes la dépassent
    project.steps[1]!.totalRows = 50
    renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
    expect(screen.getByText(/Vérifié pour l’aiguille 3 mm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Valider/ })).not.toBeInTheDocument()
  })

  it('sous-étapes plus longues que l’étape : signalé dans « À préparer », avec le total à reprendre', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    // L'étape annonce 30 rangs, les sous-étapes vont jusqu'au rang 40
    project.steps[1]!.sections = [{ kind: 'rows', rows: 40, every: null, times: null, text: 'jersey', pattern: null }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByText('À préparer avant de tricoter')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('sous-étapes plus longues que l’étape (jusqu’au rang 40, pour 30 rangs annoncés)')
    // Signalé, mais l'étape se tricote quand même : c'est à elle de trancher
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    const sections = screen.getByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText(/L’étape annonce 30 rangs, mais les sous-étapes vont jusqu’au rang 40/)).toBeInTheDocument()

    await user.click(within(sections).getByRole('button', { name: 'Compter 40 rangs pour l’étape' }))
    expect(api.knitting.saveSections).toHaveBeenLastCalledWith([
      { id: 's2', sections: project.steps[1]!.sections, totalRows: 40, instructions: project.steps[1]!.instructions },
    ])
  })

  it('mes échantillons : une liste, un par aiguille ; changer les rangs le fait revérifier', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [{ needle: 3.5, stitches: 22, rows: 30, checked: true }] }
    const { api } = renderProject(fakeApi(), project, START)
    const list = await screen.findByRole('region', { name: 'Mes échantillons' })
    expect(within(list).getByText('Aiguille 3,5 mm')).toBeInTheDocument()
    expect(within(list).getByText('22 m. × 30 rangs pour 10 cm')).toBeInTheDocument()

    // Modifier ses rangs : la conversion de cette aiguille est à revérifier
    await user.click(within(list).getByRole('button', { name: 'Modifier l’échantillon : Aiguille 3,5 mm' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.clear(within(form).getByLabelText('Rangs'))
    await user.type(within(form).getByLabelText('Rangs'), '28')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: 3.5, stitches: 22, rows: 28, checked: false }])
  })

  it('mes échantillons : ajout pour une autre aiguille, et suppression', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [{ needle: 3.5, stitches: 22, rows: 30, checked: false }] }
    const { api } = renderProject(fakeApi(), project, START)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    // L'aiguille déjà notée n'est plus proposée
    expect(Array.from((within(form).getByLabelText('Aiguille') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Toutes aiguilles', '3 mm', 'Une autre aiguille…'])
    await user.selectOptions(within(form).getByLabelText('Aiguille'), '3 mm')
    await user.type(within(form).getByLabelText('Mailles'), '24')
    await user.type(within(form).getByLabelText('Rangs'), '32')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [
      { needle: 3, stitches: 24, rows: 32, checked: false },
      { needle: 3.5, stitches: 22, rows: 30, checked: false },
    ])

    await user.click(screen.getByRole('button', { name: 'Supprimer l’échantillon : Aiguille 3,5 mm' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [])
  })

  it('mes échantillons : une aiguille hors patron se tape, et les sous-étapes peuvent la choisir', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [] }
    const { api } = renderProject(fakeApi(), project, START)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    // Elle tricote trop serré : son échantillon est sur une aiguille que le patron ne conseille pas
    await user.selectOptions(within(form).getByLabelText('Aiguille'), 'Une autre aiguille…')
    await user.type(within(form).getByLabelText('Taille de l’aiguille (mm)'), '4,5')
    await user.type(within(form).getByLabelText('Mailles'), '20')
    await user.type(within(form).getByLabelText('Rangs'), '26')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: 4.5, stitches: 20, rows: 26, checked: false }])
  })

  it('mes échantillons : une taille d’aiguille illisible est refusée', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), { ...structuredClone(PROJECT), needles: [3] }, START)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.selectOptions(within(form).getByLabelText('Aiguille'), 'Une autre aiguille…')
    await user.type(within(form).getByLabelText('Taille de l’aiguille (mm)'), 'grosses')
    await user.type(within(form).getByLabelText('Mailles'), '20')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Une taille d’aiguille en mm, entre 0,5 et 30')
  })

  it('mes échantillons : sans rien de noté, la saisie est refusée', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), { ...structuredClone(PROJECT), needles: [3] }, START)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Note au moins les mailles ou les rangs.')
  })

  it('mailles au début : saisies, elles font foi ; reprendre celles de l’étape d’avant ; revenir au patron', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { ...project.steps[1]!.sections[1]!, actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    // 56 à la fin, 4 × −2 : 64 au début ; l'étape d'avant finit à 64
    expect((await screen.findByText(/Mailles au début :/)).parentElement).toHaveTextContent('Mailles au début : 64 mailles (d’après la fin du patron)')
    expect(screen.queryByRole('button', { name: /Reprendre les/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    const form = screen.getByRole('form', { name: 'Mailles au début' })
    await user.clear(within(form).getByLabelText('Mailles au début de l’étape'))
    await user.type(within(form).getByLabelText('Mailles au début de l’étape'), '0')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Un nombre entier de mailles')
    await user.clear(within(form).getByLabelText('Mailles au début de l’étape'))
    await user.type(within(form).getByLabelText('Mailles au début de l’étape'), '70')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: 70 })
  })

  it('mailles au début saisies : la fin se recalcule, l’étape d’avant est proposée', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.startStitches = 70
    // L'étape d'avant finit à 60 mailles, le patron en donne 64 au début de celle-ci : les deux sont proposés
    project.steps[0]!.stitches = 60
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { ...project.steps[1]!.sections[1]!, actions: [{ text: '1 diminution de chaque côté', rank: null, stitches: -2 }] }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    expect(await screen.findByText('Étape 2 sur 3 · 30 rangs · 62 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByText(/Mailles au début :/).parentElement).toHaveTextContent('Mailles au début : 70 mailles')
    // Un seul bouton ouvre le choix : étape d'avant, patron, ou un autre nombre
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    const form = await screen.findByRole('form', { name: 'Mailles au début' })
    const choice = within(form).getByLabelText('Partir de')
    expect(Array.from((choice as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      'Comme l’étape d’avant (60 mailles)',
      'Comme le patron (64 mailles)',
      'Un autre nombre',
    ])
    await user.selectOptions(choice, 'Comme l’étape d’avant (60 mailles)')
    expect(within(form).getByLabelText('Mailles au début de l’étape')).toHaveValue('60')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: 60 })
    // Laisser le patron décider : la saisie est effacée
    await user.click(screen.getByRole('button', { name: 'Modifier les mailles au début' }))
    await user.click(within(await screen.findByRole('form', { name: 'Mailles au début' })).getByRole('button', { name: 'Laisser le patron décider' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { startStitches: null })
  })

  it('règle, ajoute, déplace et supprime des sections', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    // Réglée : l'action passe dans la liste des actions de la répétition
    const decrease = { ...legacy!, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null }] }

    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
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
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByRole('combobox', { name: 'Rang de l’action 1' })).toHaveValue('last')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 1' }), '1')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.type(within(form).getByRole('textbox', { name: 'Action 2' }), '1 augmentation')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Rang de l’action 2' }), 'last')
    await user.click(within(form).getByRole('button', { name: 'Ajouter une action' }))
    await user.click(within(form).getByRole('button', { name: 'Supprimer l’action 3' }))
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
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
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
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText('1 augmentation — tous les 5 cm (rangs à régler)')).toBeInTheDocument()
    expect(within(sections).getByRole('link', { name: 'Noter mon échantillon' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Actions pour « 1 augmentation/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    expect(screen.getByText('tous les 5 cm', { selector: 'span' })).toBeInTheDocument()
  })

  it('convertit les cm du patron en rangs avec l’échantillon : calcul expliqué, à valider ou régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.patternGauge = { stitches: 22, rows: 30 }
    project.gauges = [{ needle: null, stitches: 20, rows: 26, checked: false }]
    project.steps[1]!.sections = [
      { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' },
      { kind: 'repeat', rows: null, every: null, times: 3, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 2,5 cm' },
    ]
    // 13 + 3 × 7 rangs convertis : le total de l'étape suit
    project.steps[1]!.totalRows = 34
    const { api } = renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // 5 cm × 26 rangs pour 10 cm = 13 rangs ; 2,5 cm × 26 = 6,5 → 7 rangs
    expect(within(sections).getByText('13 rangs (≈ 5 cm) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 1 à 13')).toBeInTheDocument()
    expect(within(sections).getByText('1 augmentation — tous les 7 rangs (≈ 2,5 cm) (3 fois)')).toBeInTheDocument()
    const notes = within(sections).getAllByRole('note')
    expect(notes[0]).toHaveTextContent('Converti depuis le patron : 5 cm × 26 rangs pour 10 cm (ton échantillon) ≈ 13 rangs (arrondi). Vérifie-le : valider vaut pour toutes les sous-étapes du projet.')

    // Valider : vaut pour tout le projet (sans aiguille choisie), une seule fois
    await user.click(within(notes[0]!).getByRole('button', { name: 'Valider' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: null, stitches: 20, rows: 26, checked: true }])

    // Régler : le formulaire part du nombre calculé ; enregistré, il est validé
    await user.click(within(notes[1]!).getByRole('button', { name: 'Modifier' }))
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
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    // 5 cm × 30 rangs pour 10 cm = 15 rangs : début au rang 16
    expect(within(sections).getByText('En même temps, dès le rang 16 (≈ 5 cm) : encolure — tous les 2 rangs (2 fois)')).toBeInTheDocument()
    expect(within(sections).getByText('Rangs 16 à 19')).toBeInTheDocument()
    expect(within(sections).getByRole('note')).toHaveTextContent('Converti depuis le patron : début : 5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ rang 16 (arrondi).')

    // Régler : « En même temps » au rang 18, enregistré validé (hauteur du patron gardée)
    await user.click(within(within(sections).getByRole('note')).getByRole('button', { name: 'Modifier' }))
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
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    await user.click(screen.getByRole('radio', { name: 'À la suite' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [expect.anything(), expect.not.objectContaining({ at: expect.anything() })] })
  })

  it('cm du patron sans échantillon : le lien mène à « Démarrer », sur l’aiguille concernée', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5] }
    project.steps[1]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm', needle: 3.5 }]
    renderProject(fakeApi(), project)
    const sections = await screen.findByRole('region', { name: 'Sous-étapes' })
    expect(within(sections).getByText('5 cm (à régler) : jersey')).toBeInTheDocument()
    expect(within(sections).getByText(/Sans échantillon, les centimètres ne se convertissent pas/)).toBeInTheDocument()
    expect(within(sections).queryByRole('note')).not.toBeInTheDocument()

    // Les échantillons se notent au même endroit, dans « Démarrer » : le lien ouvre celui de cette aiguille
    const link = within(sections).getByRole('link', { name: 'Noter mon échantillon à l’aiguille 3,5 mm' })
    expect(link).toHaveAttribute('href', '/tricot/p1?onglet=demarrer&echantillon=3.5')
    await user.click(link)
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    expect(within(form).getByLabelText('Aiguille')).toHaveDisplayValue('3,5 mm')
  })

  it('prépare une étape : notes, étape suivante ou précédente, reprise d’une étape terminée, sans compteur', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 3 · 30 rangs · 56 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByText('8 / 30 rangs')).toBeInTheDocument()
    expect(screen.getByText('Rangs 5 à 28 · prochaine fois : rang 10')).toBeInTheDocument()
    // On tricote dans le mode tricoter : pas de compteur ni d'écran allumé ici
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toHaveAttribute('href', '/tricot/p1/tricoter?etape=s2')

    const notes = screen.getByLabelText('Notes de l’étape')
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
    await user.click(screen.getByRole('button', { name: 'Rouvrir l’étape' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s1', { done: false })
  })

  it('étape à tricoter plusieurs fois : le nombre de fois se change en touchant l’avancée', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    // L'en-tête ne dit le nombre de fois qu'une fois, dans la ligne d'avancée
    expect(screen.getByText('Étape 2 sur 3 · 30 rangs · 56 mailles à la fin')).toBeInTheDocument()
    expect(screen.queryByLabelText('À tricoter')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nombre de fois : à tricoter 1 fois' }))
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('À tricoter'), '2 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 2, pass: 1 })
    expect(screen.getByRole('button', { name: 'Nombre de fois : 1re fois sur 2' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('En cours'), '2e fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { pass: 2 })
    // Moins de fois que la fois en cours : elle redescend avec.
    await user.selectOptions(screen.getByLabelText('À tricoter'), '1 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 1, pass: 1 })
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
  })

  it('préparation : pas de « Toute l’étape » en double des sous-étapes (elle reste dans le mode tricoter)', async () => {
    renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.getByRole('region', { name: 'Sous-étapes' })).toBeInTheDocument()
    expect(screen.queryByText('Toute l’étape')).not.toBeInTheDocument()
  })

  it('liste des étapes : la fois en cours d’une étape tricotée plusieurs fois', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1] = { ...project.steps[1]!, times: 2, pass: 2 }
    renderProject(fakeApi(), project, OVERVIEW)
    expect(await screen.findByText('8 / 30 rangs · 2e fois sur 2')).toBeInTheDocument()
  })

  it('préparation : les aides restent repliées derrière (?) et s’ouvrent d’un toucher', async () => {
    const user = userEvent.setup()
    renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.queryByText(/Vérifie et corrige ce que la lecture a compris/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ex. 2 pour les deux manches/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aide : sous-étapes' }))
    expect(await screen.findByText(/Vérifie et corrige ce que la lecture a compris/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // Le nombre de fois explique dans sa propre bulle
    await user.click(screen.getByRole('button', { name: 'Nombre de fois : à tricoter 1 fois' }))
    expect(await screen.findByText(/Ex. 2 pour les deux manches/)).toBeInTheDocument()
  })

  it('blocs repliés : même geste partout, et un résumé de ce qu’ils contiennent', async () => {
    const user = userEvent.setup()
    const project = {
      ...structuredClone(PROJECT),
      yarns: [{ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5' }],
      gauges: [{ needle: null, stitches: 22, rows: 30, checked: false }],
      yarnChecks: [{ yarn: 0, grams: 220, rowsDone: 10, at: '2026-11-10T09:00:00.000Z' }],
    }
    renderProject(fakeApi(), project, START)
    // Démarrer : la laine est ouverte, le patron adapté replié avec son résumé
    const adapt = await screen.findByRole('button', { name: 'Patron adapté à moi' })
    expect(adapt).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Patron adapté à moi' })).toHaveTextContent('pas encore adapté')
    await user.click(adapt)
    expect(adapt).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Patron adapté à moi' })).not.toHaveTextContent('pas encore adapté')
    // Replié, chaque bloc dit ce qu'il contient
    await user.click(screen.getByRole('button', { name: 'Laine et échantillon' }))
    expect(screen.getByRole('region', { name: 'Laine et échantillon' })).toHaveTextContent('1 laine · 1 échantillon')
    await user.click(screen.getByRole('tab', { name: /3. Tricoter/ }))
    expect(await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })).toHaveTextContent('pesée le 10/11')
    expect(screen.getByRole('region', { name: 'Notes et photos' })).toHaveTextContent('rien de noté')
  })

  it('en-tête du projet : une seule taille affichée, celle suivie ; le choix est dans « Démarrer »', async () => {
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    // Patron à une taille : dans l'en-tête, sans choix
    expect(await screen.findByText('Taille M · 1 / 3 étapes')).toBeInTheDocument()
    expect(screen.queryByLabelText('Taille')).not.toBeInTheDocument()
    cleanup()
    // Plusieurs tailles : l'en-tête montre la taille suivie (L), pas celle de l'import (M)
    renderProject(fakeApi(), { ...PROJECT, sizes: ['S', 'M', 'L'], sizeIndex: 2 }, START)
    expect(await screen.findByText('Taille L · 1 / 3 étapes')).toBeInTheDocument()
    expect(screen.getByLabelText('Taille')).toHaveDisplayValue('L')
    cleanup()
    // Taille de l'import hors de la liste : proposée telle quelle
    renderProject(fakeApi(), { ...PROJECT, size: '4 ans', sizes: ['S', 'M'], sizeIndex: null }, START)
    expect(await screen.findByLabelText('Taille')).toHaveDisplayValue('4 ans')
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
    // Les actions du projet tiennent au bout du titre, en icônes
    await user.click(await screen.findByRole('button', { name: 'Voir le PDF' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(api.knitting.pdfUrl).toHaveBeenCalledWith('u-lucile/abc.pdf')
    await vi.waitFor(() => expect(tab.location.href).toBe('https://cdn.test/u-lucile/abc.pdf'))
    open.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Supprimer le projet' }))
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
  /** Onglet « Démarrer » du projet : la carte « Laine et échantillon » y est ouverte d'office. */
  async function renderProject(api = fakeApi(), project: KnitProject = PROJECT) {
    api.knitting.getProject.mockResolvedValue(structuredClone(project))
    const result = renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
    await screen.findByRole('region', { name: 'Laine et échantillon' })
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
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Alpaca' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
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
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Merino' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.knitting.saveYarnChecks).toHaveBeenCalledWith('p1', [
        { yarn: 0, grams: 50, rowsDone: 10, at: '' },
        { yarn: 1, grams: 20, rowsDone: 10, at: '' },
      ]),
    )
    // La dernière laine retirée sans pesée derrière elle : rien à décaler
    api.knitting.saveYarnChecks.mockClear()
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Kid-Silk' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [alpaca, merino] })))
    expect(api.knitting.saveYarnChecks).toHaveBeenCalledWith('p1', [{ yarn: 0, grams: 50, rowsDone: 10, at: '' }, { yarn: 1, grams: 40, rowsDone: 10, at: '' }])
  })

  it('recalcule mailles et rangs avec l’échantillon de la tricoteuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    await renderProject(api, { ...PROJECT, patternGauge: { stitches: 22, rows: 30 }, gauges: [{ needle: null, stitches: 24, rows: 30, checked: false }] })
    expect(screen.getByLabelText('Mailles du patron')).toHaveValue('22')
    // Étape en cours : 30 rangs, 56 mailles à la fin → 61 mailles à 24 m./10 cm, rangs inchangés.
    await user.click(screen.getByRole('tab', { name: /2. Préparer/ }))
    await user.click(await screen.findByRole('link', { name: /Emmanchures/ }))
    expect(await screen.findByText(/56 mailles à la fin \(≈ 61 avec ton échantillon\)/)).toBeInTheDocument()
    expect(screen.queryByText(/rangs avec ton échantillon/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Pull Bergamote' }))
    await user.click(await screen.findByRole('tab', { name: /1. Démarrer/ }))

    // Son échantillon se modifie dans la liste ; celui du patron a son propre formulaire
    const list = screen.getByRole('region', { name: 'Mes échantillons' })
    await user.click(within(list).getByRole('button', { name: 'Modifier l’échantillon : Toutes aiguilles' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.clear(within(form).getByLabelText('Rangs'))
    await user.type(within(form).getByLabelText('Rangs'), '0')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('un nombre entre 1 et 100')
    await user.clear(within(form).getByLabelText('Rangs'))
    await user.type(within(form).getByLabelText('Rangs'), '27')
    api.knitting.getProject.mockResolvedValue({ ...structuredClone(PROJECT), patternGauge: { stitches: 22, rows: 30 }, gauges: [{ needle: null, stitches: 24, rows: 27, checked: false }] })
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenCalledWith('p1', [{ needle: null, stitches: 24, rows: 27, checked: false }])
    await waitFor(() => expect(api.knitting.getProject).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('tab', { name: /2. Préparer/ }))
    await user.click(await screen.findByRole('link', { name: /Emmanchures/ }))
    expect(await screen.findByText('8 / 30 rangs (≈ 27 avec ton échantillon)')).toBeInTheDocument()
  })
})

describe('projet d’après un patron de la bibliothèque', () => {
  const GILET: KnitPattern = {
    id: 'q1',
    title: 'Gilet Rosée',
    pdfPath: 'u-lucile/gilet.pdf',
    photos: [],
    url: null,
    size: 'M',
    yarnIdea: 'Restes de mérinos',
    notes: 'Pour l’hiver',
    metersNeeded: null,
    needleMm: null,
    tags: [],
    createdAt: '2026-11-01T10:00:00Z',
    projects: [],
    readSizes: [],
  }

  it('reprend le PDF et la taille du patron, puis crée le projet relié au patron', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    renderWithApp(<KnittingImportPage />, {
      api,
      route: '/tricot/nouveau?patron=q1',
      path: '/tricot/nouveau',
      extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} />,
    })
    expect(await screen.findByRole('heading', { name: 'Commencer « Gilet Rosée »' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Patron' })).toHaveAttribute('href', '/tricot/patrons/q1')
    expect(api.knitting.downloadPdf).toHaveBeenCalledWith('u-lucile/gilet.pdf', 'Gilet Rosée')
    expect(screen.getByLabelText('Taille', { selector: 'input' })).toHaveValue('M')
    // PDF repris : rien à choisir
    expect(await screen.findByText('Gilet Rosée.pdf')).toBeInTheDocument()
    expect(screen.queryByLabelText('Patron (PDF)')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByText(/échantillon 22 m\. × 30 rangs pour 10 cm/)).toBeInTheDocument()
    // Le projet prend le nom du patron, pas celui lu dans le PDF
    expect(screen.getByLabelText('Nom du projet')).toHaveValue('Gilet Rosée')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() =>
      expect(api.knitting.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Gilet Rosée', pattern: { id: 'q1', pdfPath: 'u-lucile/gilet.pdf' }, gauge: { stitches: 22, rows: 30 } }),
      ),
    )
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
    expect(await screen.findByLabelText('Taille')).toHaveDisplayValue('S')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ size: 'S', sizeIndex: 0 }))
  })

  it('un autre PDF peut remplacer celui du patron, pour ce projet', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    await user.click(await screen.findByRole('button', { name: 'Choisir un autre PDF' }))
    // Rien à lire tant qu'un autre PDF n'est pas choisi
    expect(screen.getByRole('button', { name: 'Lire le patron' })).toBeDisabled()
    const other = new File(['%PDF-1.4'], 'autre.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), other)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(other, 'M')
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ pdf: other, pattern: { id: 'q1', pdfPath: null } })))
  })

  it('patron sans PDF (photos ou lien) : le PDF est demandé', async () => {
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, pdfPath: null, url: 'https://patrons.exemple/gilet' })
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau' })
    expect(await screen.findByRole('heading', { name: 'Commencer « Gilet Rosée »' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Patron (PDF)')).toBeInTheDocument()
    expect(api.knitting.downloadPdf).not.toHaveBeenCalled()
  })

  it('taille déjà lue : la lecture gardée est reprise sans l’IA, puis peut être refaite', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['M'] })
    const kept = { ...PATTERN, sizeIndex: 1 }
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: kept }])
    api.knitting.readPattern.mockResolvedValue({ ...PATTERN, sizeIndex: 1, title: 'Relu' })
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    expect(await screen.findByText('Déjà lu pour M : dans ces tailles, rien n’est relu.')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Reprendre la lecture (taille M)' }))
    expect(api.knitting.readPattern).not.toHaveBeenCalled()
    expect(await screen.findByText('Lecture du 13 novembre reprise : rien n’a été relu par l’IA.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du projet')).toHaveValue('Gilet Rosée')

    // Reprise telle quelle : rien de nouveau à garder
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ steps: kept.steps, reading: null, pattern: { id: 'q1', pdfPath: 'u-lucile/gilet.pdf' } })))
  })

  it('« Relire avec l’IA » refait la lecture, qui est gardée à son tour', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['M'] })
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: { ...PATTERN, sizeIndex: 1 } }])
    const fresh = { ...PATTERN, sizeIndex: 1, missingParts: [] }
    api.knitting.readPattern.mockResolvedValue(fresh)
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    await screen.findByText('Gilet Rosée.pdf')
    await user.click(screen.getByRole('button', { name: 'Reprendre la lecture (taille M)' }))
    await user.click(await screen.findByRole('button', { name: 'Relire avec l’IA' }))
    await waitFor(() => expect(api.knitting.readPattern).toHaveBeenCalledWith(expect.any(File), 'M'))
    await waitFor(() => expect(screen.queryByText(/rien n’a été relu/)).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ reading: fresh })))
  })

  it('autre taille : le patron est lu par l’IA, et la lecture gardée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['M'] })
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: { ...PATTERN, sizeIndex: 1 } }])
    const large = { ...PATTERN, sizeIndex: 2 }
    api.knitting.readPattern.mockResolvedValue(large)
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau', extraRoutes: <Route path="/tricot/:id" element={<p>Projet ouvert</p>} /> })
    await screen.findByText('Gilet Rosée.pdf')
    const sizeInput = screen.getByLabelText('Taille', { selector: 'input' })
    await user.clear(sizeInput)
    await user.type(sizeInput, 'L')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(expect.any(File), 'L')
    await user.click(await screen.findByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ size: 'L', reading: large })))
  })

  it('autre PDF choisi : la lecture gardée ne vaut plus', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['M'] })
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: { ...PATTERN, sizeIndex: 1 } }])
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau' })
    await user.click(await screen.findByRole('button', { name: 'Choisir un autre PDF' }))
    expect(screen.queryByText(/Déjà lu pour/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lire le patron' })).toBeInTheDocument()
  })

  it('patron sans PDF mais déjà lu : le projet se crée sans PDF à choisir', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, pdfPath: null, readSizes: ['M'] })
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: { ...PATTERN, sizeIndex: 1 } }])
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau' })
    const resume = await screen.findByRole('button', { name: 'Reprendre la lecture (taille M)' })
    expect(resume).toBeEnabled()
    await user.click(resume)
    expect(await screen.findByRole('heading', { name: 'Vérifier les étapes' })).toBeInTheDocument()
    expect(api.knitting.readPattern).not.toHaveBeenCalled()
  })

  it('patron introuvable', async () => {
    const api = fakeApi()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=perdu', path: '/tricot/nouveau' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Patron introuvable.')
  })

  it('ancienne adresse « Mettre de côté » : ajout à la bibliothèque', async () => {
    renderWithApp(<KnittingImportPage />, {
      route: '/tricot/nouveau?plus-tard',
      path: '/tricot/nouveau',
      extraRoutes: <Route path="/tricot/patrons/nouveau" element={<p>Ajouter un patron</p>} />,
    })
    expect(await screen.findByText('Ajouter un patron')).toBeInTheDocument()
  })
})

describe('stock de laine', () => {
  const MERINO = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }
  const STASH: StashItem[] = [{ id: 'st1', yarn: MERINO, notes: '', createdAt: '2026-11-01' }]
  const pattern = (id: string, metersNeeded: number | null, needleMm: number | null, pdfPath: string | null = null): KnitPattern => ({
    id,
    title: id,
    pdfPath,
    photos: [],
    url: pdfPath ? null : 'https://patrons.exemple/' + id,
    size: null,
    yarnIdea: '',
    notes: '',
    metersNeeded,
    needleMm,
    tags: [],
    createdAt: '2026-11-01',
    projects: [],
    readSizes: [],
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

    await user.click(within(list).getByRole('button', { name: 'Supprimer DROPS Merino du stock' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deleteStashItem).toHaveBeenCalledWith('st1'))
  })

  it('cherche d’abord dans la bibliothèque, puis des idées avec l’IA', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    // 840 m, aiguilles 4 mm
    api.knitting.listPatterns.mockResolvedValue([pattern('Gilet', 600, 4, 'u-lucile/gilet.pdf'), pattern('Pull', 1200, 4), pattern('Bonnet', null, null)])
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
    expect(within(fits).getByRole('link', { name: /^Gilet/ })).toHaveAttribute('href', '/tricot/patrons/Gilet')
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
    expect(dialog).toHaveTextContent('Aucun patron dans ta bibliothèque.')
    await user.click(within(dialog).getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La recherche d’idées a échoué.')
  })

  it('prend une laine du stock pour un projet', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.getProject.mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
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
    await user.type(screen.getByLabelText('Taille', { selector: 'input' }), 'M')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))

    const list = await screen.findByRole('list', { name: 'Étapes lues' })
    expect(within(list).getByText(/^Monter/)).toHaveTextContent(TEXT)
    expect(within(list).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])
    await user.selectOptions(screen.getByLabelText('Taille'), 'L')
    expect(within(list).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['68', '7'])

    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    // La taille choisie dans la liste devient celle du projet
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ size: 'L', sizes: ['S', 'M', 'L'], sizeIndex: 2 }))
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

    // La taille se choisit pour tout le projet, sur sa page (pas dans une étape)
    expect(within(article).queryByLabelText('Taille')).not.toBeInTheDocument()
    cleanup()
    renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
    api.knitting.getProject.mockResolvedValue({ ...project, sizeIndex: 0 })
    await user.selectOptions(await screen.findByLabelText('Taille'), 'S')
    expect(api.knitting.setSizeIndex).toHaveBeenCalledWith('p1', 0)
    // Échec : message
    api.knitting.setSizeIndex.mockRejectedValueOnce(new AppError('Impossible de changer la taille mise en valeur.'))
    await user.selectOptions(screen.getByLabelText('Taille'), 'Aucune')
    expect(await screen.findByText('Impossible de changer la taille mise en valeur.')).toBeInTheDocument()
    // De retour dans l'étape : les nombres de la taille S
    cleanup()
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    const again = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    await waitFor(() => expect(within(again).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['60', '6']))
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

