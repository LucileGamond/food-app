import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { AppError } from '@/api'
import type { KnitProject, KnitStep, ReadPattern } from '../lib/pattern'
import { EMPTY_YARN, type QueuedPattern } from '../lib/yarn'
import { KnittingQueueFormPage } from './KnittingQueueFormPage'
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
    expect(screen.getByText('Taille M · 3 étapes · échantillon 22 m. × 30 rangs pour 10 cm')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nom du projet'))
    await user.type(screen.getByLabelText('Nom du projet'), 'Pull de Noël')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    expect(api.knitting.createProject).toHaveBeenCalledWith({ title: 'Pull de Noël', size: 'M', pdf: file, steps: PATTERN.steps, gauge: { stitches: 22, rows: 30 }, queued: null })
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

  it('garde l’écran allumé tant que le projet est affiché', async () => {
    const release = vi.fn(async () => undefined)
    const request = vi.fn(async () => ({ release, addEventListener: () => undefined }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    try {
      const { unmount } = renderProject()
      expect(await screen.findByText('L’écran reste allumé.')).toBeInTheDocument()
      expect(request).toHaveBeenCalledWith('screen')
      unmount()
      expect(release).toHaveBeenCalled()
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock
    }
  })

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
    const [jersey, legacy] = PROJECT.steps[1]!.sections
    // Réglée : l'action passe dans la liste des actions de la répétition
    const decrease = { ...legacy!, text: '', actions: [{ text: '1 diminution de chaque côté', rank: null }] }

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
    const confirm = await screen.findByRole('alertdialog', { name: 'Supprimer cette section ?' })
    expect(confirm).toHaveTextContent('« 4 rangs : jersey »')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { sections: [rows10, { ...decrease, every: 8 }] })
  })

  it('place plusieurs actions dans une répétition, avec leur couleur', async () => {
    const user = userEvent.setup()
    const { api } = renderProject()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 diminution de chaque côté — tous les 6 rangs (4 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Régler' }))
    const form = screen.getByRole('form', { name: 'Section' })
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

    // Pastilles : diminution au 1er rang de chaque répétition (bord rouge), augmentation au dernier (bord bleu)
    const first = await screen.findByRole('button', { name: 'Rang 5 : 1 diminution de chaque côté' })
    expect(first.className).toContain('border-red-500')
    expect(screen.getByRole('button', { name: 'Rang 10 : 1 augmentation' }).className).toContain('border-blue-500')
    expect(screen.getByRole('button', { name: 'Rang 6' }).className).not.toMatch(/border-(red|blue)-500/)
    expect(screen.getAllByRole('button', { name: /^Rang \d+$|^Rang \d+ :/ }).filter((b) => b.dataset.row && Number(b.dataset.row) >= 5 && Number(b.dataset.row) <= 28)).toHaveLength(24)
  })

  it('compte les rangs en touchant les pastilles, appui long pour décocher', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { api } = renderProject()
      // 8 rangs faits : les pastilles 1 à 8 sont cochées, la 9e est celle à tricoter
      expect(await screen.findByRole('button', { name: 'Rang 8' })).toHaveAttribute('aria-pressed', 'true')
      const ninth = screen.getByRole('button', { name: 'Rang 9' })
      expect(ninth).toHaveAttribute('aria-pressed', 'false')
      expect(ninth.className).toContain('ring-2')

      // Toucher une pastille non cochée : un rang de plus
      await user.click(screen.getByRole('button', { name: 'Rang 12' }))
      expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { rowCount: 9 })
      // Toucher une pastille cochée : rien
      await user.click(screen.getByRole('button', { name: 'Rang 3' }))
      expect(api.knitting.saveProgress).toHaveBeenCalledTimes(1)

      // Appui long : un rang de moins
      await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('button', { name: 'Rang 3' }) })
      await vi.advanceTimersByTimeAsync(600)
      await user.pointer({ keys: '[/MouseLeft]', target: screen.getByRole('button', { name: 'Rang 3' }) })
      expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { rowCount: 8 })
      expect(api.knitting.saveProgress).toHaveBeenCalledTimes(2)
      // Appui court relâché : rien
      await user.pointer({ keys: '[MouseLeft>]', target: screen.getByRole('button', { name: 'Rang 3' }) })
      await vi.advanceTimersByTimeAsync(100)
      await user.pointer({ keys: '[/MouseLeft]', target: screen.getByRole('button', { name: 'Rang 3' }) })
      await vi.advanceTimersByTimeAsync(600)
      expect(api.knitting.saveProgress).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
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
    expect(await screen.findByText('Projet introuvable')).toBeInTheDocument()
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

