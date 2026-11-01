import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { Link, Route, useLocation } from 'react-router-dom'
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

// Cartes de recettes seulement (pas les notifications, gardées d'un test à l'autre).
const titles = () =>
  screen
    .getAllByRole('listitem')
    .flatMap((li) => within(li).queryAllByRole('heading', { level: 2 }))
    .map((h) => h.textContent)

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

    const source = screen.getByRole('combobox', { name: 'Filtrer par source' })
    expect(within(source).getAllByRole('option').map((o) => o.textContent)).toEqual(['Toutes les sources', 'Ottolenghi', 'Pâtisserie maison'])
    await user.selectOptions(source, 'Pâtisserie maison')
    expect(titles()).toEqual(['Pâtes pesto', 'Banana bread'])
    expect(screen.getByText(/2 recettes sur 3/)).toBeInTheDocument()

    // Retour depuis une fiche : la liste reprend les options de l'adresse.
    await user.click(screen.getByRole('link', { name: /Pâtes pesto/ }))
    await user.click(screen.getByRole('link', { name: 'Retour' }))
    expect(await screen.findByRole('combobox', { name: 'Trier les recettes' })).toHaveValue('book')
  })

  it('filtres rapides : 30 min max, végé, pas cuisinée depuis 1 mois, sans photo', async () => {
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
    await user.click(within(quick).getByRole('button', { name: 'Pas cuisinée depuis 1 mois' }))
    // Banana bread a une photo : les deux autres non.
    await user.click(within(quick).getByRole('button', { name: 'Sans photo' }))
    expect(titles()).toEqual(['Curry de légumes', 'Pâtes pesto'])
    await user.click(within(quick).getByRole('button', { name: 'Sans photo' }))

    await user.click(screen.getByRole('button', { name: 'Effacer les filtres' }))
    expect(titles()).toHaveLength(3)
    expect(within(quick).getByRole('button', { name: '30 min max' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('filtre « De saison » et badge sur les cartes (octobre)', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue([
      ...RECIPES,
      listItem({ id: 'd', title: 'Soupe de potiron', ingredientNames: ['potiron', 'poireaux', 'crème'] }),
      listItem({ id: 'e', title: 'Ratatouille', ingredientNames: ['tomates', 'courgettes', 'potiron'] }),
    ])
    renderRecipes(api)
    const soup = await screen.findByRole('link', { name: /Soupe de potiron/ })
    expect(soup).toHaveTextContent('De saison')
    expect(screen.getByRole('link', { name: /Ratatouille/ })).not.toHaveTextContent('De saison')
    expect(screen.getByRole('link', { name: /Pâtes pesto/ })).not.toHaveTextContent('De saison')

    await user.click(within(screen.getByRole('group', { name: 'Filtres rapides' })).getByRole('button', { name: 'De saison' }))
    expect(titles()).toEqual(['Soupe de potiron'])
    expect(screen.getByRole('link', { name: 'Ce mois-ci' })).toHaveAttribute('href', '/recettes/saison')
  })

  it('un tri choisi juste après « Effacer les filtres » ne remet pas les filtres effacés', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })
    await user.click(within(screen.getByRole('group', { name: 'Filtres rapides' })).getByRole('button', { name: '30 min max' }))
    expect(titles()).toHaveLength(2)
    // Les deux actions avant que l'écran ne se mette à jour.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Trier les recettes' }), { target: { value: 'quick' } })
    })
    expect(titles()).toEqual(['Pâtes pesto', 'Curry de légumes', 'Banana bread'])
  })

  it('« De côté » : liens et photos à préremplir, à planifier ou à supprimer ; rien sans élément', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    const reel = { id: 'a1', title: 'Curry du reel', url: 'https://www.instagram.com/reel/abc/', recipe_id: null, created_at: '2026-10-30T10:00:00Z', list: 'aside', photos: [] }
    const pages = { id: 'a2', title: 'Photos du 1 nov.', url: null, recipe_id: null, created_at: '2026-10-31T10:00:00Z', list: 'aside', photos: ['pending/p.jpg'] }
    api.inbox.listItems.mockImplementation(async (list = 'plan') => (list === 'aside' ? [reel, pages] : []))
    renderWithApp(<RecipesPage today={TODAY} />, {
      api,
      route: '/recettes',
      path: '/recettes',
      extraRoutes: <Route path="/recettes/nouvelle" element={<FormState />} />,
    })
    const aside = await screen.findByRole('region', { name: /De côté/ })
    expect(within(aside).getAllByTestId('aside-item').map((i) => i.textContent)).toEqual([
      expect.stringContaining('Curry du reelinstagram.com'),
      expect.stringContaining('Photos du 1 nov.1 photo'),
    ])
    expect(api.inbox.listItems).toHaveBeenCalledWith('aside')

    await user.click(within(aside).getByRole('button', { name: 'Actions pour « Curry du reel »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mettre « À planifier »' }))
    expect(api.inbox.moveItem).toHaveBeenCalledWith('a1', 'plan')
    await user.click(within(aside).getByRole('button', { name: 'Actions pour « Photos du 1 nov. »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    expect(api.inbox.deleteItem).toHaveBeenCalledWith('a2', ['pending/p.jpg'])

    await user.click(within(aside).getByRole('button', { name: 'Préremplir et enregistrer « Curry du reel »' }))
    expect(await screen.findByText(/"fromInbox":\{"id":"a1"/)).toBeInTheDocument()
  })

  it('« De côté » vide : la section n’apparaît pas', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })
    expect(screen.queryByRole('region', { name: /De côté/ })).not.toBeInTheDocument()
  })

  it('lit les options de l’adresse', async () => {
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    renderRecipes(api, '/recettes?filtres=vegetarian,inconnu&tri=quick&source=livre%3AOttolenghi')
    await screen.findByRole('link', { name: /Curry/ })
    expect(titles()).toEqual(['Curry de légumes'])
    expect(screen.getByRole('combobox', { name: 'Filtrer par source' })).toHaveValue('livre:Ottolenghi')
  })

  it('filtre par site (début de l’adresse) ou par mes recettes, sans source', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue([
      ...RECIPES,
      listItem({ id: 'd', title: 'Gratin', url: 'https://www.marmiton.org/recettes/gratin.aspx' }),
      listItem({ id: 'e', title: 'Quiche', url: 'https://marmiton.org/recettes/quiche.aspx' }),
      listItem({ id: 'f', title: 'Soupe de mamie' }),
    ])
    renderRecipes(api)
    await screen.findByRole('link', { name: /Gratin/ })
    const source = screen.getByRole('combobox', { name: 'Filtrer par source' })
    expect(within(source).getByRole('group', { name: 'Livres' })).toBeInTheDocument()
    expect(within(within(source).getByRole('group', { name: 'Sites' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['marmiton.org'])

    await user.selectOptions(source, 'marmiton.org')
    expect(titles()).toEqual(['Gratin', 'Quiche'])
    await user.selectOptions(source, 'Mes recettes (sans source)')
    expect(titles()).toEqual(['Soupe de mamie'])
  })

  it('relie les recettes d’un même livre et dit ce qui a été fait', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    const ing = (name: string, note: string | null = null) => ({ position: 0, name, note, linkedRecipeId: null })
    api.recipes.listLinkable
      .mockResolvedValueOnce([
        { id: 't', title: 'Tarte au citron', source: 'Pâtisserie maison', sourcePage: '146', ingredients: [ing('pâte sucrée', 'voir p. 208')] },
        { id: 'p', title: 'Pâte sucrée', source: 'Pâtisserie maison', sourcePage: '208', ingredients: [] },
      ])
      .mockResolvedValueOnce([])
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })

    await user.click(screen.getByRole('button', { name: 'Relier les recettes' }))
    expect(await screen.findByText('« Tarte au citron » renvoie maintenant à « Pâte sucrée »')).toBeInTheDocument()
    expect(api.recipes.linkIngredient).toHaveBeenCalledWith('t', { position: 0, name: 'pâte sucrée' }, 'p')

    await user.click(screen.getByRole('button', { name: 'Relier les recettes' }))
    expect(await screen.findByText(/Aucun nouveau lien/)).toBeInTheDocument()
  })

  it('signale un échec du chargement des recettes à relier', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedRecipes.mockResolvedValue(RECIPES)
    api.recipes.listLinkable.mockRejectedValue(new AppError('Impossible de charger les recettes.'))
    renderRecipes(api)
    await screen.findByRole('link', { name: /Banana bread/ })
    await user.click(screen.getByRole('button', { name: 'Relier les recettes' }))
    expect(await screen.findByText('Impossible de charger les recettes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Relier les recettes' })).toBeEnabled()
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

function FormState() {
  return <p>{JSON.stringify(useLocation().state)}</p>
}
