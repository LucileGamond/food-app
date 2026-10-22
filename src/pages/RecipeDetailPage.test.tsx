import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError, RecipeInUseError } from '@/api'
import type { Recipe } from '@/lib/recipes'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { RecipeDetailPage } from './RecipeDetailPage'

const CURRY: Recipe = {
  id: 'r1',
  is_saved: true,
  title: 'Curry de légumes',
  notes: 'Cuire 20 min. Voir https://exemple.fr/astuce',
  url: 'https://exemple.fr/curry',
  servings: 4,
  tags: ['végé'],
  ingredients: [
    { name: 'Pois chiches', quantity: 400, unit: 'g' },
    { name: 'Sel', quantity: null, unit: null },
  ],
  photos: [
    { id: 'p1', storage_path: 'r1/1.jpg', position: 0 },
    { id: 'p2', storage_path: 'r1/2.jpg', position: 1 },
  ],
}

function renderDetail(api = fakeApi()) {
  return renderWithApp(<RecipeDetailPage />, {
    api,
    route: '/recettes/r1',
    path: '/recettes/:id',
    extraRoutes: <Route path="/recettes" element={<p>Liste des recettes</p>} />,
  })
}

describe('RecipeDetailPage', () => {
  it('affiche la recette complète', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    renderDetail(api)

    expect(await screen.findByRole('heading', { name: 'Curry de légumes' })).toBeInTheDocument()
    expect(screen.getByText('4 portions')).toBeInTheDocument()
    expect(screen.getByText('végé')).toBeInTheDocument()
    expect(screen.getByText('400 g Pois chiches')).toBeInTheDocument()
    expect(screen.getByText('Sel')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'exemple.fr/astuce' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voir la recette en ligne/ })).toHaveAttribute('href', 'https://exemple.fr/curry')
    expect(screen.getByRole('link', { name: /Modifier/ })).toHaveAttribute('href', '/recettes/r1/modifier')

    expect(await screen.findByRole('img', { name: 'Curry de légumes' })).toHaveAttribute('src', 'https://cdn.test/r1/1.jpg')
    await user.click(screen.getByRole('button', { name: 'Photo 2' }))
    expect(screen.getByRole('img', { name: 'Curry de légumes' })).toHaveAttribute('src', 'https://cdn.test/r1/2.jpg')
    expect(screen.getByRole('button', { name: 'Photo 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('affiche « 1 portion » et l’absence d’étapes', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({ ...CURRY, servings: 1, notes: null, url: null, photos: [] })
    renderDetail(api)
    expect(await screen.findByText('1 portion')).toBeInTheDocument()
    expect(screen.getByText('Aucune étape renseignée.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('traite une recette ponctuelle ou absente comme introuvable', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValueOnce({ ...CURRY, is_saved: false })
    renderDetail(api)
    expect(await screen.findByText('Recette introuvable')).toBeInTheDocument()
  })

  it('bloque la suppression d’une recette utilisée et liste les dates', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    api.recipes.listUsages.mockResolvedValue([
      { meal_date: '2026-10-21', slot: 'LUNCH' },
      { meal_date: '2026-10-21', slot: 'LUNCH' },
      { meal_date: '2026-10-23', slot: 'DINNER' },
    ])
    renderDetail(api)
    await user.click(await screen.findByRole('button', { name: /Supprimer/ }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Suppression impossible' })
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Mercredi 21 octobre · Midi',
      'Mercredi 21 octobre · Midi',
      'Vendredi 23 octobre · Soir',
    ])
    expect(within(dialog).getByRole('button', { name: 'Supprimer' })).toBeDisabled()
    expect(api.recipes.deleteRecipe).not.toHaveBeenCalled()
  })

  it('supprime une recette inutilisée et revient à la liste', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    renderDetail(api)
    await user.click(await screen.findByRole('button', { name: /Supprimer/ }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer cette recette ?' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Supprimer' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Liste des recettes')).toBeInTheDocument()
    expect(api.recipes.deleteRecipe).toHaveBeenCalledWith('r1')
  })

  it('affiche l’erreur si la suppression est refusée entre-temps', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    api.recipes.deleteRecipe.mockRejectedValue(new RecipeInUseError())
    renderDetail(api)
    await user.click(await screen.findByRole('button', { name: /Supprimer/ }))
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Supprimer' })).toBeEnabled())
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText(/utilisée dans le planning/)).toBeInTheDocument()
  })

  it('signale une erreur de vérification du planning', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    api.recipes.listUsages.mockRejectedValue(new AppError('Vérification impossible'))
    renderDetail(api)
    await user.click(await screen.findByRole('button', { name: /Supprimer/ }))
    expect(await screen.findByText('Vérification impossible')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockRejectedValueOnce(new AppError('Hors ligne')).mockResolvedValueOnce(CURRY)
    renderDetail(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { name: 'Curry de légumes' })).toBeInTheDocument()
  })
})
