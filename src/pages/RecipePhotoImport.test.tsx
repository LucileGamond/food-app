import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppError, type Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider } from '@/auth/AuthProvider'
import { compressForReading } from '@/lib/image'
import type { RecipeImport } from '@/lib/recipes'
import { takeSharedPhotos } from '@/lib/sharedPhotos'
import { fakeApi, fakeAuth, type FakeApi } from '@/test/fakes'
import { RecipeFormPage } from './RecipeFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  compressForReading: vi.fn(async (file: File) => new Blob([`réduite ${file.name}`], { type: 'image/jpeg' })),
}))
vi.mock('@/lib/sharedPhotos', () => ({ takeSharedPhotos: vi.fn(async () => [] as File[]) }))

// Recette lue sur la photo d'une page de livre (réponse simulée : aucun appel réel au modèle en test).
const READ: RecipeImport = {
  recipe: {
    title: 'Tarte à la banane et au café',
    servings: 6,
    ingredients: [
      { name: 'pâte sucrée', quantity: 200, unit: 'g', note: 'voir p. 208' },
      { name: 'bananes mûres', quantity: 5, unit: null, note: '4 ou 5 selon la taille' },
      { name: 'sucre roux', quantity: 2, unit: 'c. à s.', note: null },
      { name: 'fleur de sel', quantity: 2, unit: 'pincée', note: null },
    ],
    steps: '1. Préparez le fond de tarte.\n2. Poêlez les bananes.',
    tags: ['dessert'],
  },
  source: 'photo',
  image: null,
}

function renderForm(api: FakeApi, entry = '/recettes/nouvelle') {
  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={fakeAuth()}>
          <Routes>
            <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  )
  const pageInput = () => result.container.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!
  return { ...result, pageInput }
}

const photo = (name: string, type = 'image/jpeg') => new File(['x'], name, { type })

