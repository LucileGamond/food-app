import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider } from '@/auth/AuthProvider'
import { fakeApi, fakeAuth, type FakeApi } from '@/test/fakes'
import { RecipeFormPage } from './RecipeFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
}))

function renderForm(api: FakeApi) {
  const result = render(
    <MemoryRouter initialEntries={['/recettes/nouvelle']}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={fakeAuth()}>
          <Routes>
            <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
            <Route path="/recettes/:id" element={<p>Fiche recette</p>} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  )
  return { ...result, pageInput: () => result.container.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')! }
}

describe('RecipeFormPage — source, temps, sous-parties, doublons', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as File).name}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('enregistre la source, les temps et les sous-parties', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSources.mockResolvedValue(['Pâtisserie maison'])
    renderForm(api)
    await user.type(await screen.findByLabelText('Titre'), 'Tarte à la banane')
    await user.type(screen.getByLabelText('Livre ou source'), 'Pâtisserie maison')
    await user.type(screen.getByLabelText('Page'), '146')
    await waitFor(() => expect(document.querySelector('#recipe-sources option')).toHaveAttribute('value', 'Pâtisserie maison'))
    await user.type(screen.getByLabelText('Préparation'), '10 min')
    await user.type(screen.getByLabelText('Repos'), '2 h')
    await user.type(screen.getByLabelText('Cuisson'), '1h30')

    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'bananes')
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-partie' }))
    await user.type(screen.getByLabelText('Titre de la sous-partie 1'), 'Pour le streusel')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 2"), 'beurre')
    await user.type(screen.getByLabelText("Quantité de l'ingrédient 2"), '50')

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Pâtisserie maison',
        sourcePage: '146',
        prepMinutes: 10,
        restMinutes: 120,
        cookMinutes: 90,
        ingredients: [
          { name: 'bananes', quantity: null, unit: null, note: null, section: null },
          { name: 'beurre', quantity: 50, unit: null, note: null, section: 'Pour le streusel' },
        ],
      }),
    )
  }, 20_000) // Beaucoup de saisie : lent quand toute la suite tourne en parallèle.

  it('refuse une durée illisible, et retire une sous-partie', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderForm(api)
    await user.type(await screen.findByLabelText('Titre'), 'Tarte')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'farine')
    await user.type(screen.getByLabelText('Cuisson'), 'longtemps')
    await user.click(screen.getByRole('button', { name: 'Ajouter une sous-partie' }))
    expect(screen.getAllByTestId('ingredient-heading')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Retirer la sous-partie 1' }))
    expect(screen.queryAllByTestId('ingredient-heading')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Durée invalide (ex. 45 min, 1 h 30)')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()
  })

  it('prévient qu’une recette du même titre existe déjà', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedSummaries.mockResolvedValue([{ id: 'r9', is_saved: true, title: 'Tarte à la Banane', notes: null, url: null, tags: [] }])
    renderForm(api)
    await user.type(await screen.findByLabelText('Titre'), 'tarte a la banane')
    const notice = await screen.findByText(/Une recette « Tarte à la Banane » existe déjà/)
    expect(within(notice.closest('p')!).getByRole('link', { name: 'La voir' })).toHaveAttribute('href', '/recettes/r9')
    await user.type(screen.getByLabelText('Titre'), ' et café')
    expect(screen.queryByText(/existe déjà/)).not.toBeInTheDocument()
  })

  it('garde la photo lue à l’écran pour comparer, en grand sur demande', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.importFromPhotos.mockResolvedValue({
      recipe: {
        title: 'Tarte',
        servings: 6,
        ingredients: [{ name: 'beurre demi-sel', quantity: 50, unit: 'g', note: null, section: 'Pour le streusel' }],
        steps: '1. Cuire.',
        tags: [],
        checks: [],
        source: 'Pâtisserie maison',
        page: '146',
        prep_minutes: 10,
        rest_minutes: null,
        cook_minutes: 40,
      },
      source: 'photo',
      image: null,
    })
    const { pageInput } = renderForm(api)
    await user.upload(await waitFor(() => pageInput()), new File(['x'], 'page.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: 'Lire la recette' }))
    const review = await screen.findByRole('region', { name: 'Photo lue' })
    expect(screen.getByLabelText('Livre ou source')).toHaveValue('Pâtisserie maison')
    expect(screen.getByLabelText('Page')).toHaveValue('146')
    expect(screen.getByLabelText('Cuisson')).toHaveValue('40 min')
    expect(screen.getByLabelText('Titre de la sous-partie 1')).toHaveValue('Pour le streusel')

    await user.click(within(review).getByRole('button', { name: 'Agrandir la page 1' }))
    const viewer = await screen.findByRole('dialog', { name: 'Page 1' })
    const image = () => within(viewer).getByRole('img', { name: 'Page 1 de la recette' })
    expect(image()).toHaveAttribute('src', 'blob:page.jpg')
    await user.click(within(viewer).getByRole('button', { name: 'Agrandir' }))
    expect(image()).toHaveClass('w-[200%]')
    await user.click(within(viewer).getByRole('button', { name: 'Réduire' }))
    expect(image()).toHaveClass('w-full')
  })
})
