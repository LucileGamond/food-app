import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { RecipeImport } from '@/lib/recipes'
import { scanStore } from '@/lib/scanStore'
import { fakeApi, renderWithApp, type FakeApi } from '@/test/fakes'
import { BookScanPage } from './BookScanPage'

const camera = vi.hoisted(() => ({
  analysisFrame: vi.fn(() => null),
  capture: vi.fn(async () => [new Blob(['page'], { type: 'image/jpeg' })]),
  isDoublePage: vi.fn(() => false),
  hasTorch: true,
  setTorch: vi.fn(async () => undefined),
  zoom: { min: 1, max: 5, step: 0.5, value: 1 },
  setZoom: vi.fn(async () => undefined),
  stop: vi.fn(),
}))
const shutter = vi.hoisted(() => vi.fn())

vi.mock('@/lib/camera', () => ({
  openCamera: vi.fn(async () => camera),
  canScanBooks: () => true,
  createShutterFeedback: () => shutter,
}))

const read = (title: string): RecipeImport => ({
  recipe: { title, servings: 4, ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null }], steps: '1. Mélanger.', tags: [] },
  source: 'photo',
  image: null,
})

function setup(api: FakeApi = fakeApi()) {
  api.recipes.listSources.mockResolvedValue(['Pâtisserie maison'])
  api.recipes.listSavedSummaries.mockResolvedValue([])
  api.recipes.listTags.mockResolvedValue(['dessert'])
  api.recipes.saveRecipe.mockImplementation(async () => `r${api.recipes.saveRecipe.mock.calls.length}`)
  const view = renderWithApp(<BookScanPage />, {
    api,
    route: '/recettes/scanner',
    path: '/recettes/scanner',
    extraRoutes: <Route path="/recettes" element={<p>Liste des recettes</p>} />,
  })
  return { api, view, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) }
}

/** Laisse passer le délai d'annulation (3 s) : les photos partent à la lecture. */
const wait = (ms = 3100) => act(() => vi.advanceTimersByTimeAsync(ms))

async function open(user: ReturnType<typeof userEvent.setup>, { multi = false } = {}) {
  await user.type(await screen.findByLabelText('Livre'), 'Pâtisserie maison')
  if (multi) await user.click(screen.getByRole('checkbox', { name: 'Recettes sur plusieurs photos' }))
  await user.click(screen.getByRole('button', { name: 'Ouvrir la caméra' }))
  // Le bouton reste désactivé tant que la caméra s'ouvre : un clic trop tôt ne lancerait rien (machine chargée).
  const launch = await screen.findByRole('button', { name: 'Lancer le scan' })
  await waitFor(() => expect(launch).toBeEnabled())
  await user.click(launch)
  await screen.findByText('Tiens le téléphone immobile au-dessus de la page')
}

const results = () => screen.getByRole('list', { name: 'Recettes scannées' })

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await scanStore().clear()
  camera.capture.mockClear()
  shutter.mockClear()
})
afterEach(() => vi.useRealTimers())

