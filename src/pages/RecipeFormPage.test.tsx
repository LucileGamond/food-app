import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { Toaster } from 'sonner'
import { AppError, DuplicateRecipeUrlError, type Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { SettingsProvider } from '@/app/SettingsContext'
import { AuthProvider } from '@/auth/AuthProvider'
import type { InboxItem } from '@/lib/inbox'
import type { Recipe, RecipeImport } from '@/lib/recipes'
import { fakeApi, fakeAuth, type FakeApi } from '@/test/fakes'
import { RecipeFormPage } from './RecipeFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  cropImage: vi.fn(async (file: File) => new File([file.name], 'plat.jpg', { type: 'image/jpeg' })),
}))

function renderForm(api: FakeApi, entry: string | { pathname: string; state: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={fakeAuth()}>
          <SettingsProvider>
          <Routes>
            <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
            <Route path="/recettes/:id/modifier" element={<RecipeFormPage />} />
            <Route path="/recettes/:id" element={<p>Fiche recette</p>} />
            <Route path="/planning" element={<p>Écran planning</p>} />
            <Route path="/recettes" element={<p>Écran recettes</p>} />
          </Routes>
          <Toaster />
        </SettingsProvider>
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
    expect(await screen.findByText('Vérifie les champs en rouge')).toBeInTheDocument()
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

  // Test long (saisie complète et 3 photos) : délai élargi pour la CI et les machines chargées.
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
    await user.type(screen.getByLabelText('Étapes'), 'Cuire 30 min')

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
    await user.selectOptions(screen.getByLabelText("Unité de l'ingrédient 1"), 'kg')
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
      source: null,
      sourcePage: null,
      nutrition: null,
      prepMinutes: null,
      restMinutes: null,
      cookMinutes: null,
      ingredients: [
        { name: 'Pommes', quantity: 1.5, unit: 'kg', note: null, section: null },
        { name: 'Pâte brisée', quantity: null, unit: null, note: null, section: null },
      ],
    })
    expect(api.photos.uploadPhoto).toHaveBeenCalledTimes(2)
    const sent = await Promise.all(api.photos.uploadPhoto.mock.calls.map(([, blob]) => (blob as Blob).text()))
    expect(sent).toEqual(['c.png', 'a.png'])
    expect(api.photos.reorderPhotos).toHaveBeenCalledWith(['p1', 'p2'])
  }, 15000)

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

  it('sur téléphone, prend une photo avec l’appareil (arrière) ; pas de bouton sur ordinateur', async () => {
    const user = userEvent.setup()
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' }))
    vi.stubGlobal('matchMedia', matchMedia)
    try {
      renderForm(fakeApi(), '/recettes/nouvelle')
      await user.click(await screen.findByRole('button', { name: 'Prendre une photo' }))
      const camera = screen.getByLabelText('Prendre une photo avec l’appareil')
      expect(camera).toHaveAttribute('capture', 'environment')
      await user.upload(camera, png('photo.png'))
      expect(screen.getAllByTestId('photo-item')).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pas de bouton « Prendre une photo » sur ordinateur', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    try {
      renderForm(fakeApi(), '/recettes/nouvelle')
      await screen.findByRole('button', { name: 'Ajouter des photos' })
      expect(screen.queryByRole('button', { name: 'Prendre une photo' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
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
  ingredients: [{ name: 'Riz', quantity: 200, unit: 'g', note: null }],
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

    expect(await screen.findByRole('heading', { name: 'Enregistrer la recette' })).toBeInTheDocument()
    expect(screen.getByLabelText('Titre')).toHaveValue('Quiche')
    expect(screen.getByLabelText('Étapes')).toHaveValue('De mamie')
    expect(screen.getByLabelText('Lien')).toHaveValue('https://quiche.fr')
    expect(screen.getAllByTestId('ingredient-row')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/planning')

    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Lardons')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la recette' }))
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

describe('RecipeFormPage — préremplissage depuis un lien', () => {
  const IMPORTED = {
    recipe: {
      title: 'Pâte à crêpes',
      servings: 4,
      ingredients: [
        { name: 'farine', quantity: 250, unit: 'g', note: null },
        { name: 'œufs', quantity: 3, unit: null, note: null },
      ],
      steps: '1. Mélanger.\n2. Cuire.',
      tags: ['Dessert'],
    },
    source: 'structured' as const,
    image: { data: btoa('jpeg'), type: 'image/jpeg' },
  }

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('remplit le formulaire, ajoute la photo, puis enregistre', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listTags.mockResolvedValue(['dessert', 'végé'])
    const pending = deferred<typeof IMPORTED>()
    api.recipes.importFromUrl.mockReturnValueOnce(pending.promise)
    api.recipes.saveRecipe.mockResolvedValue('r9')
    renderForm(api, '/recettes/nouvelle')
    await screen.findByRole('heading', { name: 'Nouvelle recette' })
    await waitFor(() => expect(api.recipes.listTags).toHaveBeenCalled())

    const input = screen.getByLabelText('Lien de la recette à importer')
    await user.type(input, 'https://www.marmiton.org/recettes/crepes.aspx')
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(api.recipes.importFromUrl).toHaveBeenCalledWith('https://www.marmiton.org/recettes/crepes.aspx', ['dessert', 'végé'])
    expect(screen.getByRole('button', { name: 'Analyse…' })).toBeDisabled()
    expect(input).toBeDisabled()
    expect(screen.getByText(/Lecture de la page/)).toBeInTheDocument()

    pending.resolve(IMPORTED)
    expect(await screen.findByRole('status')).toHaveTextContent("Recette préremplie depuis marmiton.org. Vérifie les quantités avant d'enregistrer.")
    expect(screen.getByLabelText('Titre')).toHaveValue('Pâte à crêpes')
    expect(screen.getByLabelText('Portions')).toHaveValue('4')
    expect(screen.getByLabelText('Lien')).toHaveValue('https://www.marmiton.org/recettes/crepes.aspx')
    expect(screen.getByLabelText('Étapes')).toHaveValue('1. Mélanger.\n2. Cuire.')
    expect(screen.getByLabelText("Nom de l'ingrédient 2")).toHaveValue('œufs')
    expect(screen.getByLabelText("Quantité de l'ingrédient 1")).toHaveValue('250')
    expect(screen.getAllByTestId('photo-item')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pâte à crêpes',
        servings: 4,
        url: 'https://www.marmiton.org/recettes/crepes.aspx',
        tags: ['Dessert'],
        ingredients: [
          { name: 'farine', quantity: 250, unit: 'g', note: null, section: null },
          { name: 'œufs', quantity: 3, unit: null, note: null, section: null },
        ],
      }),
    )
    expect(api.photos.uploadPhoto).toHaveBeenCalledTimes(1)
  })

  it('ramène les unités importées à la liste et garde les précisions', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({
      ...IMPORTED,
      image: null,
      recipe: {
        ...IMPORTED.recipe,
        ingredients: [
          { name: 'sucre', quantity: 1, unit: 'cuillères à soupe bombées', note: null },
          { name: 'rhum', quantity: 1, unit: 'shot', note: null },
          { name: 'ail', quantity: 2, unit: 'gousse', note: 'écrasées', section: null },
        ],
      },
    })
    api.recipes.saveRecipe.mockResolvedValue('r9')
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://exemple.fr/r{Enter}')
    await screen.findByRole('status')
    expect(screen.getByLabelText("Unité de l'ingrédient 1")).toHaveValue('c. à s.')
    expect(screen.getByLabelText("Précision de l'ingrédient 1")).toHaveValue('bombées')
    expect(screen.getByLabelText("Unité de l'ingrédient 2")).toHaveValue('')
    expect(screen.getByLabelText("Quantité de l'ingrédient 2")).toHaveValue('')
    expect(screen.getByLabelText("Précision de l'ingrédient 2")).toHaveValue('1 shot')
    expect(screen.getByLabelText("Précision de l'ingrédient 3")).toHaveValue('écrasées')

    await user.selectOptions(screen.getByLabelText("Unité de l'ingrédient 2"), 'verre')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: [
          { name: 'sucre', quantity: 1, unit: 'c. à s.', note: 'bombées', section: null },
          { name: 'rhum', quantity: null, unit: 'verre', note: '1 shot', section: null },
          { name: 'ail', quantity: 2, unit: 'gousse', note: 'écrasées', section: null },
        ],
      }),
    )
  })

  it('Instagram : la légende collée est analysée avec le lien de la publication', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromText.mockResolvedValue({ ...IMPORTED, source: 'text', image: null, recipe: { ...IMPORTED.recipe, title: 'Barres framboise' } })
    renderForm(api, '/recettes/nouvelle')
    const reel = 'https://www.instagram.com/reel/DfIBDEIIwic/'
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), reel)
    const caption = screen.getByLabelText('Légende du reel')
    expect(screen.getByText(/ni lire ni copier ses légendes/)).toBeInTheDocument()

    // Sans légende : demandée, rien n'est envoyé.
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Colle la légende du reel ci-dessous.')
    expect(caption).toHaveFocus()
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()

    await user.type(caption, 'Barres framboise : 100 g de flocons, 200 g de framboises…')
    await user.click(screen.getByRole('button', { name: 'Préremplir avec la légende' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie depuis la légende')
    expect(api.recipes.importFromText).toHaveBeenCalledWith('Barres framboise : 100 g de flocons, 200 g de framboises…', reel, [])
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Titre')).toHaveValue('Barres framboise')
    expect(screen.getByLabelText('Lien')).toHaveValue(reel)
  })

  it('Instagram : légende déjà enregistrée, ou sans recette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.findSavedByUrl.mockResolvedValueOnce({ id: 'r9', title: 'Barres framboise' })
    api.recipes.importFromText.mockRejectedValueOnce(new AppError('Aucune recette trouvée dans ce texte.'))
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://www.instagram.com/reel/abc/')
    await user.type(screen.getByLabelText('Légende du reel'), 'Une légende assez longue pour être lue.')
    await user.click(screen.getByRole('button', { name: 'Préremplir avec la légende' }))
    // Déjà enregistrée : le formulaire le signale, la légende n'est pas analysée.
    expect((await screen.findAllByText(/Barres framboise/)).length).toBeGreaterThan(0)
    expect(api.recipes.importFromText).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Préremplir avec la légende' }))
    expect(await screen.findByText('Aucune recette trouvée dans ce texte.')).toBeInTheDocument()
  })

  it('YouTube : message d’attente adapté, et page où la recette a été trouvée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const pending = deferred<RecipeImport>()
    api.recipes.importFromUrl.mockReturnValueOnce(pending.promise)
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://www.youtube.com/shorts/eBtsvbgDBD8')
    expect(screen.queryByLabelText('Légende du reel')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(await screen.findByText(/Lecture de la vidéo/)).toBeInTheDocument()
    pending.resolve({ ...IMPORTED, source: 'video', image: null, foundUrl: 'https://www.sacreeplanche.fr/gaufres/', recipe: { ...IMPORTED.recipe, source: 'sacreeplanche.fr' } })
    expect(await screen.findByRole('status')).toHaveTextContent('sacreeplanche.fr (recette de la vidéo trouvée en ligne)')
    expect(screen.getByLabelText('Lien')).toHaveValue('https://www.youtube.com/shorts/eBtsvbgDBD8')
  })

  it('lance l’import avec Entrée sans enregistrer la recette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({ ...IMPORTED, image: null })
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://exemple.fr/r{Enter}')
    expect(await screen.findByRole('status')).toHaveTextContent('exemple.fr')
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()
    expect(screen.queryAllByTestId('photo-item')).toHaveLength(0)
  })

  it('refuse un lien incomplet et affiche l’erreur du service', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderForm(api, '/recettes/nouvelle')
    const input = await screen.findByLabelText('Lien de la recette à importer')
    await user.type(input, 'marmiton.org')
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Colle un lien complet (https://…).')
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'https://exemple.fr/blog')
    api.recipes.importFromUrl.mockRejectedValueOnce(new AppError('Aucune recette trouvée sur cette page.'))
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune recette trouvée sur cette page.')
    expect(screen.getByLabelText('Titre')).toHaveValue('')
    expect(input).toBeEnabled()
  })

  it('demande confirmation avant de remplacer une saisie ; garde les photos existantes', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({
      ...EXISTING,
      is_saved: false,
      title: 'Quiche',
      notes: 'De mamie',
      url: 'https://quiche.fr/r',
      servings: null,
      tags: [],
      ingredients: [],
    })
    api.recipes.importFromUrl.mockResolvedValue({ ...IMPORTED, recipe: { ...IMPORTED.recipe, title: 'Quiche lorraine' } })
    renderForm(api, { pathname: '/recettes/r1/modifier', state: { from: '/planning' } })

    // Le lien de la recette ponctuelle est déjà proposé
    expect(await screen.findByLabelText('Lien de la recette à importer')).toHaveValue('https://quiche.fr/r')
    const photosBefore = screen.getAllByTestId('photo-item').length
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remplacer le contenu du formulaire ?' })
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }))
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Étapes')).toHaveValue('De mamie')

    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remplacer' }))
    expect(await screen.findByRole('status')).toHaveTextContent('quiche.fr')
    expect(screen.getByLabelText('Titre')).toHaveValue('Quiche lorraine')
    expect(screen.getByLabelText('Étapes')).toHaveValue('1. Mélanger.\n2. Cuire.')
    // La photo de la page n'est ajoutée que s'il n'y en a aucune
    expect(screen.getAllByTestId('photo-item')).toHaveLength(photosBefore)
  })

  it('n’est pas proposé en modification d’une recette sauvegardée', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(EXISTING)
    renderForm(api, '/recettes/r1/modifier')
    await screen.findByRole('heading', { name: 'Modifier la recette' })
    expect(screen.queryByLabelText('Lien de la recette à importer')).not.toBeInTheDocument()
  })
})

