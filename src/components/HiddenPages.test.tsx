import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import type { Recipe } from '@/lib/recipes'
import { DEFAULT_SETTINGS, type PageKey } from '@/lib/settings'
import type { InboxItem } from '@/lib/inbox'
import { fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { PlanningPage } from '@/pages/PlanningPage'
import { RecipeDetailPage } from '@/pages/RecipeDetailPage'
import { SharePage } from '@/pages/SharePage'

// Une page masquée dans les réglages : les autres écrans n'y mènent plus.

function hiding(...pages: PageKey[]) {
  const api = fakeApi()
  api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: pages })
  return api
}

const RECIPE: Recipe = { id: 'r1', is_saved: true, title: 'Curry', notes: null, url: null, servings: 4, tags: [], ingredients: [{ name: 'riz', quantity: 1, unit: 'kg', note: null }], photos: [] }

describe('pages masquées', () => {
  it('Planning sans Recettes ni Courses : pas de lien vers la recette ni de liste de courses', async () => {
    const user = userEvent.setup()
    const api = hiding('recettes', 'courses')
    api.meals.listMeals.mockResolvedValue([
      mealFixture({ meal_date: '2026-10-20', recipe: { id: 'r1', is_saved: true, title: 'Curry' } }),
      mealFixture({ id: 'm2', meal_date: '2026-10-20', slot: 'DINNER', recipe: { id: 'r2', title: 'Soupe' } }),
    ])
    api.inbox.listItems.mockResolvedValue([
      { id: 'i1', title: 'Gratin', url: 'https://exemple.fr/gratin', recipe_id: null, list: 'plan', photos: [], created_at: '' } as InboxItem,
    ])
    renderWithApp(<PlanningPage today="2026-10-20" />, { api, route: '/planning', path: '/planning' })
    expect(await screen.findByText('Curry')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Curry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Liste de courses' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions pour Soupe' }))
    expect(screen.queryByRole('menuitem', { name: 'Enregistrer la recette' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(await screen.findByRole('button', { name: 'Actions pour « Gratin »' }))
    expect(await screen.findByRole('menuitem', { name: 'Supprimer' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Préremplir et enregistrer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mettre de côté' })).not.toBeInTheDocument()
  })

  it('fiche recette sans Courses ni Planning : ni « Courses » ni « À planifier »', async () => {
    const api = hiding('courses', 'planning')
    api.recipes.getRecipe.mockResolvedValue(RECIPE)
    renderWithApp(<RecipeDetailPage />, { api, route: '/recettes/r1', path: '/recettes/:id' })
    expect(await screen.findByRole('heading', { name: 'Curry' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cuisiner/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Courses/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /À planifier/ })).not.toBeInTheDocument()
  })

  it('partage sans Recettes : seulement « À planifier »', async () => {
    const api = hiding('recettes')
    renderWithApp(<SharePage />, { api, route: '/partage?url=https%3A%2F%2Fexemple.fr%2Fcurry', path: '/partage' })
    const choices = await screen.findByRole('group', { name: 'Que faire de cette recette ?' })
    expect(within(choices).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['À planifier'])
    expect(screen.queryByRole('button', { name: /Préremplir/ })).not.toBeInTheDocument()
  })

  it('partage sans Recettes ni Planning : rien à choisir, on le dit', async () => {
    const api = hiding('recettes', 'planning')
    renderWithApp(<SharePage />, { api, route: '/partage?url=https%3A%2F%2Fexemple.fr%2Fcurry', path: '/partage' })
    expect(await screen.findByText('Affiche Recettes ou Planning dans les réglages pour garder cette recette.')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Que faire de cette recette ?' })).queryAllByRole('button')).toHaveLength(0)
  })

  it('idée partagée sans Planning : pas ajoutée, et on le dit', async () => {
    const api = hiding('planning')
    renderWithApp(<SharePage />, {
      api,
      route: '/partage?text=Raclette',
      path: '/partage',
      extraRoutes: <Route path="/" element={<p>Écran d’accueil</p>} />,
    })
    expect(await screen.findByText('Écran d’accueil')).toBeInTheDocument()
    expect(await screen.findByText('Le Planning est masqué dans tes réglages : l’idée n’a pas été ajoutée')).toBeInTheDocument()
    expect(api.inbox.addItem).not.toHaveBeenCalled()
  })
})