// Parcours longs (caméra, délai d'annulation, lecture) : les 5 s par défaut ne suffisent pas sous couverture et en parallèle.
describe('BookScanPage', { timeout: 20_000 }, () => {
  it('exige le livre avant d’ouvrir la caméra', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Ouvrir la caméra' }))
    expect(screen.getByText('Indique le livre')).toBeInTheDocument()
    expect(screen.queryByLabelText('Aperçu de la caméra')).not.toBeInTheDocument()
  })

  it('1 photo = 1 recette : chaque photo est lue après le délai d’annulation et enregistrée avec le livre', async () => {
    const { user, api } = setup()
    api.recipes.importFromPhotos.mockResolvedValueOnce(read('Tarte au citron')).mockRejectedValueOnce(new AppError('Pas une recette', 'import-422'))
    await open(user)

    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await screen.findByTestId('batch-item')
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await waitFor(() => expect(shutter).toHaveBeenCalledTimes(2))
    expect(screen.getByAltText('Dernière photo')).toBeInTheDocument()
    expect(within(results()).getAllByTestId('batch-item')).toHaveLength(2)
    expect(api.recipes.importFromPhotos).not.toHaveBeenCalled()

    await wait()
    await waitFor(() => expect(within(results()).getByRole('link', { name: 'Tarte au citron' })).toBeInTheDocument())
    expect(api.recipes.importFromPhotos).toHaveBeenCalledWith([expect.any(Blob)], ['dessert'])
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ source: 'Pâtisserie maison' }))
    await waitFor(() => expect(screen.getByText('2 pages · 1 enregistrée · 1 sans recette')).toBeInTheDocument())
    // Pendant la prise, pas de relecture proposée : c'est au récapitulatif.
    expect(screen.queryByRole('button', { name: /C’est une recette/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    expect(await screen.findByRole('heading', { name: 'Scan terminé' })).toBeInTheDocument()
    expect(camera.stop).toHaveBeenCalled()
    await waitFor(() => expect(api.recipes.listLinkable).toHaveBeenCalled())

    // Page ignorée : miniature et « C'est une recette », relue en insistant (une seule fois).
    expect(await screen.findByAltText('Photo : Photo 2')).toBeInTheDocument()
    api.recipes.importFromPhotos.mockResolvedValueOnce(read('Galettes'))
    await user.click(screen.getByRole('button', { name: 'C’est une recette : relire' }))
    await waitFor(() => expect(within(results()).getByRole('link', { name: 'Galettes' })).toBeInTheDocument())
    expect(api.recipes.importFromPhotos).toHaveBeenLastCalledWith([expect.any(Blob)], ['dessert'], { insist: true })
    expect(screen.queryByRole('button', { name: /C’est une recette/ })).not.toBeInTheDocument()
  })

  it('annule la dernière photo tant qu’elle n’est pas partie', async () => {
    const { user, api } = setup()
    api.recipes.importFromPhotos.mockResolvedValue(read('Clafoutis'))
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    // La photo est rangée sur le téléphone (asynchrone) avant d'apparaître.
    await screen.findByTestId('batch-item')
    await user.click(screen.getByRole('button', { name: 'Annuler la dernière' }))
    await waitFor(() => expect(screen.queryAllByTestId('batch-item')).toHaveLength(0))
    expect(screen.getByText('0 page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await screen.findByTestId('batch-item')
    await wait()
    await waitFor(() => expect(api.recipes.importFromPhotos).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Annuler la dernière' }))
    expect(await screen.findByText('Trop tard : cette photo est déjà en lecture.')).toBeInTheDocument()
  })

  it('recettes sur plusieurs photos : les pages sont lues ensemble à « Nouvelle recette »', async () => {
    const { user, api } = setup()
    api.recipes.importFromPhotos.mockResolvedValue(read('Brioche'))
    await open(user, { multi: true })
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await screen.findByText('Recette 1 · 1 page')
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    expect(await within(results()).findByText('Recette 1 · 2 pages')).toBeInTheDocument()
    expect(within(results()).getByText(/Prends les pages suivantes/)).toBeInTheDocument()
    await wait()
    expect(api.recipes.importFromPhotos).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Nouvelle recette' }))
    await waitFor(() => expect(api.recipes.importFromPhotos).toHaveBeenCalledWith([expect.any(Blob), expect.any(Blob)], ['dessert']))
    // Aucune image analysée (fausse caméra) : rien ne dit que la page est encore là, la recette suivante part de zéro.
    expect(within(results()).getAllByTestId('batch-item')).toHaveLength(1)
  })

  it('reprend un scan interrompu, et l’abandonne sur demande', async () => {
    const { user, view, api } = setup()
    api.recipes.importFromPhotos.mockResolvedValue(read('Madeleines'))
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await screen.findByTestId('batch-item')
    await act(async () => undefined)
    view.unmount()

    const again = setup()
    again.api.recipes.importFromPhotos.mockResolvedValue(read('Madeleines'))
    expect(await screen.findByText('Reprendre le scan de « Pâtisserie maison »')).toBeInTheDocument()
    expect(screen.getByText('1 page · 1 à lire')).toBeInTheDocument()
    await again.user.click(screen.getByRole('button', { name: 'Reprendre' }))
    await wait()
    await waitFor(() => expect(within(results()).getByRole('link', { name: 'Madeleines' })).toBeInTheDocument())
    again.view.unmount()

    const third = setup()
    await third.user.click(await screen.findByRole('button', { name: 'Abandonner' }))
    expect(await screen.findByLabelText('Livre')).toBeInTheDocument()
    expect(await scanStore().load()).toBeNull()
  })

  it('relit les erreurs et commence un autre livre une fois tout lu', async () => {
    const { user, api } = setup()
    api.recipes.importFromPhotos.mockRejectedValueOnce(new AppError('Le service d’analyse est surchargé.', 'import-503')).mockResolvedValueOnce(read('Financiers'))
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Prendre la photo' }))
    await screen.findByTestId('batch-item')
    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer les erreurs' })).toBeInTheDocument())
    expect(screen.getByText(/Le service d’analyse est surchargé/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Réessayer les erreurs' }))
    await waitFor(() => expect(within(results()).getByRole('link', { name: 'Financiers' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Scanner un autre livre' }))
    expect(await screen.findByLabelText('Livre')).toHaveValue('')
  })

  it('réglage avant le scan : aperçu, zoom et lampe, sans photo ni bouton de prise', async () => {
    const { user } = setup()
    await user.type(await screen.findByLabelText('Livre'), 'Pâtisserie maison')
    await user.click(screen.getByRole('button', { name: 'Ouvrir la caméra' }))
    expect(await screen.findByText(/Règle le téléphone/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prendre la photo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '2.5' } })
    expect(camera.setZoom).toHaveBeenCalledWith(2.5)
    expect(screen.getByText('×2.5')).toBeInTheDocument()
    await wait(2000)
    expect(camera.capture).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Lancer le scan' }))
    expect(screen.getByRole('button', { name: 'Prendre la photo' })).toBeInTheDocument()
  })

  it('lampe, pause et caméra refusée', async () => {
    const { user } = setup()
    await open(user)
    await user.click(screen.getByRole('button', { name: 'Lampe' }))
    expect(camera.setTorch).toHaveBeenCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('status')).toHaveTextContent('En pause')
    await user.click(screen.getByRole('button', { name: 'Reprendre' }))
    expect(screen.getByRole('status')).toHaveTextContent('Tiens le téléphone immobile')
  })
})