describe('RecipeFormPage — recette depuis une photo', () => {
  beforeEach(() => {
    vi.mocked(takeSharedPhotos).mockResolvedValue([])
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as File).name}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('lit la recette sur deux pages et préremplit le formulaire, sans garder la photo', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listTags.mockResolvedValue(['dessert'])
    api.recipes.importFromPhotos.mockResolvedValue(READ)
    const { pageInput } = renderForm(api)
    await user.click(await screen.findByRole('button', { name: "Photo d'un livre ou scan" }))
    await user.upload(pageInput(), photo('page-146.jpg'))
    const pages = screen.getByRole('list', { name: 'Pages à lire' })
    expect(within(pages).getByRole('img', { name: 'Page 1' })).toHaveAttribute('src', 'blob:page-146.jpg')
    await user.click(within(pages).getByRole('button', { name: 'Ajouter une page' }))
    await user.upload(pageInput(), photo('page-147.jpg'))
    expect(within(pages).getAllByRole('img')).toHaveLength(2)
    expect(within(pages).queryByRole('button', { name: 'Ajouter une page' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie depuis tes photos.')
    expect(compressForReading).toHaveBeenCalledTimes(2)
    const [sent, tags] = api.recipes.importFromPhotos.mock.calls[0]!
    expect(await Promise.all(sent.map((b) => b.text()))).toEqual(['réduite page-146.jpg', 'réduite page-147.jpg'])
    expect(tags).toEqual(['dessert'])

    expect(screen.getByLabelText('Titre')).toHaveValue('Tarte à la banane et au café')
    expect(screen.getByLabelText('Portions')).toHaveValue('6')
    expect(screen.getByLabelText("Nom de l'ingrédient 2")).toHaveValue('bananes mûres')
    expect(screen.getByLabelText("Précision de l'ingrédient 2")).toHaveValue('4 ou 5 selon la taille')
    // La page du livre n'est pas ajoutée aux photos de la recette.
    expect(screen.queryByRole('button', { name: /^Photo \d$/ })).not.toBeInTheDocument()
  })

  it('demande quelle recette préremplir quand la page en contient plusieurs', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const quiche = { ...READ.recipe, title: 'Quiche lorraine', ingredients: [{ name: 'lardons', quantity: 200, unit: 'g', note: null }] }
    api.recipes.importFromPhotos.mockResolvedValue({ ...READ, recipes: [READ.recipe, quiche] })
    const { pageInput } = renderForm(api)
    await user.upload(await waitFor(() => pageInput()), photo('page.jpg'))
    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))

    const choice = await screen.findByRole('region', { name: 'Cette page contient 2 recettes : laquelle préremplir ?' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Titre', { exact: true })).toHaveValue('')
    await user.click(within(choice).getByRole('button', { name: 'Quiche lorraine' }))

    expect(screen.queryByRole('region', { name: /laquelle préremplir/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Titre', { exact: true })).toHaveValue('Quiche lorraine')
    expect(screen.getByLabelText("Nom de l'ingrédient 1")).toHaveValue('lardons')
    expect(screen.getByRole('region', { name: 'Photo lue' })).toBeInTheDocument()
  })

  it('signale ce qui est à vérifier, jusqu’à la correction', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromPhotos.mockResolvedValue({
      ...READ,
      recipe: {
        ...READ.recipe,
        servings: null,
        checks: [
          { ingredient: 1, message: 'Quantité approximative (4 ou 5)' },
          { ingredient: null, message: 'Titre en partie illisible' },
        ],
      },
    })
    const { pageInput } = renderForm(api)
    await user.upload(await waitFor(() => pageInput()), photo('page.jpg'))
    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))

    // En haut : la photo lue et ce qui concerne la recette en général, sans rappel des autres points.
    const review = await screen.findByRole('region', { name: 'Photo lue' })
    expect(within(review).getByRole('button', { name: 'Agrandir la page 1' })).toBeInTheDocument()
    expect(review).toHaveTextContent('À vérifier : Titre en partie illisible')
    expect(review).not.toHaveTextContent('Quantité approximative')

    // Chaque point sous le champ concerné
    const rows = screen.getAllByTestId('ingredient-row')
    expect(rows[0]).toHaveTextContent('À vérifier : Renvoie à une autre page : recette à importer après l’enregistrement')
    expect(rows[1]).toHaveTextContent('À vérifier : Quantité approximative (4 ou 5)')
    expect(rows[2]).not.toHaveTextContent('À vérifier')
    expect(screen.getByText('Nombre de portions non trouvé')).toBeInTheDocument()

    // … jusqu'à la correction
    await user.type(screen.getByLabelText('Portions'), '6')
    await user.clear(screen.getByLabelText("Quantité de l'ingrédient 2"))
    await user.type(screen.getByLabelText("Quantité de l'ingrédient 2"), '4')
    expect(screen.queryByText('Nombre de portions non trouvé')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('ingredient-row')[1]).not.toHaveTextContent('À vérifier')

    await user.click(within(review).getByRole('button', { name: 'Masquer' }))
    expect(screen.queryByRole('region', { name: 'Photo lue' })).not.toBeInTheDocument()
    expect(screen.queryByText(/À vérifier/)).not.toBeInTheDocument()
  })

  it('garde 2 pages au plus, ignore ce qui n’est pas une image, et permet de retirer une page', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const api = fakeApi()
    const { pageInput } = renderForm(api)
    await screen.findByRole('button', { name: "Photo d'un livre ou scan" })
    await user.upload(pageInput(), [photo('a.jpg'), new File(['%PDF'], 'b.pdf', { type: 'application/pdf' }), photo('c.png', 'image/png'), photo('d.jpg')])
    const pages = screen.getByRole('list', { name: 'Pages à lire' })
    expect(within(pages).getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['blob:a.jpg', 'blob:c.png'])
    expect(screen.getByText('2 pages au plus : seules les premières sont gardées.')).toBeInTheDocument()

    await user.click(within(pages).getByRole('button', { name: 'Retirer la page 1' }))
    expect(within(pages).getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['blob:c.png'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg')
    await user.click(within(pages).getByRole('button', { name: 'Retirer la page 1' }))
    expect(screen.getByRole('button', { name: "Photo d'un livre ou scan" })).toBeInTheDocument()
  })

  it('demande avant de remplacer une saisie, et affiche une erreur de lecture', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromPhotos.mockRejectedValueOnce(new AppError('Aucune recette lisible sur cette photo. Essaie une photo plus nette, bien droite.'))
    const { pageInput } = renderForm(api)
    await user.type(await screen.findByLabelText("Nom de l'ingrédient 1"), 'farine')
    await user.upload(pageInput(), photo('floue.jpg'))
    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remplacer le contenu du formulaire ?' })
    expect(confirm).toHaveTextContent('remplacés par ceux de la photo')
    await user.click(within(confirm).getByRole('button', { name: 'Remplacer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aucune recette lisible sur cette photo.')
    expect(screen.getByLabelText("Nom de l'ingrédient 1")).toHaveValue('farine')
  })

  it('explique quand une photo ne peut pas être lue par le navigateur (HEIC, fichier abîmé)', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    vi.mocked(compressForReading).mockRejectedValueOnce(new Error('format non pris en charge'))
    const { pageInput } = renderForm(api)
    await user.upload(await waitFor(() => pageInput()), photo('IMG_0001.heic', 'image/heic'))
    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette photo ne peut pas être lue. Essaie une photo JPEG ou PNG')
    expect(api.recipes.importFromPhotos).not.toHaveBeenCalled()
    // On peut réessayer avec une autre photo
    expect(screen.getByRole('button', { name: 'Lire la recette' })).toBeEnabled()
  })

  it('lit tout de suite les photos partagées depuis la galerie du téléphone', async () => {
    const api = fakeApi()
    api.recipes.importFromPhotos.mockResolvedValue(READ)
    vi.mocked(takeSharedPhotos).mockResolvedValue([photo('partage.jpg')])
    renderForm(api, '/recettes/nouvelle?photos=partage')
    expect(await screen.findByRole('status')).toHaveTextContent('Recette préremplie depuis ta photo.')
    expect(api.recipes.importFromPhotos).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Titre')).toHaveValue('Tarte à la banane et au café')
    expect(screen.getByRole('img', { name: 'Page 1' })).toBeInTheDocument()
  })

  it('prévient si le partage ne contenait aucune photo', async () => {
    const api = fakeApi()
    renderForm(api, '/recettes/nouvelle?photos=partage')
    expect(await screen.findByText('Aucune photo reçue : choisis-la depuis « Photo d’un livre ou scan ».')).toBeInTheDocument()
    await waitFor(() => expect(takeSharedPhotos).toHaveBeenCalledTimes(1))
    expect(api.recipes.importFromPhotos).not.toHaveBeenCalled()
  })
})