describe('RecipeFormPage — lien déjà enregistré', () => {
  const EXISTING_RECIPE = { id: 'r-curry', title: 'Curry maison' }

  it('signale un lien déjà utilisé et bloque l’enregistrement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.findSavedByUrl.mockImplementation(async (url: string) => (url === 'https://exemple.fr/curry' ? EXISTING_RECIPE : null))
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Titre'), 'Curry')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Riz')
    await user.type(screen.getByLabelText('Lien', { selector: '#recipe-url' }), 'https://exemple.fr/curry')

    const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(alert).toHaveTextContent('Cette recette est déjà enregistrée : « Curry maison »')
    expect(within(alert).getByRole('link', { name: 'Ouvrir « Curry maison »' })).toHaveAttribute('href', '/recettes/r-curry')
    expect(within(alert).queryByRole('button', { name: /dans le planning/ })).not.toBeInTheDocument()
    expect(screen.getByText('Lien déjà utilisé par une autre recette')).toBeInTheDocument()
    expect(api.recipes.findSavedByUrl).toHaveBeenLastCalledWith('https://exemple.fr/curry', null)

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Cette recette est déjà enregistrée : « Curry maison ».')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()

    // Un autre lien fait disparaître l'avertissement
    await user.type(screen.getByLabelText('Lien', { selector: '#recipe-url' }), '-bis')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument(), { timeout: 2000 })
  })

  it('n’analyse pas une page déjà enregistrée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.findSavedByUrl.mockResolvedValue(EXISTING_RECIPE)
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://exemple.fr/curry')
    await user.click(screen.getByRole('button', { name: 'Préremplir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('« Curry maison »')
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
    // Pas de message d'erreur en double dans l'encadré d'import
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('propose d’utiliser la recette existante dans le planning', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({
      ...EXISTING,
      is_saved: false,
      title: 'Curry du lundi',
      notes: null,
      url: 'https://www.exemple.fr/curry/',
      servings: null,
      tags: [],
      ingredients: [],
      photos: [],
    })
    api.recipes.findSavedByUrl.mockResolvedValue(EXISTING_RECIPE)
    renderForm(api, { pathname: '/recettes/r1/modifier', state: { from: '/planning' } })

    const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
    expect(alert).toHaveTextContent('Le planning peut utiliser cette recette à la place de la recette ponctuelle.')
    await user.click(within(alert).getByRole('button', { name: 'Utiliser « Curry maison » dans le planning' }))
    expect(api.recipes.replaceAdhocWithSaved).toHaveBeenCalledWith('r1', 'r-curry')
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
    expect(await screen.findByText('Le planning utilise maintenant « Curry maison »')).toBeInTheDocument()
  })

  it('reste sur le formulaire si la bascule échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({ ...EXISTING, is_saved: false, url: 'https://exemple.fr/curry', ingredients: [], photos: [] })
    api.recipes.findSavedByUrl.mockResolvedValue(EXISTING_RECIPE)
    api.recipes.replaceAdhocWithSaved.mockRejectedValueOnce(new AppError('Impossible de remplacer la recette.'))
    renderForm(api, '/recettes/r1/modifier')
    const alert = await screen.findByRole('alert', {}, { timeout: 2000 })
    await user.click(within(alert).getByRole('button', { name: /dans le planning/ }))
    expect(await screen.findByText('Impossible de remplacer la recette.')).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: /dans le planning/ })).toBeEnabled()
  })

  it('affiche le doublon détecté par la base au moment d’enregistrer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.saveRecipe.mockRejectedValueOnce(new DuplicateRecipeUrlError(EXISTING_RECIPE))
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Titre'), 'Curry')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'Riz')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('« Curry maison »')
  })
})

