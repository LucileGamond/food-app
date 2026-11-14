import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { EMPTY_YARN, type StashItem } from '../lib/yarn'
import type { KnitPattern } from '../lib/library'
import { KnittingLibraryPage } from './KnittingLibraryPage'
import { KnittingPage } from './KnittingPage'
import { KnittingPatternEditPage } from './KnittingPatternEditPage'
import { KnittingPatternPage } from './KnittingPatternPage'

vi.mock('@/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image')>()),
  compressImage: vi.fn(async (file: File) => new Blob([file], { type: 'image/jpeg' })),
}))

const pattern = (id: string, patch: Partial<KnitPattern> = {}): KnitPattern => ({
  id,
  title: id,
  pdfPath: null,
  photos: [],
  url: null,
  size: null,
  yarnIdea: '',
  notes: '',
  metersNeeded: null,
  needleMm: null,
  wish: 2,
  createdAt: '2026-11-01T10:00:00Z',
  projects: [],
  readSizes: [],
  ...patch,
})

const GILET = pattern('g1', {
  title: 'Gilet Rosée',
  pdfPath: 'u-lucile/gilet.pdf',
  photos: ['u-lucile/p1.jpg', 'u-lucile/p2.jpg'],
  url: 'https://patrons.exemple/gilet',
  size: 'M',
  yarnIdea: 'Mérinos',
  notes: 'Col en V',
  metersNeeded: 600,
  needleMm: 4,
  wish: 1,
})
const PULL = pattern('p1', { title: 'Pull Bergamote', pdfPath: 'u-lucile/pull.pdf', wish: null, projects: [{ id: 'proj1', title: 'Pull Bergamote', size: 'M' }] })
const BONNET = pattern('b1', { title: 'Bonnet', url: 'https://patrons.exemple/bonnet', wish: 3 })

describe('page Tricot : accès à la bibliothèque', () => {
  it('résume la bibliothèque : nombre de patrons et ceux à faire', async () => {
    const api = fakeApi()
    api.knitting.listPatterns.mockResolvedValue([GILET, PULL, BONNET])
    renderWithApp(<KnittingPage />, { api })
    const link = await screen.findByRole('link', { name: /Bibliothèque de patrons/ })
    expect(link).toHaveAttribute('href', '/tricot/patrons')
    expect(await within(link).findByText('3 patrons · 2 à faire')).toBeInTheDocument()
  })

  it('met un patron de côté depuis la page Tricot, sans traverser la bibliothèque', async () => {
    renderWithApp(<KnittingPage />, { api: fakeApi() })
    expect(await screen.findByRole('link', { name: 'Ajouter un patron' })).toHaveAttribute('href', '/tricot/patrons/nouveau')
  })

  it('bibliothèque vide : invite à y garder des patrons', async () => {
    renderWithApp(<KnittingPage />)
    expect(await screen.findByText('Garde ici les patrons qui te font envie')).toBeInTheDocument()
  })
})

