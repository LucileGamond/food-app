import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { RecipeSummary } from '@/lib/meals'
import type { RecipeImport } from '@/lib/recipes'
import { fakeApi, renderWithApp, type FakeApi } from '@/test/fakes'
import { RecipeBatchImportPage } from './RecipeBatchImportPage'

vi.mock('@/lib/image', () => ({ compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })) }))

const read = (title: string, page: string | null = null): RecipeImport => ({
  recipe: { title, servings: 4, ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null }], steps: '', tags: [], page },
  source: 'photo',
  image: null,
})
const summary = (id: string, title: string): RecipeSummary => ({ id, is_saved: true, title, notes: null, url: null, tags: [] })
const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

function setup(api: FakeApi = fakeApi()) {
  api.recipes.listSources.mockResolvedValue(['Pâtisserie maison'])
  api.recipes.listSavedSummaries.mockResolvedValue([summary('r1', 'Crêpes')])
  renderWithApp(<RecipeBatchImportPage />, {
    api,
    route: '/recettes/import-serie',
    path: '/recettes/import-serie',
    extraRoutes: <Route path="/recettes" element={<p>Liste des recettes</p>} />,
  })
  const photos = () => screen.getByLabelText('Photos des pages') as HTMLInputElement
  return { api, user: userEvent.setup({ applyAccept: false }), photos }
}

describe('RecipeBatchImportPage', () => {
  it('exige un livre et au moins une image', async () => {
    const { user, api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Lancer l’import' }))
    expect(screen.getByText('Indique le livre')).toBeInTheDocument()
    expect(screen.getByText('Choisis au moins une image')).toBeInTheDocument()
    expect(api.recipes.importFromPhotos).not.toHaveBeenCalled()
  })

  it('importe les images une par une et résume le résultat', async () => {
    const { user, api, photos } = setup()
    api.recipes.importFromPhotos
      .mockResolvedValueOnce(read('Tarte au citron', '146'))
      .mockRejectedValueOnce(new AppError('Aucune recette trouvée sur cette photo.', 'import-422'))
      .mockResolvedValueOnce(read('crêpes'))
      .mockRejectedValueOnce(new AppError('Le service d’analyse est surchargé.', 'import-503'))
    api.recipes.saveRecipe.mockResolvedValue('r9')

    await user.type(await screen.findByLabelText('Livre'), 'Pâtisserie maison')
    await user.upload(photos(), [image('p10.jpg'), image('p2.jpg'), image('notes.jpg'), image('p3.jpg')])
    expect(screen.getByText('4 images · de « notes.jpg » à « p10.jpg »')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lancer l’import (4)' }))

    expect(await screen.findByRole('heading', { name: /Import terminé · 4 \/ 4/ })).toBeInTheDocument()
    expect(screen.getByText('1 enregistrée · 1 déjà enregistrée · 1 ignorée · 1 en erreur')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalledTimes(1)
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tarte au citron', source: 'Pâtisserie maison', sourcePage: '146' }))

    const rows = screen.getAllByTestId('batch-item')
    expect(rows.map((r) => within(r).getAllByText(/./)[0]!.textContent)).toEqual(['notes.jpg', 'p2.jpg', 'p3.jpg', 'p10.jpg'])
    expect(within(rows[0]!).getByRole('link', { name: 'Tarte au citron' })).toHaveAttribute('href', '/recettes/r9')
    expect(rows[1]).toHaveTextContent('Ignorée · Pas une recette')
    expect(within(rows[2]!).getByRole('link', { name: 'crêpes' })).toHaveAttribute('href', '/recettes/r1')
    expect(rows[3]).toHaveTextContent('Erreur · Le service d’analyse est surchargé.')

    // Réessayer les erreurs
    api.recipes.importFromPhotos.mockResolvedValueOnce(read('Flan', '30'))
    await user.click(screen.getByRole('button', { name: 'Réessayer les erreurs (1)' }))
    await waitFor(() => expect(screen.getByText('2 enregistrées · 1 déjà enregistrée · 1 ignorée')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Réessayer les erreurs/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les recettes' })).toHaveAttribute('href', '/recettes')
  })

  it('se met en pause et reprend', async () => {
    const { user, api, photos } = setup()
    const pending: ((value: RecipeImport) => void)[] = []
    api.recipes.importFromPhotos.mockImplementation(() => new Promise<RecipeImport>((resolve) => pending.push(resolve)))
    api.recipes.saveRecipe.mockImplementation(async (input) => `id-${input.title}`)

    await user.type(await screen.findByLabelText('Livre'), 'Pâtisserie maison')
    await user.upload(photos(), [image('a.jpg'), image('b.jpg'), image('c.jpg'), image('d.jpg')])
    await user.click(screen.getByRole('button', { name: 'Lancer l’import (4)' }))
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(screen.getByText('Garde cette page ouverte jusqu’à la fin.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    pending.shift()!(read('A'))
    pending.shift()!(read('B'))
    expect(await screen.findByRole('heading', { name: /En pause · 2 \/ 4/ })).toBeInTheDocument()
    expect(api.recipes.importFromPhotos).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Reprendre' }))
    await waitFor(() => expect(pending).toHaveLength(2))
    pending.shift()!(read('C'))
    pending.shift()!(read('D'))
    expect(await screen.findByRole('heading', { name: /Import terminé · 4 \/ 4/ })).toBeInTheDocument()
    expect(screen.getByText('4 enregistrées')).toBeInTheDocument()
  })
})
