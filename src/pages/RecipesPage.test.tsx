import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { Link, Route } from 'react-router-dom'
import { fakeApi, listItem, renderWithApp } from '@/test/fakes'
import { RecipesPage } from './RecipesPage'

const TODAY = '2026-10-31'

const RECIPES = [
  listItem({
    id: 'a',
    title: 'Banana bread',
    tags: ['dessert'],
    ingredientNames: ['Bananes', 'Farine'],
    mainPhotoPath: 'a/1.jpg',
    createdAt: '2026-10-20T10:00:00Z',
    source: 'Pâtisserie maison',
    sourcePage: '146',
    totalMinutes: 75,
    kcal: 320,
    nutritionPer: 'portion',
    vegetarian: true,
    timesCooked: 3,
    lastCooked: '2026-10-25',
    rating: 4.5,
  }),
  listItem({
    id: 'b',
    title: 'Curry de légumes',
    tags: ['végé', 'rapide'],
    ingredientNames: ['Pois chiches'],
    createdAt: '2026-10-28T10:00:00Z',
    source: 'Ottolenghi',
    sourcePage: '12',
    totalMinutes: 25,
    vegetarian: true,
    rating: 3,
  }),
  listItem({
    id: 'c',
    title: 'Pâtes pesto',
    tags: ['rapide'],
    ingredientNames: ['Basilic'],
    createdAt: '2026-09-01T10:00:00Z',
    source: 'Pâtisserie maison',
    sourcePage: '30',
    totalMinutes: 20,
    timesCooked: 1,
    lastCooked: '2026-08-01',
  }),
]

const titles = () => screen.getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent)

function renderRecipes(api = fakeApi(), route = '/recettes') {
  return renderWithApp(<RecipesPage today={TODAY} />, {
    api,
    route,
    path: '/recettes',
    extraRoutes: <Route path="/recettes/:id" element={<Link to="/recettes?tri=book">Retour</Link>} />,
  })
}

describe('RecipesPage', () => {
  it('liste les recettes sauvegardées avec leur photo principale', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    const { container } = renderRecipes(api)
    expect(await screen.findByRole('link', { name: /Banana bread/ })).toHaveAttribute('href', '/recettes/a')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(api.recipes.listSavedRecipes).toHaveBeenCalledWith(TODAY)
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
    // Le tag « végé » est remplacé par le filtre rapide.
    expect(within(tags).getAllByRole('button').map((b) => b.textContent)).toEqual(['dessert', 'rapide'])
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

  it('montre sur chaque carte la note, le temps, les calories, le livre et l’historique', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    const card = await screen.findByRole('link', { name: /Banana bread/ })
    expect(within(card).getByLabelText('Note 4,5 sur 5')).toBeInTheDocument()
    expect(card).toHaveTextContent('1 h 15')
    expect(card).toHaveTextContent('320 kcal / portion')
    expect(card).toHaveTextContent('Végé')
    expect(card).toHaveTextContent('Pâtisserie maison, p. 146')
    expect(card).toHaveTextContent('Cuisinée 3 fois, la dernière le 25 octobre')
    expect(screen.getByRole('link', { name: /Curry/ })).toHaveTextContent('Jamais cuisinée')
  })

  it('trie et filtre par livre, et garde ces choix dans l’adresse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })
    expect(titles()).toEqual(['Banana bread', 'Curry de légumes', 'Pâtes pesto'])

    const sort = screen.getByRole('combobox', { name: 'Trier les recettes' })
    await user.selectOptions(sort, 'Ajoutées récemment')
    expect(titles()).toEqual(['Curry de légumes', 'Banana bread', 'Pâtes pesto'])
    await user.selectOptions(sort, 'Plus rapides')
    expect(titles()).toEqual(['Pâtes pesto', 'Curry de légumes', 'Banana bread'])
    await user.selectOptions(sort, 'Pas cuisinées depuis longtemps')
    expect(titles()).toEqual(['Curry de légumes', 'Pâtes pesto', 'Banana bread'])
    await user.selectOptions(sort, 'Mieux notées')
    expect(titles()).toEqual(['Banana bread', 'Curry de légumes', 'Pâtes pesto'])
    await user.selectOptions(sort, 'Livre et page')
    expect(titles()).toEqual(['Curry de légumes', 'Pâtes pesto', 'Banana bread'])

    const book = screen.getByRole('combobox', { name: 'Filtrer par livre' })
    expect(within(book).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tous les livres', 'Ottolenghi', 'Pâtisserie maison'])
    await user.selectOptions(book, 'Pâtisserie maison')
    expect(titles()).toEqual(['Pâtes pesto', 'Banana bread'])
    expect(screen.getByText(/2 recettes sur 3/)).toBeInTheDocument()

    // Retour depuis une fiche : la liste reprend les options de l'adresse.
    await user.click(screen.getByRole('link', { name: /Pâtes pesto/ }))
    await user.click(screen.getByRole('link', { name: 'Retour' }))
    expect(await screen.findByRole('combobox', { name: 'Trier les recettes' })).toHaveValue('book')
  })

  it('filtres rapides : 30 min max, végé, pas cuisinée depuis 1 mois', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })
    const quick = screen.getByRole('group', { name: 'Filtres rapides' })

    await user.click(within(quick).getByRole('button', { name: '30 min max' }))
    expect(titles()).toEqual(['Curry de légumes', 'Pâtes pesto'])
    await user.click(within(quick).getByRole('button', { name: 'Végé' }))
    expect(titles()).toEqual(['Curry de légumes'])
    await user.click(within(quick).getByRole('button', { name: 'Végé' }))
    await user.click(within(quick).getByRole('button', { name: 'Pas cuisinée depuis 1 mois' }))
    expect(titles()).toEqual(['Curry de légumes', 'Pâtes pesto'])

    await user.click(screen.getByRole('button', { name: 'Effacer les filtres' }))
    expect(titles()).toHaveLength(3)
    expect(within(quick).getByRole('button', { name: '30 min max' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('lit les options de l’adresse', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api, '/recettes?filtres=vegetarian,inconnu&tri=quick&livre=Ottolenghi')
    await screen.findByRole('link', { name: /Curry/ })
    expect(titles()).toEqual(['Curry de légumes'])
    expect(screen.getByRole('combobox', { name: 'Filtrer par livre' })).toHaveValue('Ottolenghi')
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
