import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { InboxItem } from '@/lib/inbox'
import type { MealIdea } from '@/lib/mealIdeas'
import type { RecipeListItem } from '@/lib/recipes'
import { fakeApi, mealFixture, renderWithApp, type FakeApi } from '@/test/fakes'
import { PlanningPage } from './PlanningPage'

const TODAY = '2026-10-27'

const base = { protein: 'lentilles', vegetables: ['carotte', 'oignon'], starch: 'riz', vegetarian: true, why: 'Rapide et de saison' }
const IDEAS: MealIdea[] = [
  { ...base, source: 'saved', recipeId: 'r1', title: 'Curry de lentilles' },
  { ...base, source: 'web', url: 'https://www.marmiton.org/recettes/courge.aspx', site: 'Marmiton', title: 'Curry de courge', protein: 'pois chiches', vegetables: ['courge'], starch: 'semoule' },
  { ...base, source: 'web', url: 'https://www.750g.com/saumon.htm', site: '750g', title: 'Saumon aux poireaux', protein: 'saumon', vegetables: ['poireau'], starch: 'pommes de terre', vegetarian: false, why: '' },
]

const recipe = (id: string, title: string): RecipeListItem => ({ id, title, tags: [], ingredientNames: ['riz'], mainPhotoPath: null })

function setup(api: FakeApi = fakeApi()) {
  api.recipes.listSavedRecipes.mockResolvedValue([recipe('r1', 'Curry de lentilles'), recipe('r2', 'Tartiflette')])
  api.meals.listMeals.mockResolvedValue([mealFixture({ meal_date: '2026-10-20', recipe: { id: 'r2', is_saved: true, title: 'Tartiflette' } })])
  api.ideas.suggestMeals.mockResolvedValue(IDEAS)
  renderWithApp(<PlanningPage today={TODAY} />, { api, route: '/planning', path: '/planning' })
  return { api, user: userEvent.setup() }
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Idées de repas' }))
  return screen.findByRole('dialog', { name: 'Idées de repas' })
}

describe('PlanningPage — idées de repas', () => {
  it('cherche des idées sans les recettes récentes, puis les affiche décochées', async () => {
    const { api, user } = setup()
    const dialog = await open(user)
    const list = await within(dialog).findByRole('list', { name: 'Idées proposées' })

    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-10-12', '2026-11-03')
    expect(api.ideas.suggestMeals).toHaveBeenCalledWith({
      today: TODAY,
      candidates: [{ id: 'r1', title: 'Curry de lentilles', ingredients: ['riz'], tags: [] }],
      recent: ['Tartiflette'],
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Curry de lentillesVégélentilles · carotte, oignon · rizRapide et de saison Tes recettes')
    expect(items[2]).toHaveTextContent('Viande ou poisson')
    expect(within(items[1]!).getByRole('link', { name: /Marmiton/ })).toHaveAttribute('href', 'https://www.marmiton.org/recettes/courge.aspx')
    expect(within(dialog).getAllByRole('checkbox').every((c) => c.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Ajouter à « À planifier »' })).toBeDisabled()
  })

  it('ajoute les idées cochées à « À planifier »', async () => {
    const { api, user } = setup()
    const dialog = await open(user)
    await within(dialog).findByRole('list', { name: 'Idées proposées' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Curry de lentilles' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Saumon aux poireaux' }))
    api.inbox.listItems.mockResolvedValue([{ id: 'i1', title: 'Curry de lentilles' } as InboxItem])
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter à « À planifier » (2)' }))

    expect(api.inbox.addItem.mock.calls).toEqual([[{ recipeId: 'r1' }], [{ title: 'Saumon aux poireaux', url: 'https://www.750g.com/saumon.htm' }]])
    expect(await screen.findByText('2 idées ajoutées à « À planifier »')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.inbox.listItems.mock.calls.length).toBeGreaterThan(1)
  })

  it('ignore une idée déjà dans « À planifier », et garde la fenêtre ouverte en cas d’erreur', async () => {
    const { api, user } = setup()
    api.inbox.addItem.mockRejectedValueOnce(new AppError('Déjà dans la liste « À planifier ».', '23505'))
    let dialog = await open(user)
    await within(dialog).findByRole('list', { name: 'Idées proposées' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Curry de lentilles' }))
    await user.click(within(dialog).getByRole('button', { name: /Ajouter/ }))
    expect(await screen.findByText('Déjà dans « À planifier »')).toBeInTheDocument()

    api.inbox.addItem.mockRejectedValueOnce(new AppError('Connexion impossible.'))
    dialog = await open(user)
    await within(dialog).findByRole('list', { name: 'Idées proposées' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Curry de courge' }))
    await user.click(within(dialog).getByRole('button', { name: /Ajouter/ }))
    expect(await screen.findByText('Connexion impossible.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Idées de repas' })).toBeInTheDocument()
  })

  it('relance une recherche, et propose de réessayer après une erreur', async () => {
    const { api, user } = setup()
    api.ideas.suggestMeals.mockRejectedValueOnce(new AppError('La recherche web n’est pas activée pour le service d’analyse.'))
    const dialog = await open(user)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La recherche web n’est pas activée')
    await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }))
    await within(dialog).findByRole('list', { name: 'Idées proposées' })

    await user.click(within(dialog).getByRole('checkbox', { name: 'Curry de lentilles' }))
    let resolve: (ideas: MealIdea[]) => void = () => undefined
    api.ideas.suggestMeals.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    await user.click(within(dialog).getByRole('button', { name: 'Autres idées' }))
    expect(within(dialog).getByRole('status')).toHaveTextContent('Recherche d’idées…')
    resolve([IDEAS[2]!])
    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(1)
    // Nouvelle recherche : rien de coché
    expect(within(dialog).getByRole('button', { name: 'Ajouter à « À planifier »' })).toBeDisabled()
    expect(api.ideas.suggestMeals).toHaveBeenCalledTimes(3)
  })

  it('ignore la réponse d’une recherche abandonnée en fermant la fenêtre', async () => {
    const { api, user } = setup()
    let resolve: (ideas: MealIdea[]) => void = () => undefined
    api.ideas.suggestMeals.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    const dialog = await open(user)
    await within(dialog).findByRole('status')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    resolve(IDEAS)
    // Rouverte : nouvelle recherche, sans afficher l'ancienne réponse entre-temps
    api.ideas.suggestMeals.mockImplementationOnce(() => new Promise(() => undefined))
    const reopened = await open(user)
    expect(within(reopened).getByRole('status')).toBeInTheDocument()
    expect(within(reopened).queryByRole('list', { name: 'Idées proposées' })).not.toBeInTheDocument()
  })
})
