import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { KnitProject, KnitStep, StepSection } from '../lib/pattern'
import { highlightKey } from '../lib/sizes'
import { KnittingModePage } from './KnittingModePage'

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos',
  instructions: '',
  totalRows: 18,
  stitches: null,
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

const JERSEY: StepSection = { kind: 'rows', rows: 4, every: null, times: null, text: 'jersey', pattern: null }
const DECREASES: StepSection = { kind: 'repeat', rows: null, every: 6, times: 4, actions: [{ text: '1 dim. de chaque côté', rank: null }], text: '', pattern: null }

const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
  charts: [],
  chartHints: [],
  abbreviations: [{ abbr: 'dim.', meaning: 'diminution' }],
  yarnChecks: [],
  steps: [
    step({ id: 's1', done: true, rowCount: 18 }),
    // 4 rangs de jersey, puis 1 dim. tous les 6 rangs (4 fois) : rangs 10, 16, 22, 28 ; 30 rangs
    step({ id: 's2', position: 1, title: 'Emmanchures', instructions: 'Diminuer 1 m. de chaque côté tous les 6 rangs.', totalRows: 30, rowCount: 8, sections: [JERSEY, DECREASES] }),
    step({ id: 's3', position: 2, title: 'Encolure', totalRows: null }),
  ],
}

function renderMode(project: KnitProject = PROJECT, api = fakeApi(), route = '/tricot/p1/tricoter') {
  api.knitting.getProject.mockResolvedValue(structuredClone(project))
  return {
    ...renderWithApp(<KnittingModePage />, {
      api,
      route,
      path: '/tricot/:id/tricoter',
      extraRoutes: <Route path="/tricot/:id" element={<p>Page du projet</p>} />,
    }),
    api,
  }
}

const line = () => screen.findByRole('region', { name: /à tricoter$/ })
// Le prochain rang qui demande quelque chose, rappelé en tête de « Toute l'étape »
const next = () => screen.queryByText(/^Prochain :/)

beforeEach(() => localStorage.clear())

