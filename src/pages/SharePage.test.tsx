import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, useLocation } from 'react-router-dom'
import { AppError } from '@/api'
import { takeSharedPhotos } from '@/lib/sharedPhotos'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { SharePage } from './SharePage'

vi.mock('@/lib/sharedPhotos', () => ({ takeSharedPhotos: vi.fn(async () => [] as File[]), handOffPhotos: vi.fn() }))
vi.mock('@/lib/image', () => ({
  compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  cropImage: vi.fn(async (file: File) => new File([file.name], 'plat.jpg', { type: 'image/jpeg' })),
}))

function Where({ name }: { name: string }) {
  const location = useLocation()
  return (
    <p>
      {name} {location.search} {JSON.stringify(location.state)}
    </p>
  )
}

function renderShare(query: string, api = fakeApi()) {
  const result = renderWithApp(<SharePage />, {
    api,
    route: `/partage${query}`,
    path: '/partage',
    extraRoutes: (
      <>
        <Route path="/planning" element={<Where name="Écran planning" />} />
        <Route path="/recettes" element={<Where name="Écran recettes" />} />
        <Route path="/recettes/nouvelle" element={<Where name="Nouvelle recette" />} />
        <Route path="/recettes/:id" element={<Where name="Fiche recette" />} />
      </>
    ),
  })
  return { ...result, user: userEvent.setup() }
}

const LINK = '?url=https%3A%2F%2Fwww.marmiton.org%2Frecettes%2Fcrepes.aspx&title=P%C3%A2te%20%C3%A0%20cr%C3%AApes'

describe('SharePage (partage depuis le téléphone)', () => {
  it('propose quoi faire du lien partagé, sans rien analyser', async () => {
    const { api } = renderShare(LINK)
    expect(await screen.findByRole('heading', { name: 'Recette partagée' })).toBeInTheDocument()
    expect(screen.getByText('Pâte à crêpes')).toBeInTheDocument()
    const choices = screen.getByRole('group', { name: 'Que faire de cette recette ?' })
    expect(within(choices).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Enregistrer directement', 'Mettre de côté', 'À planifier'])
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
    expect(api.inbox.addItem).not.toHaveBeenCalled()
  })

  it('« À planifier » : ajouté à la liste du planning avec le titre partagé', async () => {
    const { api, user } = renderShare(LINK)
    await user.click(await screen.findByRole('button', { name: 'À planifier' }))
    expect(await screen.findByText(/^Écran planning/)).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://www.marmiton.org/recettes/crepes.aspx', title: 'Pâte à crêpes', list: 'plan' })
    expect(await screen.findByText('Ajoutée à « À planifier »')).toBeInTheDocument()
  })

  it('« Mettre de côté » : ajouté à « De côté », ouvre les recettes ; titre de la page récupéré si besoin', async () => {
    const api = fakeApi()
    api.inbox.fetchTitle.mockResolvedValue('Tarte tatin')
    const { user } = renderShare('?text=Regarde%20%3A%20https%3A%2F%2Fcuisine.fr%2Ftatin', api)
    await user.click(await screen.findByRole('button', { name: 'Mettre de côté' }))
    expect(await screen.findByText(/^Écran recettes/)).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://cuisine.fr/tatin', title: 'cuisine.fr', list: 'aside' })
    await vi.waitFor(() => expect(api.inbox.renameItem).toHaveBeenCalledWith('new-item', 'Tarte tatin', 'cuisine.fr'))
  })

  it('« Enregistrer directement » : analysé, enregistré, puis la fiche s’ouvre', async () => {
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({
      recipe: { title: 'Crêpes', servings: 4, ingredients: [{ name: 'farine', quantity: 250, unit: 'g', note: null }], steps: '1. Mélanger.', tags: [] },
      source: 'structured',
      image: null,
    })
    api.recipes.saveRecipe.mockResolvedValue('r7')
    const { user } = renderShare(LINK, api)
    await user.click(await screen.findByRole('button', { name: 'Enregistrer directement' }))
    expect(await screen.findByText(/^Fiche recette/)).toBeInTheDocument()
    expect(await screen.findByText('Recette enregistrée : Crêpes')).toBeInTheDocument()
  })

  it('recette incomplète ou « Préremplir » : le formulaire s’ouvre avec le lien à analyser', async () => {
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({ recipe: { title: '', servings: null, ingredients: [], steps: '', tags: [] }, source: 'text', image: null })
    const { user } = renderShare(LINK, api)
    await user.click(await screen.findByRole('button', { name: 'Enregistrer directement' }))
    expect(await screen.findByText(/^Nouvelle recette .*"importUrl":"https:\/\/www\.marmiton\.org\/recettes\/crepes\.aspx"/)).toBeInTheDocument()
    expect(screen.getByText(/Recette incomplète/)).toBeInTheDocument()
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()
  })

  it('une erreur reste affichée sur l’écran de choix', async () => {
    const api = fakeApi()
    api.inbox.addItem.mockRejectedValueOnce(new AppError('Déjà dans « À planifier » ou « De côté ».'))
    const { user } = renderShare(LINK, api)
    await user.click(await screen.findByRole('button', { name: 'Mettre de côté' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Déjà dans « À planifier » ou « De côté ».')
    expect(screen.getByRole('heading', { name: 'Recette partagée' })).toBeInTheDocument()
  })

  it('des photos partagées : aperçu et mêmes choix ; « Préremplir » les passe au formulaire', async () => {
    vi.mocked(takeSharedPhotos).mockResolvedValueOnce([new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })])
    URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`)
    URL.revokeObjectURL = vi.fn()
    const { api, user } = renderShare('?photos=partage')
    const photos = await screen.findByRole('list', { name: 'Photos partagées' })
    expect(within(photos).getAllByRole('img')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Mettre de côté' }))
    expect(await screen.findByText(/^Écran recettes/)).toBeInTheDocument()
    expect(api.inbox.uploadPhotos).toHaveBeenCalled()
    expect(api.inbox.addItem).toHaveBeenCalledWith(expect.objectContaining({ photos: ['pending/photo-1.jpg', 'pending/photo-2.jpg'], list: 'aside' }))
  })

  it('aucune photo reçue : le formulaire s’ouvre', async () => {
    renderShare('?photos=partage')
    expect(await screen.findByText(/^Nouvelle recette/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune photo reçue/)).toBeInTheDocument()
  })

  it('un texte sans lien est une idée, ajoutée à « À planifier » ; un partage vide est signalé', async () => {
    const { api } = renderShare('?text=Raclette%20samedi')
    expect(await screen.findByText(/^Écran planning/)).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ title: 'Raclette samedi' })
  })

  it('signale un partage vide, ou une idée refusée', async () => {
    renderShare('')
    expect(await screen.findByText('Rien à ajouter : le partage ne contenait ni lien ni texte')).toBeInTheDocument()
    const api = fakeApi()
    api.inbox.addItem.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderShare('?text=Raclette', api)
    expect(await screen.findByText('Hors ligne')).toBeInTheDocument()
  })
})
