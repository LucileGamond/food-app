import { screen, waitFor, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { knitPattern } from '@/test/knitFactories'
import { KnittingImportPage } from './KnittingImportPage'
import { PATTERN } from './knittingTestUtils'

beforeEach(() => localStorage.clear())

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

  it('nouveau projet : explique ce qui va se passer (rangé dans la bibliothèque, puis lu et découpé)', async () => {
    renderImport()
    const note = await screen.findByRole('note', { name: 'Ce qui va se passer' })
    expect(within(note).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Le patron est rangé dans ta bibliothèque, pour le retrouver ou le refaire.',
      'L’IA lit le patron pour ta taille et le découpe en étapes et sous-étapes (quelques centimes ; rien si cette taille est déjà lue).',
      'Tu vérifies les étapes lues, puis tu enregistres le projet.',
    ])
  })

  it('lit le patron pour la taille choisie, montre les étapes puis enregistre le projet', async () => {
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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

describe('projet d’après un patron de la bibliothèque', () => {
  const GILET = knitPattern({
    id: 'q1',
    pdfPath: 'u-lucile/gilet.pdf',
    size: 'M',
    yarnIdea: 'Restes de mérinos',
    notes: 'Pour l’hiver',
  })

  it('reprend le PDF et la taille du patron, puis crée le projet relié au patron', async () => {
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    // Le patron garde son PDF : la lecture de l'autre PDF n'est pas rangée sous lui
    expect(api.knitting.createProject).toHaveBeenCalledWith(expect.objectContaining({ reading: null }))
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
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
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
    const user = setupUser()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['M'] })
    api.knitting.listReadings.mockResolvedValue([{ sizeIndex: 1, sizeLabel: 'M', readAt: '2026-11-13T10:00:00Z', reading: { ...PATTERN, sizeIndex: 1 } }])
    renderWithApp(<KnittingImportPage />, { api, route: '/tricot/nouveau?patron=q1', path: '/tricot/nouveau' })
    await user.click(await screen.findByRole('button', { name: 'Choisir un autre PDF' }))
    expect(screen.queryByText(/Déjà lu pour/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lire le patron' })).toBeInTheDocument()
  })

  it('patron sans PDF mais déjà lu : le projet se crée sans PDF à choisir', async () => {
    const user = setupUser()
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

describe('texte du patron et taille mise en valeur, à l’import', () => {
  const TEXT = 'Monter 60 (64-68) m. et tricoter 6 (6-7) cm.'

  it('à l’import : texte tel quel, nombres de la taille choisie mis en valeur, taille modifiable', async () => {
    const user = setupUser()
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
})
