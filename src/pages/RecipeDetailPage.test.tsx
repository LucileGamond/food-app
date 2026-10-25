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
    { name: 'Pois chiches', quantity: 400, unit: 'g', note: null },
    { name: 'Sel', quantity: null, unit: null, note: null },
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

  it('adapte les quantités au nombre de personnes choisi', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({
      ...CURRY,
      ingredients: [...CURRY.ingredients, { name: 'Œufs', quantity: 3, unit: null, note: null }, { name: 'Lait de coco', quantity: 33.3, unit: 'cl', note: null }],
    })
    renderDetail(api)
    const group = await screen.findByRole('group', { name: 'Nombre de personnes' })
    const list = screen.getByRole('region', { name: 'Ingrédients' })
    expect(group).toHaveTextContent('4 personnes')
    expect(within(list).getByText('400 g Pois chiches')).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'Une personne de moins' }))
    await user.click(within(group).getByRole('button', { name: 'Une personne de moins' }))
    expect(group).toHaveTextContent('2 personnes')
    expect(within(list).getByText('200 g Pois chiches')).toBeInTheDocument()
    expect(within(list).getByText('1,5 Œufs')).toBeInTheDocument()
    expect(within(list).getByText('16,7 cl Lait de coco')).toBeInTheDocument()
    expect(within(list).getByText('Sel')).toBeInTheDocument()
    // Le nombre de portions de la recette ne change pas
    expect(screen.getByText('4 portions')).toBeInTheDocument()
    expect(within(list).getByText(/Quantités adaptées \(recette pour 4\)/)).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'Une personne de moins' }))
    expect(group).toHaveTextContent('1 personne')
    expect(within(group).getByRole('button', { name: 'Une personne de moins' })).toBeDisabled()

    await user.click(within(list).getByRole('button', { name: 'Revenir à 4' }))
    expect(within(list).getByText('400 g Pois chiches')).toBeInTheDocument()
    expect(within(list).queryByText(/Quantités adaptées/)).not.toBeInTheDocument()

    for (let n = 0; n < 6; n++) await user.click(within(group).getByRole('button', { name: 'Une personne de plus' }))
    expect(group).toHaveTextContent('10 personnes')
    expect(within(list).getByText(/^1\s000 g Pois chiches$/)).toBeInTheDocument()
  })

  it('ne propose pas d’adapter les quantités sans nombre de portions', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({ ...CURRY, servings: null })
    renderDetail(api)
    await screen.findByRole('heading', { name: 'Curry de légumes' })
    expect(screen.queryByRole('group', { name: 'Nombre de personnes' })).not.toBeInTheDocument()
    expect(screen.getByText('400 g Pois chiches')).toBeInTheDocument()
  })

  it('ajoute la recette à la liste « À planifier »', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(CURRY)
    renderDetail(api)
    await user.click(await screen.findByRole('button', { name: 'À planifier' }))
    expect(api.inbox.addItem).toHaveBeenCalledWith({ recipeId: 'r1' })
    expect(await screen.findByText('Ajoutée à la liste « À planifier »')).toBeInTheDocument()
    api.inbox.addItem.mockRejectedValueOnce(new AppError('Déjà dans la liste « À planifier ».'))
    await user.click(screen.getByRole('button', { name: 'À planifier' }))
    expect(await screen.findByText('Déjà dans la liste « À planifier ».')).toBeInTheDocument()
  })
})
