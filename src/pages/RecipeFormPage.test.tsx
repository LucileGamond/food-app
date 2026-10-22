import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { Toaster } from 'sonner'
import { AppError, type Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider } from '@/auth/AuthProvider'
import type { Recipe } from '@/lib/recipes'
import { fakeApi, fakeAuth, type FakeApi } from '@/test/fakes'
import { RecipeFormPage } from './RecipeFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
}))

function renderForm(api: FakeApi, entry: string | { pathname: string; state: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={fakeAuth()}>
          <Routes>
            <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
            <Route path="/recettes/:id/modifier" element={<RecipeFormPage />} />
            <Route path="/recettes/:id" element={<p>Fiche recette</p>} />
            <Route path="/planning" element={<p>Écran planning</p>} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  )
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('RecipeFormPage — nouvelle recette', () => {
  it('affiche les erreurs seulement après une tentative d’enregistrement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderForm(api, '/recettes/nouvelle')
    expect(await screen.findByRole('heading', { name: 'Nouvelle recette' })).toBeInTheDocument()
    expect(screen.queryByText('Le titre est obligatoire')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText('Le titre est obligatoire')).toBeInTheDocument()
    expect(screen.getByText('Ajoute au moins un ingrédient')).toBeInTheDocument()
    expect(await screen.findByText('Vérifie les champs en rouge.')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Titre'), 'Tarte')
    await user.type(screen.getByLabelText('Portions'), '0')
    await user.type(screen.getByLabelText('Lien'), 'tarte.fr')
    await user.type(screen.getByLabelText("Quantité de l'ingrédient 1"), 'deux')
    expect(screen.queryByText('Le titre est obligatoire')).not.toBeInTheDocument()
    expect(screen.getByText('Nombre de portions invalide')).toBeInTheDocument()
    expect(screen.getByText(/Lien invalide/)).toBeInTheDocument()
    expect(screen.getByText('Nom manquant')).toBeInTheDocument()
  })

  it('enregistre une recette complète avec ingrédients, tags et photos', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listTags.mockResolvedValue(['dessert', 'végé'])
    let uploads = 0
    api.photos.uploadPhoto.mockImplementation(async () => {
      uploads += 1
      return { id: `p${uploads}`, storage_path: `r/p${uploads}.jpg`, position: uploads - 1 }
    })
    renderForm(api, '/recettes/nouvelle')
    await screen.findByRole('heading', { name: 'Nouvelle recette' })

    await user.type(screen.getByLabelText('Titre'), ' Tarte aux pommes ')
    await user.type(screen.getByLabelText('Portions'), '6')
    await user.type(screen.getByLabelText('Lien'), 'https://tarte.fr')
    await user.type(screen.getByLabelText('Préparation'), 'Cuire 30 min')

    // Tags : Entrée, virgule, doublon ignoré, retour arrière, suppression
    const tags = screen.getByLabelText('Tags')
    await user.type(tags, 'Dessert{Enter}rapide,Rapide{Enter}')
    expect(within(screen.getByRole('list', { name: 'Tags choisis' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Dessert', 'rapide'])
    await user.type(tags, '{Backspace}')
    await user.type(tags, 'été')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Retirer le tag Dessert' }))
    expect(within(screen.getByRole('list', { name: 'Tags choisis' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['été'])

    // Ingrédients : saisie, ajout, réordonnancement, suppression
    await user.type(screen.getByLabelText("Quantité de l'ingrédient 1"), '1,5')
    await user.type(screen.getByLabelText("Unité de l'ingrédient 1"), 'kg')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Pommes')
    await user.click(screen.getByRole('button', { name: 'Ajouter un ingrédient' }))
    await user.type(screen.getByLabelText("Nom de l'ingrédient 2"), 'Pâte brisée')
    await user.click(screen.getByRole('button', { name: 'Ajouter un ingrédient' }))
    await user.type(screen.getByLabelText("Nom de l'ingrédient 3"), 'À retirer')
    await user.click(screen.getByRole('button', { name: "Retirer l'ingrédient 3" }))
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(2)
    expect(screen.getByRole('button', { name: "Monter l'ingrédient 1" })).toBeDisabled()
    expect(screen.getByRole('button', { name: "Descendre l'ingrédient 2" })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: "Monter l'ingrédient 2" }))
    expect(screen.getByLabelText("Nom de l'ingrédient 1")).toHaveValue('Pâte brisée')
    await user.click(screen.getByRole('button', { name: "Descendre l'ingrédient 1" }))
    expect(screen.getByLabelText("Nom de l'ingrédient 1")).toHaveValue('Pommes')

    // Photos : ajout de 3, la 3e devient principale, la 2e est retirée
    await user.upload(screen.getByLabelText('Choisir des photos'), [png('a.png'), png('b.png'), png('c.png')])
    expect(screen.getAllByTestId('photo-item')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Utiliser la photo 3 comme photo principale' }))
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 3' }))
    expect(screen.getAllByTestId('photo-item')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith({
      id: null,
      title: 'Tarte aux pommes',
      notes: 'Cuire 30 min',
      url: 'https://tarte.fr',
      servings: 6,
      tags: ['été'],
      ingredients: [
        { name: 'Pommes', quantity: 1.5, unit: 'kg' },
        { name: 'Pâte brisée', quantity: null, unit: null },
      ],
    })
    expect(api.photos.uploadPhoto).toHaveBeenCalledTimes(2)
    const sent = await Promise.all(api.photos.uploadPhoto.mock.calls.map(([, blob]) => (blob as Blob).text()))
    expect(sent).toEqual(['c.png', 'a.png'])
    expect(api.photos.reorderPhotos).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('n’envoie pas deux fois les photos si l’enregistrement est relancé après une erreur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.photos.uploadPhoto
      .mockResolvedValueOnce({ id: 'p1', storage_path: 'r/p1.jpg', position: 0 })
      .mockRejectedValueOnce(new AppError("Impossible d'envoyer la photo."))
      .mockResolvedValueOnce({ id: 'p2', storage_path: 'r/p2.jpg', position: 1 })
    renderForm(api, '/recettes/nouvelle')
    await screen.findByRole('heading', { name: 'Nouvelle recette' })
    await user.type(screen.getByLabelText('Titre'), 'Tarte')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Pommes')
    await user.upload(screen.getByLabelText('Choisir des photos'), [png('a.png'), png('b.png')])

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText("Impossible d'envoyer la photo.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'saved-recipe' }))
    expect(api.photos.uploadPhoto).toHaveBeenCalledTimes(3)
    expect(api.photos.reorderPhotos).toHaveBeenCalledWith(['p1', 'p2'])
  })
})

const EXISTING: Recipe = {
  id: 'r1',
  is_saved: true,
  title: 'Curry',
  notes: 'Étapes',
  url: null,
  servings: 2,
  tags: ['végé'],
  ingredients: [{ name: 'Riz', quantity: 200, unit: 'g' }],
  photos: [
    { id: 'p1', storage_path: 'r1/1.jpg', position: 0 },
    { id: 'p2', storage_path: 'r1/2.jpg', position: 1 },
  ],
}

describe('RecipeFormPage — modification', () => {
  it('préremplit le formulaire et supprime les photos retirées', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(EXISTING)
    api.recipes.saveRecipe.mockResolvedValue('r1')
    renderForm(api, '/recettes/r1/modifier')

    expect(await screen.findByRole('heading', { name: 'Modifier la recette' })).toBeInTheDocument()
    expect(screen.getByLabelText('Titre')).toHaveValue('Curry')
    expect(screen.getByLabelText('Portions')).toHaveValue('2')
    expect(screen.getByLabelText("Quantité de l'ingrédient 1")).toHaveValue('200')
    expect(screen.getByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', 'https://cdn.test/r1/1.jpg')

    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.photos.deletePhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', storage_path: 'r1/1.jpg' }))
    expect(api.photos.uploadPhoto).not.toHaveBeenCalled()
    expect(api.photos.reorderPhotos).not.toHaveBeenCalled()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', title: 'Curry', servings: 2, tags: ['végé'] }))
  })

  it('sauvegarde une recette ponctuelle depuis le planning puis y revient', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({
      ...EXISTING, is_saved: false, title: 'Quiche', notes: 'De mamie', url: 'https://quiche.fr', servings: null, tags: [], ingredients: [], photos: [],
    })
    renderForm(api, { pathname: '/recettes/r1/modifier', state: { from: '/planning' } })

    expect(await screen.findByRole('heading', { name: 'Sauvegarder la recette' })).toBeInTheDocument()
    expect(screen.getByLabelText('Titre')).toHaveValue('Quiche')
    expect(screen.getByLabelText('Préparation')).toHaveValue('De mamie')
    expect(screen.getByLabelText('Lien')).toHaveValue('https://quiche.fr')
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/planning')

    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Lardons')
    await user.click(screen.getByRole('button', { name: 'Sauvegarder la recette' }))
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', title: 'Quiche' }))
  })

  it('affiche « introuvable » pour une recette absente ou en erreur', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValueOnce(null)
    renderForm(api, '/recettes/absente/modifier')
    expect(await screen.findByText('Recette introuvable')).toBeInTheDocument()
  })

  it('affiche l’erreur de chargement', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderForm(api, '/recettes/r1/modifier')
    expect(await screen.findByText('Hors ligne')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Recette introuvable')).toBeInTheDocument())
  })
})