describe('RecipeFormPage — choix rapides et recettes en attente', () => {
  const READ = {
    recipe: { title: 'Curry coco', servings: 2, ingredients: [{ name: 'lait de coco', quantity: 40, unit: 'cl', note: null }], steps: '1. Mijoter.', tags: [] },
    source: 'structured' as const,
    image: null,
  }
  const inboxItem = (extra: Partial<InboxItem>): InboxItem => ({ id: 'i1', title: 'Curry du reel', url: null, recipe_id: null, created_at: '2026-11-01T10:00:00Z', ...extra })

  it('nouvelle recette : le lien collé peut être mis de côté sans être analysé', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderForm(api, '/recettes/nouvelle')
    const choices = await screen.findByRole('group', { name: 'Que faire de cette recette ?' })
    expect(within(choices).getByRole('button', { name: 'Mettre de côté' })).toBeDisabled()
    await user.type(screen.getByLabelText('Lien de la recette à importer'), 'https://cuisine.fr/curry')
    await user.click(within(choices).getByRole('button', { name: 'Mettre de côté' }))
    expect(await screen.findByText('Écran recettes')).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://cuisine.fr/curry', title: 'cuisine.fr', list: 'aside' })
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
  })

  it('nouvelle recette : « Enregistrer directement » incomplet laisse un message dans la carte', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({ ...READ, recipe: { ...READ.recipe, title: '' } })
    renderForm(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Lien de la recette à importer'), 'https://cuisine.fr/curry')
    await user.click(screen.getByRole('button', { name: 'Enregistrer directement' }))
    expect(await screen.findByText(/Recette incomplète .* préremplis-la pour la vérifier/)).toBeInTheDocument()
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()
  })

  it('ouvert avec un lien partagé : prérempli tout de suite', async () => {
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue(READ)
    api.recipes.listTags.mockResolvedValue(['dessert', 'végé'])
    renderForm(api, { pathname: '/recettes/nouvelle', state: { importUrl: 'https://cuisine.fr/curry' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie depuis cuisine.fr')
    expect(screen.getByLabelText('Titre')).toHaveValue('Curry coco')
    // Lancé avant le chargement des tags du formulaire : la lecture reçoit quand même les tags existants.
    expect(api.recipes.importFromUrl).toHaveBeenCalledWith('https://cuisine.fr/curry', ['dessert', 'végé'])
  })

  it('élément « De côté » avec un lien : prérempli, puis la liste est mise à jour à l’enregistrement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue(READ)
    api.recipes.saveRecipe.mockResolvedValue('r-curry')
    renderForm(api, { pathname: '/recettes/nouvelle', state: { fromInbox: inboxItem({ url: 'https://cuisine.fr/curry', list: 'aside' }) } })
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie')
    // Rien d'autre à choisir : on vient de la liste pour enregistrer.
    expect(screen.queryByRole('group', { name: 'Que faire de cette recette ?' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.inbox.resolveItem).toHaveBeenCalledWith('i1', 'r-curry')
  })

  it('élément avec photos : relues depuis le stockage puis lues ; erreur de liste signalée sans bloquer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromPhotos.mockResolvedValue({ ...READ, source: 'photo' })
    api.recipes.saveRecipe.mockResolvedValue('r-curry')
    api.inbox.resolveItem.mockRejectedValueOnce(new AppError('La recette est enregistrée, mais la liste n’a pas pu être mise à jour.'))
    renderForm(api, { pathname: '/recettes/nouvelle', state: { fromInbox: inboxItem({ title: 'Photos du 1 nov.', photos: ['pending/a.jpg', 'pending/b.jpg'] }) } })
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie depuis tes photos')
    expect(api.inbox.downloadPhotos).toHaveBeenCalledWith(['pending/a.jpg', 'pending/b.jpg'])
    expect(api.recipes.importFromPhotos.mock.calls[0]![0]).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(await screen.findByText('La recette est enregistrée, mais la liste n’a pas pu être mise à jour.')).toBeInTheDocument()
  })

  it('élément avec photos introuvables : erreur affichée', async () => {
    const api = fakeApi()
    api.inbox.downloadPhotos.mockRejectedValueOnce(new AppError('Impossible de récupérer les photos mises de côté.'))
    renderForm(api, { pathname: '/recettes/nouvelle', state: { fromInbox: inboxItem({ photos: ['pending/a.jpg'] }) } })
    expect(await screen.findByText('Impossible de récupérer les photos mises de côté.')).toBeInTheDocument()
  })
})
