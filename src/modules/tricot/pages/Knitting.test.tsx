import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { KnitProject, KnitStep, ReadPattern } from '../lib/pattern'
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
  notes: '',
  done: false,
  ...overrides,
})

const PROJECT: KnitProject = {
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
  steps: PROJECT.steps.map(({ title, instructions, totalRows, stitches, sections }) => ({ title, instructions, totalRows, stitches, sections })),
}

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
    api.knitting.readPattern.mockResolvedValue(PATTERN)
    api.knitting.createProject.mockResolvedValue('p9')
    renderImport(api)

    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choisis le PDF du patron.')
    const file = pdf()
    await user.upload(screen.getByLabelText('Patron (PDF)'), file)
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique la taille choisie.')

    await user.type(screen.getByLabelText('Taille choisie'), ' M ')
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(api.knitting.readPattern).toHaveBeenCalledWith(file, 'M')

    const steps = await screen.findByRole('list', { name: 'Étapes lues' })
    expect(within(steps).getAllByRole('listitem').filter((li) => li.parentElement === steps)).toHaveLength(3)
    expect(within(steps).getByText('30 rangs · 56 mailles')).toBeInTheDocument()
    expect(within(steps).getByText('4 rangs : jersey')).toBeInTheDocument()
    expect(within(steps).getByText('1 diminution de chaque côté — tous les 6 rangs (4 fois)')).toBeInTheDocument()
    expect(screen.getByText('Taille M · 3 étapes')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nom du projet'))
    await user.type(screen.getByLabelText('Nom du projet'), 'Pull de Noël')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith({ title: 'Pull de Noël', size: 'M', pdf: file, steps: PATTERN.steps })
    expect(await screen.findByText('Projet ouvert')).toBeInTheDocument()
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

describe('KnittingProjectPage', () => {
  function renderProject(api = fakeApi(), project: KnitProject | null = PROJECT) {
    api.knitting.getProject.mockResolvedValue(project && structuredClone(project))
    return renderWithApp(<KnittingProjectPage />, {
      api,
      route: '/tricot/p1',
      path: '/tricot/:id',
      extraRoutes: <Route path="/tricot" element={<p>Liste des projets</p>} />,
    })
  }

  it('ouvre l’étape en cours et annonce la diminution du rang à tricoter', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 3 · 56 mailles à la fin')).toBeInTheDocument()
    // 8 rangs terminés : le rang 9 est à tricoter, la diminution est au rang 10
    expect(screen.getByRole('status')).toHaveTextContent(/^Rang 9 à tricoter$/)
    expect(screen.getByText('Rangs 1 à 4')).toBeInTheDocument()
    expect(screen.getByText('Rangs 5 à 28 · prochaine fois : rang 10')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 9 })
    expect(screen.getByRole('status')).toHaveTextContent('Rang 10 à tricoter1 diminution de chaque côté (1/4)')

    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(screen.getByRole('status')).toHaveTextContent(/^Rang 11 à tricoter$/)
    expect(screen.getByText('Rangs 5 à 28 · prochaine fois : rang 16')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer un rang' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { rowCount: 9 })
  })

  it('annonce le début d’une nouvelle section', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1]!.rowCount = 4
    renderProject(fakeApi(), project)
    expect(await screen.findByRole('status')).toHaveTextContent('Rang 5 à tricoterNouvelle section : 1 diminution de chaque côté — tous les 6 rangs (4 fois)')
  })

  it('règle, ajoute, déplace et supprime des sections', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    const [jersey, decrease] = PROJECT.steps[1]!.sections

    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    const form = screen.getByRole('form', { name: 'Section' })
    await user.clear(within(form).getByLabelText('Tous les … rangs'))
    await user.type(within(form).getByLabelText('Tous les … rangs'), '8')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }] })
    expect(await screen.findByText('Rangs 5 à 36 · prochaine fois : rang 12')).toBeInTheDocument()

    // Nouvelle section sans répétition, à la fin
    await user.click(screen.getByRole('button', { name: 'Ajouter une section' }))
    const added = screen.getByRole('form', { name: 'Section' })
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    expect(within(added).getByRole('alert')).toHaveTextContent('Indique le nombre de rangs.')
    await user.type(within(added).getByLabelText('Nombre de rangs'), '10')
    await user.type(within(added).getByLabelText('Description (facultatif)'), 'côtes')
    await user.click(within(added).getByRole('button', { name: 'Enregistrer' }))
    const rows10 = { kind: 'rows', rows: 10, every: null, times: null, text: 'côtes', pattern: null }
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [jersey, { ...decrease, every: 8 }, rows10] })
    expect(await screen.findByText('Rangs 37 à 46')).toBeInTheDocument()

    // Une répétition se crée aussi
    await user.click(screen.getByRole('button', { name: 'Ajouter une section' }))
    const repeatForm = screen.getByRole('form', { name: 'Section' })
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
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, { ...decrease, every: 8 }] })
  })

  it('montre la mesure du patron d’une section à régler', async () => {
    const user = userEvent.setup()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [{ kind: 'repeat', rows: null, every: null, times: 3, text: '1 augmentation', pattern: 'tous les 5 cm' }]
    renderProject(fakeApi(), project)
    expect(await screen.findByText('1 augmentation — tous les 5 cm (rangs à régler)')).toBeInTheDocument()
    expect(screen.getByText('Indique le nombre de rangs pour que la suite se calcule.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Actions pour « 1 augmentation/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    expect(screen.getByText('tous les 5 cm', { selector: 'span' })).toBeInTheDocument()
  })

  it('garde les notes et passe à l’étape suivante une fois terminée', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    const notes = await screen.findByLabelText('Notes')
    await user.type(notes, 'Aiguilles 4,5')
    await user.tab()
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { notes: 'Aiguilles 4,5' })

    await user.click(screen.getByRole('button', { name: 'Étape terminée' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { done: true })
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    expect(screen.getByText('Pull Bergamote', { selector: 'h1' })).toBeInTheDocument()
    expect(screen.getByText('Taille M · 2 / 3 étapes')).toBeInTheDocument()

    // Une étape terminée se rouvre
    const nav = screen.getByRole('navigation', { name: 'Étapes' })
    await user.click(within(nav).getByRole('button', { name: /Dos – côtes/ }))
    await user.click(screen.getByRole('button', { name: 'Reprendre l’étape' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s1', { done: false })
    expect(screen.getByText('Tous les rangs de l’étape sont faits.')).toBeInTheDocument()

    // Sur téléphone : liste déroulante et étape suivante / précédente
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }))
    expect(screen.getByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Étape' }), 's3')
    expect(screen.getByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Étape suivante' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Étape précédente' }))
    expect(screen.getByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
  })

  it('compte chaque rang même en tapant très vite, et enregistre dans l’ordre', async () => {
    const api = fakeApi()
    const saved: number[] = []
    api.knitting.saveProgress.mockImplementation(async (_id, progress) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      saved.push(progress.rowCount!)
    })
    renderProject(api)
    const add = await screen.findByRole('button', { name: 'Ajouter 1 rang' })
    // Clics sans attendre l'affichage
    for (let i = 0; i < 5; i++) add.click()
    expect(await screen.findByText('13')).toBeInTheDocument()
    await vi.waitFor(() => expect(saved).toEqual([9, 10, 11, 12, 13]))
  })

  it('rétablit le compteur si l’enregistrement échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.saveProgress.mockRejectedValueOnce(new Error('réseau'))
    renderProject(api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter 1 rang' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 9 })
    expect(await screen.findByText('8')).toBeInTheDocument()
  })

  it('ouvre le PDF d’origine et supprime le projet', async () => {
    const user = userEvent.setup()
    const tab = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    const { api } = renderProject()
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
  })

  it('signale un projet introuvable ou illisible', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), null)
    expect(await screen.findByText('Ce projet n’existe plus.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Retour aux projets' }))
    expect(await screen.findByText('Liste des projets')).toBeInTheDocument()
  })

  it('propose de réessayer le chargement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getProject.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: '/tricot/p1', path: '/tricot/:id' })
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
  })
})
