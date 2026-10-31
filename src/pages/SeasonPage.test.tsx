import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, listItem, renderWithApp } from '@/test/fakes'
import { SeasonPage } from './SeasonPage'

const TODAY = '2026-11-05'

const RECIPES = [
  listItem({ id: 'a', title: 'Soupe de potiron', ingredientNames: ['potiron', 'poireaux', 'crème'] }),
  listItem({ id: 'b', title: 'Fondue de poireaux', ingredientNames: ['poireaux', 'beurre'] }),
  listItem({ id: 'c', title: 'Ratatouille', ingredientNames: ['tomates', 'courgettes', 'aubergine'] }),
  listItem({ id: 'd', title: 'Pâtes carbonara', ingredientNames: ['pâtes', 'lardons'] }),
]

function renderSeason(api = fakeApi(), route = '/recettes/saison') {
  api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
  renderWithApp(<SeasonPage today={TODAY} />, { api, route, path: '/recettes/saison' })
  return { api, user: userEvent.setup() }
}

const recipeTitles = () =>
  within(screen.getByRole('region', { name: /^Recettes/ }))
    .getAllByRole('heading', { level: 2 })
    .slice(1)
    .map((h) => h.textContent)

describe('SeasonPage', () => {
  it('montre les fruits et légumes du mois et les recettes de saison', async () => {
    renderSeason()
    expect(screen.getByRole('heading', { name: 'Novembre' })).toBeInTheDocument()
    const vegetables = screen.getByRole('group', { name: 'Légumes du mois' })
    expect(within(vegetables).getByRole('button', { name: /^Poireau/ })).toBeInTheDocument()
    expect(within(vegetables).queryByRole('button', { name: /^Tomate/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Fruits du mois' })).getByRole('button', { name: /^Clémentine/ })).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: /^Recettes de saison en novembre ?2$/ })).toBeInTheDocument()
    expect(recipeTitles()).toEqual(['Soupe de potiron', 'Fondue de poireaux'])
    // Nombre de recettes par produit.
    expect(within(vegetables).getByRole('button', { name: /^Poireau ?· 2$/ })).toBeInTheDocument()
  })

  it('un produit choisi montre ses recettes ; on change de mois', async () => {
    const { user } = renderSeason()
    await screen.findByRole('heading', { name: /Recettes de saison/ })
    await user.click(screen.getByRole('button', { name: /^Potiron ?· 1$/ }))
    expect(screen.getByRole('heading', { name: /^Recettes avec : potiron ?1$/ })).toBeInTheDocument()
    expect(recipeTitles()).toEqual(['Soupe de potiron'])
    await user.click(screen.getByRole('button', { name: /^Potiron ?· 1$/ }))
    expect(recipeTitles()).toEqual(['Soupe de potiron', 'Fondue de poireaux'])

    // Juillet : la ratatouille devient de saison, la soupe de potiron non.
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByRole('heading', { name: 'Juillet' })).toBeInTheDocument()
    expect(recipeTitles()).toEqual(['Ratatouille'])
    await user.click(screen.getByRole('button', { name: 'Revenir à novembre' }))
    expect(screen.getByRole('heading', { name: 'Novembre' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByRole('heading', { name: 'Janvier' })).toBeInTheDocument()
  })

  it('lit le mois et le produit de l’adresse ; état vide', async () => {
    renderSeason(fakeApi(), '/recettes/saison?mois=7&produit=fraise')
    expect(screen.getByRole('heading', { name: 'Juillet' })).toBeInTheDocument()
    expect(await screen.findByText('Aucune recette avec ce produit')).toBeInTheDocument()
  })

  it('erreur de chargement et réessai', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockRejectedValueOnce(new AppError('Hors ligne')).mockResolvedValueOnce([])
    renderWithApp(<SeasonPage today={TODAY} />, { api, route: '/recettes/saison', path: '/recettes/saison' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucune recette de saison')).toBeInTheDocument()
  })
})