describe('laine et échantillon du projet', () => {
  function renderProject(api = fakeApi(), project: KnitProject = PROJECT) {
    api.knitting.getProject.mockResolvedValue(structuredClone(project))
    return renderWithApp(<KnittingProjectPage />, { api, route: '/tricot/p1', path: '/tricot/:id' })
  }

  it('ajoute une laine lue sur la photo de l’étiquette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockResolvedValue({ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', length_m: 125, needle_mm: 3.5 })
    renderProject(api)
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
    renderProject(api)
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
    renderProject(api, { ...PROJECT, yarns: [yarn] })
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

  it('recalcule mailles et rangs avec l’échantillon de la tricoteuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(api, { ...PROJECT, patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 30 } })
    // Étape en cours : 30 rangs, 56 mailles à la fin → 61 mailles à 24 m./10 cm, rangs inchangés.
    expect(await screen.findByText(/56 mailles à la fin \(≈ 61 avec ton échantillon\)/)).toBeInTheDocument()
    expect(screen.queryByText(/rangs avec ton échantillon/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mailles du patron')).toHaveValue('22')

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
    expect(await screen.findByText('≈ 27 rangs avec ton échantillon')).toBeInTheDocument()
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
  }

  it('liste les patrons en attente, les ouvre et les retire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listQueue.mockResolvedValue([{ ...QUEUED, id: 'q2', title: 'Bonnet', pdfPath: null, url: 'https://patrons.exemple/bonnet', priority: 3, size: null, yarnIdea: '', notes: '' }, QUEUED])
    renderWithApp(<KnittingPage />, { api })
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

  it('invite à mettre un patron de côté', async () => {
    renderWithApp(<KnittingPage />)
    expect(await screen.findByText(/Aucun patron en attente/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mettre un patron de côté' })).toHaveAttribute('href', '/tricot/a-faire')
  })

  it('met un patron de côté, avec son PDF', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingQueueFormPage />, { api, route: '/tricot/a-faire', path: '/tricot/a-faire', extraRoutes: <Route path="/tricot" element={<p>Tricot</p>} /> })
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Donne un nom au patron.')
    const pdf = new File(['%PDF'], 'Gilet Rosée.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Patron (PDF)'), pdf)
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Gilet Rosée')
    await user.type(screen.getByLabelText('Taille visée'), 'M')
    await user.selectOptions(screen.getByLabelText('Quand'), 'Bientôt')
    await user.type(screen.getByLabelText('Laine envisagée'), 'Mérinos')
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(api.knitting.addToQueue).toHaveBeenCalledWith({ title: 'Gilet Rosée', pdf, url: null, size: 'M', yarnIdea: 'Mérinos', notes: '', priority: 1 })
    expect(await screen.findByText('Tricot')).toBeInTheDocument()
  })

  it('signale un enregistrement impossible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.addToQueue.mockRejectedValue(new AppError('Impossible d’envoyer le PDF.'))
    renderWithApp(<KnittingQueueFormPage />, { api })
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
    expect(screen.getByText('Gilet Rosée.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lire le patron' }))
    expect(await screen.findByText(/échantillon 22 m\. × 30 rangs pour 10 cm/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }))
    await waitFor(() => expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ queued: QUEUED, gauge: { stitches: 22, rows: 30 } })))
  })

  it('patron mis de côté introuvable', async () => {
    const api = fakeApi()
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=perdu', path: '/tricot/nouveau' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Patron introuvable, ou sans PDF.')
  })
})