describe('bibliothèque de patrons', () => {
  it('liste les patrons, les envies d’abord, avec leurs formats', async () => {
    const api = fakeApi()
    api.knitting.listPatterns.mockResolvedValue([PULL, BONNET, GILET])
    renderWithApp(<KnittingLibraryPage />, { api, route: '/tricot/patrons', path: '/tricot/patrons' })
    const list = await screen.findByRole('list', { name: 'Patrons' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.querySelector('span span')?.textContent)).toEqual(['Gilet Rosée', 'Bonnet', 'Pull Bergamote'])
    expect(links[0]).toHaveAttribute('href', '/tricot/patrons/g1')
    expect(links[0]).toHaveTextContent('Bientôt · taille M · 600 m · aiguilles 4 mm · Mérinos')
    expect(links[0]).toHaveTextContent('PDF · 2 photos · lien')
    expect(links[2]).toHaveTextContent('1 projet')
    expect(screen.getByRole('link', { name: 'Ajouter un patron' })).toHaveAttribute('href', '/tricot/patrons/nouveau')
    expect(screen.getByRole('link', { name: 'Tricot' })).toHaveAttribute('href', '/tricot')
  })

  it('cherche et filtre ; les filtres « À faire » et « Commencés » se partagent la liste', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listPatterns.mockResolvedValue([PULL, BONNET, GILET])
    renderWithApp(<KnittingLibraryPage />, { api, route: '/tricot/patrons', path: '/tricot/patrons' })
    const titles = () => within(screen.getByRole('list', { name: 'Patrons' })).getAllByRole('link').map((l) => l.querySelector('span span')?.textContent)

    await user.type(await screen.findByRole('searchbox', { name: 'Chercher un patron' }), 'rosee')
    expect(titles()).toEqual(['Gilet Rosée'])
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'introuvable')
    expect(screen.getByText('Aucun patron ne correspond.')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))

    await user.click(screen.getByRole('radio', { name: 'À faire' }))
    const todo = titles()
    expect(todo).toEqual(['Gilet Rosée', 'Bonnet'])
    await user.click(screen.getByRole('radio', { name: 'Commencés' }))
    const started = titles()
    expect(started).toEqual(['Pull Bergamote'])
    await user.click(screen.getByRole('radio', { name: 'Tous' }))
    expect(titles()).toHaveLength(todo.length + started.length)
  })

  it('bibliothèque vide', async () => {
    renderWithApp(<KnittingLibraryPage />, { route: '/tricot/patrons', path: '/tricot/patrons' })
    expect(await screen.findByText('Aucun patron')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('erreur de chargement, puis nouvel essai', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listPatterns.mockRejectedValueOnce(new AppError('Impossible de charger les patrons.'))
    renderWithApp(<KnittingLibraryPage />, { api, route: '/tricot/patrons', path: '/tricot/patrons' })
    expect(await screen.findByText('Impossible de charger les patrons.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Réessayer/ }))
    expect(await screen.findByText('Aucun patron')).toBeInTheDocument()
  })
})

describe('fiche d’un patron', () => {
  const route = { route: '/tricot/patrons/g1', path: '/tricot/patrons/:id' }

  it('montre ce qu’on en sait, ouvre le PDF, le lien et les photos', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    renderWithApp(<KnittingPatternPage />, { api, ...route })
    expect(await screen.findByRole('heading', { name: 'Gilet Rosée' })).toBeInTheDocument()
    expect(screen.getByText('Bientôt · taille M · 600 m · aiguilles 4 mm · Mérinos')).toBeInTheDocument()
    expect(screen.getByText('Col en V')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir le lien' })).toHaveAttribute('href', 'https://patrons.exemple/gilet')
    expect(screen.getByRole('link', { name: 'Modifier' })).toHaveAttribute('href', '/tricot/patrons/g1/modifier')
    expect(screen.getByRole('link', { name: 'Bibliothèque' })).toHaveAttribute('href', '/tricot/patrons')

    const tab = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    await user.click(screen.getByRole('button', { name: 'Ouvrir le PDF' }))
    await waitFor(() => expect(tab.location.href).toBe('https://cdn.test/u-lucile/gilet.pdf'))
    open.mockRestore()

    const photos = screen.getByRole('list', { name: 'Photos du patron' })
    expect(within(photos).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(photos).getByRole('button', { name: 'Ouvrir la photo 2' }))
    const viewer = await screen.findByRole('dialog', { name: 'Photo 2 sur 2' })
    expect(within(viewer).getByRole('img', { name: 'Photo 2 du patron' })).toHaveAttribute('src', 'https://cdn.test/u-lucile/p2.jpg')
  })

  it('pas encore tricoté : « Commencer un projet » reprend le patron', async () => {
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    renderWithApp(<KnittingPatternPage />, { api, ...route })
    expect(await screen.findByText('Pas encore tricoté.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Commencer un projet' })).toHaveAttribute('href', '/tricot/nouveau?patron=g1')
  })

  it('dit pour quelles tailles le patron est déjà lu', async () => {
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, readSizes: ['S', 'M'] })
    renderWithApp(<KnittingPatternPage />, { api, ...route })
    expect(await screen.findByText(/Déjà lu pour les tailles S, M : un projet dans ces tailles se crée sans\s+relire le patron\./)).toBeInTheDocument()
  })

  it('pas encore lu : rien n’est annoncé', async () => {
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    renderWithApp(<KnittingPatternPage />, { api, ...route })
    await screen.findByRole('heading', { name: 'Gilet Rosée' })
    expect(screen.queryByText(/Déjà lu/)).not.toBeInTheDocument()
  })

  it('liste ses projets ; sans PDF, prévient qu’il sera demandé', async () => {
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...PULL, pdfPath: null, url: 'https://patrons.exemple/pull' })
    renderWithApp(<KnittingPatternPage />, { api, route: '/tricot/patrons/p1', path: '/tricot/patrons/:id' })
    const projects = await screen.findByRole('list', { name: 'Projets de ce patron' })
    expect(within(projects).getByRole('link', { name: /Pull Bergamote/ })).toHaveAttribute('href', '/tricot/proj1')
    expect(projects).toHaveTextContent('Taille M')
    expect(screen.getByText(/il te sera demandé/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ouvrir le PDF' })).not.toBeInTheDocument()
  })

  it('supprime le patron, en disant ce que deviennent ses projets', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(PULL)
    renderWithApp(<KnittingPatternPage />, {
      api,
      route: '/tricot/patrons/p1',
      path: '/tricot/patrons/:id',
      extraRoutes: <Route path="/tricot/patrons" element={<p>Bibliothèque ouverte</p>} />,
    })
    await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('ses projets restent, avec leur PDF')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deletePattern).toHaveBeenCalledWith(PULL))
    expect(await screen.findByText('Bibliothèque ouverte')).toBeInTheDocument()
  })

  it('patron introuvable', async () => {
    renderWithApp(<KnittingPatternPage />, route)
    expect(await screen.findByText('Patron introuvable')).toBeInTheDocument()
  })
})