describe('mode tricoter', () => {
  it('ouvre l’étape en cours : le rang à tricoter, la suite, le compteur', async () => {
    const user = userEvent.setup()
    const { api } = renderMode()
    expect(await screen.findByRole('heading', { level: 1, name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByText('Pull Bergamote · étape 2 sur 3 · taille M')).toBeInTheDocument()
    // 8 rangs faits : rang 9, rien de particulier, la répétition est en cours
    const row = await line()
    expect(within(row).getByRole('heading')).toHaveTextContent('Rang 9 à tricoter')
    expect(row).toHaveTextContent('1 dim. de chaque côté — tous les 6 rangs (4 fois)')
    expect(next()).toHaveTextContent('Prochain : rang 10, dans 1 — 1 dim. de chaque côté (1/4)')
    // Toute l'étape : chaque rang à venir, avec dans combien de rangs
    const outline = screen.getByRole('list', { name: 'Toute l’étape' })
    expect(within(outline).getAllByRole('listitem', { current: false }).map((li) => li.textContent).filter((t) => t?.startsWith('Rang'))).toEqual([
      'Rang 101 dim. de chaque côté (1/4)dans 1',
      'Rang 161 dim. de chaque côté (2/4)dans 7',
      'Rang 221 dim. de chaque côté (3/4)dans 13',
      'Rang 281 dim. de chaque côté (4/4, dernière fois)dans 19',
      'Rang 30Dernier rang de l’étape, ensuite : Encoluredans 21',
    ])

    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 9 })
    expect(row).toHaveTextContent('Rang 10 à tricoter1 dim. de chaque côté (1/4)')
    expect(next()).toHaveTextContent('Prochain : rang 16, dans 6')
    await user.click(screen.getByRole('button', { name: 'Retirer un rang' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { rowCount: 8 })
    expect(row).toHaveTextContent('Rang 9 à tricoter')
  })

  it('mailles en fin de rang : sûres, estimées « (?) » avec la raison, ou inconnues', async () => {
    const user = userEvent.setup()
    // Mailles de fin non indiquées : inconnues
    const { unmount } = renderMode()
    await line()
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : (?) mailles')
    await user.click(screen.getByRole('button', { name: 'Pourquoi (?)' }))
    expect(await screen.findByText('Le nombre de mailles à la fin de l’étape n’est pas indiqué.')).toBeInTheDocument()
    unmount()

    // 56 mailles à la fin, effet deviné d'après le texte (−2) : 64 au rang 9, estimé
    const guessed = structuredClone(PROJECT)
    guessed.steps[1]!.stitches = 56
    const second = renderMode(guessed)
    await line()
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : 64 (?) mailles')
    await user.click(screen.getByRole('button', { name: 'Pourquoi (?)' }))
    expect(await screen.findByText('Effet de « 1 dim. de chaque côté » deviné : -2 mailles.')).toBeInTheDocument()
    second.unmount()

    // Effet donné : sûr, et la diminution du rang 10 est comptée
    const sure = structuredClone(guessed)
    sure.steps[1]!.sections = [JERSEY, { ...DECREASES, actions: [{ text: '1 dim. de chaque côté', rank: null, stitches: -2 }] }]
    renderMode(sure)
    await line()
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : 64 mailles')
    expect(screen.queryByRole('button', { name: 'Pourquoi (?)' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : 62 mailles')
  })

  it('explique les abréviations de la ligne d’un toucher', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.rowCount = 9
    renderMode(project)
    const row = await line()
    await user.click(within(row).getByRole('button', { name: 'dim. : explication' }))
    expect(await screen.findByText('diminution')).toBeInTheDocument()
  })

  it('vibre en arrivant sur un rang où il y a quelque chose à faire', async () => {
    const user = userEvent.setup()
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    try {
      renderMode()
      await line()
      expect(vibrate).not.toHaveBeenCalled()
      // Rang 10 : la diminution
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
      expect(vibrate).toHaveBeenCalledTimes(1)
      // Rang 11 : rien ; retour au rang 10 en décomptant : pas de vibration
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
      await user.click(screen.getByRole('button', { name: 'Retirer un rang' }))
      expect(vibrate).toHaveBeenCalledTimes(1)
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate
    }
  })

  it('étape pas prête : la liste de ce qui manque, et le lien vers la préparation', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [JERSEY, { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: 'Jersey sur 5 cm' }, DECREASES]
    project.steps[1]!.rowCount = 2
    renderMode(project)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sous-étape 2 (Jersey sur 5 cm (à régler) : jersey) : nombre de rangs à régler.')
    expect(screen.queryByRole('region', { name: /à tricoter$/ })).not.toBeInTheDocument()
    expect(next()).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('link', { name: 'Préparer l’étape' }))
    expect(await screen.findByText('Page du projet')).toBeInTheDocument()
  })

  it('compte chaque rang même en tapant très vite, et enregistre dans l’ordre', async () => {
    const api = fakeApi()
    const saved: number[] = []
    api.knitting.saveProgress.mockImplementation(async (_id, progress) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      saved.push(progress.rowCount!)
    })
    renderMode(PROJECT, api)
    const add = await screen.findByRole('button', { name: 'Ajouter 1 rang' })
    for (let i = 0; i < 5; i++) add.click()
    expect(await screen.findByText('Rang 14 à tricoter')).toBeInTheDocument()
    await vi.waitFor(() => expect(saved).toEqual([9, 10, 11, 12, 13]))
  })

  it('rétablit le compteur si l’enregistrement est refusé', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.saveProgress.mockRejectedValueOnce(new Error('refusé'))
    renderMode(PROJECT, api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter 1 rang' }))
    expect(await screen.findByText('Rang 9 à tricoter')).toBeInTheDocument()
  })

  it('dernier rang fait : l’étape se termine après confirmation et la suivante s’ouvre', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.rowCount = 29
    const { api } = renderMode(project)
    await user.click(await screen.findByRole('button', { name: 'Ajouter 1 rang' }))
    expect(await screen.findByText('Tous les rangs de l’étape sont faits')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Étape terminée' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Passer à l’étape suivante ?' })
    expect(confirm).toHaveTextContent('« Emmanchures » sera marquée terminée, et « Encolure » s’ouvrira au rang 1.')
    // Annuler : rien ne change
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }))
    expect(api.knitting.saveProgress).not.toHaveBeenCalledWith('s2', { done: true })

    await user.click(screen.getByRole('button', { name: 'Étape terminée' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Étape terminée' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { done: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Encolure' })).toBeInTheDocument()
    expect(await screen.findByText('Rang 1 à tricoter')).toBeInTheDocument()
  })

  it('étape tricotée 2 fois : la 1re finie, la 2e repart au rang 1, puis l’étape se termine', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1] = { ...project.steps[1]!, title: 'Manche', times: 2, pass: 1, rowCount: 29 }
    const { api } = renderMode(project)
    expect(await screen.findByText(/étape 2 sur 3 · 1re fois sur 2 · taille M/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(await screen.findByText('Tous les rangs de la 1re fois sont faits')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Commencer la 2e fois' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Commencer la 2e fois ?' })
    expect(confirm).toHaveTextContent('La 1re fois de « Manche » est finie : le compteur repart au rang 1 pour la 2e fois sur 2.')
    await user.click(within(confirm).getByRole('button', { name: 'Commencer la 2e fois' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { pass: 2, rowCount: 0 })
    // Même étape, 2e fois : le déroulé recommence (rang 1), l'étape n'est pas terminée.
    expect(await screen.findByRole('heading', { level: 1, name: 'Manche' })).toBeInTheDocument()
    expect(await screen.findByText('Rang 1 à tricoter')).toBeInTheDocument()
    expect(screen.getByText(/2e fois sur 2/)).toBeInTheDocument()
    expect(api.knitting.saveProgress).not.toHaveBeenCalledWith('s2', expect.objectContaining({ done: true }))

    // 2e fois finie : l'étape se termine comme une autre.
    // Le bouton est hors du volet « Patron », visible sans l'ouvrir
    await user.click(screen.getByRole('button', { name: 'Terminer l’étape maintenant' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Passer à l’étape suivante ?' })).getByRole('button', { name: 'Étape terminée' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { done: true })
    expect(await screen.findByRole('heading', { level: 1, name: 'Encolure' })).toBeInTheDocument()
  })

  it('étape tricotée 2 fois : la 1re peut se terminer avant son dernier rang', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[2] = { ...project.steps[2]!, times: 2, pass: 1, rowCount: 12 }
    project.steps[1]!.done = true
    const { api } = renderMode(project)
    await user.click(await screen.findByText('texte de l’étape, question, notes'))
    expect(screen.queryByRole('button', { name: 'Terminer l’étape maintenant' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terminer la 1re fois maintenant' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Commencer la 2e fois ?' })).getByRole('button', { name: 'Commencer la 2e fois' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s3', { pass: 2, rowCount: 0 })
    expect(await screen.findByText('Rang 1 à tricoter')).toBeInTheDocument()
  })

  it('dernière étape : le projet se termine', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps = [step({ id: 's1', title: 'Col', totalRows: 2, rowCount: 2 })]
    const { api } = renderMode(project)
    await user.click(await screen.findByRole('button', { name: 'Étape terminée' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Terminer le projet ?' })
    await user.click(within(confirm).getByRole('button', { name: 'Projet terminé' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s1', { done: true })
    expect(await screen.findByText('Projet terminé')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Retour au projet' }))
    expect(await screen.findByText('Page du projet')).toBeInTheDocument()
  })

  it('volet « Patron » : texte de l’étape, notes, fin d’étape anticipée', async () => {
    const user = userEvent.setup()
    const { api } = renderMode(PROJECT, fakeApi(), '/tricot/p1/tricoter?etape=s3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Encolure' })).toBeInTheDocument()
    // Étape sans nombre de rangs : pas de fin annoncée
    expect(next()).not.toBeInTheDocument()
    await user.click(screen.getByText('Patron', { selector: 'summary' }))
    expect(screen.getByText('Pas de texte pour cette étape.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Notes'), 'Aiguilles 4,5')
    await user.tab()
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s3', { notes: 'Aiguilles 4,5' })
    await user.click(screen.getByRole('button', { name: 'Terminer l’étape maintenant' }))
    expect(await screen.findByRole('alertdialog', { name: 'Terminer le projet ?' })).toBeInTheDocument()
  })

  it('étape déjà terminée (pas la dernière) : pas de compteur, l’étape suivante est annoncée', async () => {
    renderMode(PROJECT, fakeApi(), '/tricot/p1/tricoter?etape=s1')
    expect(await screen.findByText('Étape terminée')).toBeInTheDocument()
    expect(screen.getByText('Étape suivante : Emmanchures')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter 1 rang' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Étape terminée' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Terminer l’étape maintenant' })).not.toBeInTheDocument()
  })

  it('volet « Patron » : traduction et correction du surlignage enregistrées avec l’étape', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M']
    project.sizeIndex = 1
    project.steps[1]!.instructions = 'Knit 60 (64) sts in stockinette stitch.'
    const { api } = renderMode(project)
    await user.click(await screen.findByText('Patron', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: 'Traduire en français' }))
    expect(api.knitting.translateText).toHaveBeenCalledWith('Knit 60 (64) sts in stockinette stitch.')
    await waitFor(() => expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { translation: 'Traduit : Knit 60 (64) sts in stockinette stitch.' }))

    await user.click(screen.getByRole('button', { name: 'Corriger le surlignage' }))
    // Taille M : 64 est surligné ; on surligne aussi 60
    await user.click(screen.getByRole('button', { name: '60' }))
    // « 60 » commence au 6e caractère du texte : surligné à la main pour la taille M
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: { [highlightKey(1)]: { '5': true } } })
  })

  it('téléphone qui ne sait pas vibrer : le compteur marche quand même', async () => {
    const user = userEvent.setup()
    expect('vibrate' in navigator).toBe(false)
    renderMode()
    const row = await line()
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(row).toHaveTextContent('Rang 10 à tricoter1 dim. de chaque côté (1/4)')
  })

  it('garde l’écran allumé et ramène à la page du projet', async () => {
    const user = userEvent.setup()
    const release = vi.fn(async () => undefined)
    const request = vi.fn(async () => ({ release, addEventListener: () => undefined }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    try {
      renderMode()
      expect(await screen.findByRole('switch', { name: 'Écran toujours allumé' })).toBeChecked()
      await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
      await user.click(screen.getByRole('link', { name: 'Quitter le mode tricoter' }))
      expect(await screen.findByText('Page du projet')).toBeInTheDocument()
      expect(release).toHaveBeenCalled()
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock
    }
  })

  it('projet introuvable', async () => {
    renderMode(null as unknown as KnitProject)
    expect(await screen.findByText('Projet introuvable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quitter le mode tricoter' })).toHaveAttribute('href', '/tricot/p1')
  })
})
