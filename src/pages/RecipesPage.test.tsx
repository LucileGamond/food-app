import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { RecipesPage } from './RecipesPage'

const RECIPES = [
  { id: 'a', title: 'Banana bread', tags: ['dessert'], ingredientNames: ['Bananes', 'Farine'], mainPhotoPath: 'a/1.jpg' },
  { id: 'b', title: 'Curry de légumes', tags: ['végé', 'rapide'], ingredientNames: ['Pois chiches'], mainPhotoPath: null },
  { id: 'c', title: 'Pâtes pesto', tags: ['rapide'], ingredientNames: ['Basilic'], mainPhotoPath: null },
]

function renderRecipes(api = fakeApi()) {
  return renderWithApp(<RecipesPage />, { api, route: '/recettes', path: '/recettes' })
}

describe('RecipesPage', () => {
  it('liste les recettes sauvegardées avec leur photo principale', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    const { container } = renderRecipes(api)
    expect(await screen.findByRole('link', { name: /Banana bread/ })).toHaveAttribute('href', '/recettes/a')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    await vi.waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/a/1.jpg'))
    expect(api.photos.signedUrls).toHaveBeenCalledWith(['a/1.jpg'])
  })

  it('cherche par titre ou ingrédient et filtre par tag', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher une recette' }), 'pois')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Curry/ })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))

    const tags = screen.getByRole('group', { name: 'Filtrer par tag' })
    await user.click(within(tags).getByRole('button', { name: 'rapide' }))
    expect(within(tags).getByRole('button', { name: 'rapide' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Curry'),
      expect.stringContaining('Pâtes'),
    ])

    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Aucune recette ne correspond')).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox'))
    await user.click(within(tags).getByRole('button', { name: 'rapide' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('affiche un état vide avec un bouton de création', async () => {
    renderRecipes()
    expect(await screen.findByText('Aucune recette')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Nouvelle recette' })[0]).toHaveAttribute('href', '/recettes/nouvelle')
  })

  it('affiche les erreurs de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderRecipes(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucune recette')).toBeInTheDocument()
  })
})