describe('ajout et modification d’un patron', () => {
  const extraRoutes = <Route path="/tricot/patrons/:id" element={<p>Fiche ouverte</p>} />

  it('ajoute un patron en PDF, avec photos et lien ; le nom vient du fichier', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/nouveau', path: '/tricot/patrons/nouveau', extraRoutes })
    expect(await screen.findByRole('heading', { name: 'Ajouter un patron' })).toBeInTheDocument()

    // Rien choisi : un format est demandé
    await user.type(screen.getByLabelText('Nom du patron'), 'x')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ajoute le patron : un PDF, des photos ou un lien.')
    await user.clear(screen.getByLabelText('Nom du patron'))

    const pdf = new File(['%PDF'], 'Gilet Rosée.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('PDF'), pdf)
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Gilet Rosée')
    expect(screen.getByText('Gilet Rosée.pdf')).toBeInTheDocument()
    const photo = new File(['jpg'], 'page1.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText(/Choisir des photos/), [photo, new File(['jpg'], 'page2.jpg', { type: 'image/jpeg' })])
    const thumbs = await screen.findByRole('list', { name: 'Photos du patron' })
    expect(within(thumbs).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(thumbs).getByRole('button', { name: 'Retirer la photo 2' }))
    expect(within(thumbs).getAllByRole('listitem')).toHaveLength(1)
    await user.type(screen.getByLabelText('Lien'), 'https://patrons.exemple/gilet')
    await user.type(screen.getByLabelText('Taille visée'), 'M')
    await user.selectOptions(screen.getByLabelText('Envie'), 'Bientôt')
    await user.type(screen.getByLabelText('Métrage nécessaire (m)'), '600')
    await user.type(screen.getByLabelText('Aiguilles (mm)'), '3,5')
    await user.type(screen.getByLabelText('Laine envisagée'), 'Mérinos')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.knitting.savePattern).toHaveBeenCalledTimes(1))
    const [fields, files, existing] = api.knitting.savePattern.mock.calls[0]!
    expect(fields).toEqual({ title: 'Gilet Rosée', url: 'https://patrons.exemple/gilet', size: 'M', yarnIdea: 'Mérinos', notes: '', metersNeeded: 600, needleMm: 3.5, wish: 1 })
    expect(files).toMatchObject({ pdfPath: null, newPdf: pdf, photos: [] })
    expect(files.newPhotos).toHaveLength(1)
    expect(existing).toBeNull()
    expect(await screen.findByText('Fiche ouverte')).toBeInTheDocument()
  }, 30_000)

  it('modifie un patron : garde ses fichiers, retire une photo et le PDF', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue(GILET)
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/g1/modifier', path: '/tricot/patrons/:id/modifier', extraRoutes })
    expect(await screen.findByRole('heading', { name: 'Modifier le patron' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Gilet Rosée')
    expect(screen.getByLabelText('Aiguilles (mm)')).toHaveValue('4')
    expect(screen.getByLabelText('Envie')).toHaveDisplayValue('Bientôt')
    expect(screen.getByText('PDF du patron')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1' }))
    await user.click(screen.getByRole('button', { name: 'Retirer le PDF' }))
    await user.selectOptions(screen.getByLabelText('Envie'), 'Pas d’envie notée')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.savePattern).toHaveBeenCalledTimes(1))
    const [fields, files, existing] = api.knitting.savePattern.mock.calls[0]!
    expect(fields).toMatchObject({ title: 'Gilet Rosée', wish: null, needleMm: 4 })
    expect(files).toEqual({ pdfPath: null, newPdf: null, photos: ['u-lucile/p2.jpg'], newPhotos: [] })
    expect(existing).toBe(GILET)
  })

  it('récupère depuis le lien le PDF, la photo et le nom, sans rien remplacer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const pdf = new File(['%PDF'], 'gilet-rosee.pdf', { type: 'application/pdf' })
    api.knitting.readPatternLink.mockResolvedValue({ url: 'https://p.exemple/gilet', title: 'Gilet Rosée', image: new File(['img'], 'photo.jpg', { type: 'image/jpeg' }), pdf })
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/nouveau', path: '/tricot/patrons/nouveau', extraRoutes })
    const read = await screen.findByRole('button', { name: 'Récupérer' })
    expect(read).toBeDisabled()
    await user.type(screen.getByLabelText('Lien'), 'https://p.exemple/gilet')
    await user.click(read)
    expect(api.knitting.readPatternLink).toHaveBeenCalledWith('https://p.exemple/gilet')
    expect(await screen.findByText('PDF du patron ajouté · photo du modèle ajoutée · nom repris de la page.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Gilet Rosée')
    expect(screen.getByText('gilet-rosee.pdf')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Photos du patron' })).getAllByRole('listitem')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.savePattern).toHaveBeenCalledTimes(1))
    const [fields, files] = api.knitting.savePattern.mock.calls[0]!
    expect(fields).toMatchObject({ title: 'Gilet Rosée', url: 'https://p.exemple/gilet' })
    expect(files).toMatchObject({ newPdf: pdf })
    expect(files.newPhotos).toHaveLength(1)
  })

  it('lien illisible : erreur lisible, la saisie reste', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readPatternLink.mockRejectedValue(new AppError('Le site a répondu par une erreur (404).'))
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/nouveau', path: '/tricot/patrons/nouveau', extraRoutes })
    await user.type(await screen.findByLabelText('Nom du patron'), 'Bonnet')
    await user.type(screen.getByLabelText('Lien'), 'https://p.exemple/perdu')
    await user.click(screen.getByRole('button', { name: 'Récupérer' }))
    expect(await screen.findByText('Le site a répondu par une erreur (404).')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Bonnet')
  })

  it('lien partagé depuis le téléphone : prérempli et lu tout de suite', async () => {
    const api = fakeApi()
    api.knitting.readPatternLink.mockResolvedValue({ url: 'https://p.exemple/gilet', title: 'Titre de la page', image: null, pdf: null })
    renderWithApp(<KnittingPatternEditPage />, {
      api,
      route: { pathname: '/tricot/patrons/nouveau', state: { patternLink: { url: 'https://p.exemple/gilet', title: 'Titre partagé' } } } as unknown as string,
      path: '/tricot/patrons/nouveau',
      extraRoutes,
    })
    expect(await screen.findByText(/Pas de PDF trouvé/)).toBeInTheDocument()
    expect(api.knitting.readPatternLink).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Lien')).toHaveValue('https://p.exemple/gilet')
    // Le titre partagé est gardé
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Titre partagé')
  })

  it('signale un enregistrement impossible et garde la saisie', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.savePattern.mockRejectedValue(new AppError('Impossible d’envoyer le PDF.'))
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/nouveau', path: '/tricot/patrons/nouveau', extraRoutes })
    await user.type(await screen.findByLabelText('Nom du patron'), 'Bonnet')
    await user.type(screen.getByLabelText('Lien'), 'https://patrons.exemple/bonnet')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible d’envoyer le PDF.')
    expect(screen.getByLabelText('Nom du patron')).toHaveValue('Bonnet')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })

  it('refuse plus de 10 photos', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getPattern.mockResolvedValue({ ...GILET, photos: Array.from({ length: 9 }, (_, i) => `u-lucile/${i}.jpg`) })
    renderWithApp(<KnittingPatternEditPage />, { api, route: '/tricot/patrons/g1/modifier', path: '/tricot/patrons/:id/modifier', extraRoutes })
    const two = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]
    await user.upload(await screen.findByLabelText(/Ajouter des photos/), two)
    expect(screen.getByRole('alert')).toHaveTextContent('10 photos au plus.')
  })
})

describe('stock de laine et bibliothèque', () => {
  it('« Quel patron ? » ouvre la fiche du patron qui convient', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const stash: StashItem[] = [{ id: 'st1', yarn: { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }, notes: '', createdAt: '2026-11-01' }]
    api.knitting.listStash.mockResolvedValue(stash)
    api.knitting.listPatterns.mockResolvedValue([GILET, PULL])
    renderWithApp(<KnittingPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Stock de laine' }))
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quel patron pour cette laine ?' })
    expect(within(dialog).getByRole('heading', { name: 'Dans ta bibliothèque' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Gilet Rosée/ })).toHaveAttribute('href', '/tricot/patrons/g1')
    // Patron déjà tricoté, sans besoins notés : à vérifier
    expect(dialog).toHaveTextContent('À vérifier (métrage ou aiguilles non notés) : Pull Bergamote.')
  })
})
