import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { Meal } from '@/lib/meals'
import type { Ingredient } from '@/lib/recipes'
import type { ShoppingItem } from '@/lib/shopping'
import { ERIC, LUCILE, fakeApi, mealFixture, renderWithApp, type FakeApi } from '@/test/fakes'
import { PlanningPage } from './PlanningPage'
import { ShoppingListPage } from './ShoppingListPage'

const TODAY = '2026-10-20'
const ing = (name: string, quantity: number | null = null, unit: string | null = null): Ingredient => ({ name, quantity, unit, note: null })

const PAST = mealFixture({ id: 'm0', meal_date: '2026-10-19', recipe: { id: 'r0', is_saved: true, title: 'Soupe' } })
const TARTIFLETTE = mealFixture({
  id: 'm1',
  meal_date: '2026-10-21',
  slot: 'DINNER',
  people: [LUCILE.id, ERIC.id],
  recipe: { id: 'r1', is_saved: true, title: 'Tartiflette' },
})
const GRATIN = mealFixture({ id: 'm2', meal_date: '2026-10-22', recipe: { id: 'r2', is_saved: true, title: 'Gratin' } })
const CURRY = mealFixture({ id: 'm3', meal_date: '2026-10-22', slot: 'DINNER', recipe: { id: 'r3', title: 'Curry', url: 'https://exemple.fr/curry' } })
const BASQUAISE = mealFixture({ id: 'm4', meal_date: '2026-10-23', recipe: { id: 'r4', title: 'Poulet basquaise' } })
const MEALS = [GRATIN, PAST, TARTIFLETTE, CURRY, BASQUAISE]

function setup(meals: Meal[] = MEALS, api: FakeApi = fakeApi()) {
  api.meals.listMeals.mockResolvedValue(meals)
  api.recipes.getIngredients.mockResolvedValue([
    { id: 'r0', servings: 2, ingredients: [ing('poireaux', 2)] },
    { id: 'r1', servings: 4, ingredients: [ing('pommes de terre', 1, 'kg'), ing('reblochon', 1), ing('oignons jaunes', 2), ing('sel')] },
    { id: 'r2', servings: null, ingredients: [ing('pommes de terre', 500, 'g'), ing('oignon', 1)] },
  ])
  api.recipes.importFromUrl.mockResolvedValue({
    recipe: { title: 'Curry', servings: 1, ingredients: [ing('lait de coco', 40, 'cl')], steps: '', tags: [] },
    source: 'structured',
    image: null,
  })
  api.shopping.tidy.mockImplementation(async (lines) =>
    lines.map((l) => ({ id: l.id, name: l.name === 'oignons jaunes' ? 'oignon' : l.name, aisle: l.aisle, pantry: false })),
  )
  const result = renderWithApp(<PlanningPage today={TODAY} />, {
    api,
    route: '/planning',
    path: '/planning',
    extraRoutes: <Route path="/courses/:id" element={<ShoppingListPage />} />,
  })
  return { ...result, user: userEvent.setup() }
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Liste de courses' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Liste de courses' }))
  return screen.findByRole('dialog', { name: 'Liste de courses' })
}

async function preview(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openDialog(user)
  await user.click(within(dialog).getByRole('button', { name: /Préparer la liste/ }))
  await within(dialog).findByRole('button', { name: /Créer la liste/ })
  return dialog
}

const lineNames = (dialog: HTMLElement) => within(dialog).getAllByTestId('draft-line').map((l) => l.textContent)

describe('PlanningPage — liste de courses depuis le planning', () => {
  it('propose les repas de la semaine, ceux à venir cochés', async () => {
    const { user } = setup()
    const dialog = await openDialog(user)
    expect(within(dialog).getByRole('checkbox', { name: /Soupe/ })).not.toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Tartiflette/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /Tartiflette/ }).closest('li')).toHaveTextContent('Soir · 2 pers.Recette')
    expect(within(dialog).getByRole('checkbox', { name: /Curry/ }).closest('li')).toHaveTextContent('Lien')
    expect(within(dialog).getByRole('checkbox', { name: /Poulet basquaise/ }).closest('li')).toHaveTextContent('Sans ingrédients')
    expect(within(dialog).getByRole('button', { name: 'Préparer la liste (4 repas)' })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: 'Tout décocher' }))
    expect(within(dialog).getByRole('button', { name: 'Préparer la liste (0 repas)' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Tout cocher' }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Curry/ }))
    expect(within(dialog).getByRole('button', { name: 'Préparer la liste (4 repas)' })).toBeEnabled()
  })

  it('prépare l’aperçu, crée la liste et montre ce qui n’a pas été repris', async () => {
    const { user, api } = setup()
    const dialog = await preview(user)

    expect(api.recipes.getIngredients).toHaveBeenCalledWith(['r1', 'r2'])
    expect(api.recipes.importFromUrl).toHaveBeenCalledWith('https://exemple.fr/curry')
    expect(api.shopping.tidy).toHaveBeenCalledWith(expect.arrayContaining([{ id: 'd3', name: 'oignons jaunes', quantity: 1, unit: null, aisle: 'FRUITS_LEGUMES' }]))
    // Oignons du gratin et de la tartiflette fusionnés après le renommage ; pommes de terre additionnées (500 g + 0,5 kg).
    expect(lineNames(dialog)).toEqual([
      expect.stringMatching(/^Modifier Pommes de terreTartiflette, Gratin1 kg$/),
      expect.stringMatching(/^Modifier OignonTartiflette, Gratin2$/),
      expect.stringMatching(/^Modifier ReblochonTartiflette1$/),
      expect.stringMatching(/^Modifier Lait de cocoCurry40 cl$/),
      expect.stringMatching(/^Modifier SelTartiflette$/),
    ])
    expect(within(dialog).getByRole('checkbox', { name: 'Acheter « Sel »' })).not.toBeChecked()
    expect(within(dialog).getByText(/Quantités non adaptées.*Gratin/)).toBeInTheDocument()
    const skipped = within(dialog).getByRole('region', { name: 'Non repris (1)' })
    expect(skipped).toHaveTextContent('Poulet basquaise')
    expect(skipped).toHaveTextContent('Sans ingrédients · Vendredi 23 octobre · Midi')

    await user.click(within(dialog).getByRole('button', { name: 'Créer la liste (4 articles)' }))
    expect(api.shopping.createList).toHaveBeenCalledWith('Courses du 20 oct.')
    expect(api.shopping.addItems).toHaveBeenCalledWith(
      'new-list',
      [
        { name: 'Pommes de terre', quantity: 1, unit: 'kg', aisle: 'FRUITS_LEGUMES' },
        { name: 'Reblochon', quantity: 1, unit: null, aisle: 'CREMERIE' },
        { name: 'Oignon', quantity: 2, unit: null, aisle: 'FRUITS_LEGUMES' },
        { name: 'Lait de coco', quantity: 40, unit: 'cl', aisle: 'EPICERIE_SALEE' },
      ],
      0,
    )
    expect(await screen.findByText('4 articles ajoutés')).toBeInTheDocument()

    // Sur la liste : les éléments non repris, pour les ajouter à la main.
    const panel = await screen.findByRole('region', { name: 'Non repris (2)' })
    expect(panel).toHaveTextContent('Poulet basquaise')
    expect(panel).toHaveTextContent('SelDécoché · Tartiflette')
    await user.click(within(panel).getByRole('button', { name: 'Ajouter « Sel »' }))
    expect(api.shopping.addItem).toHaveBeenCalledWith('new-list', { name: 'Sel', quantity: null, unit: null, aisle: 'EPICERIE_SALEE' }, 0)
    expect(screen.getByRole('region', { name: 'Non repris (1)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fermer « Non repris »' }))
    expect(screen.queryByRole('region', { name: /Non repris/ })).not.toBeInTheDocument()
  })

  it('se passe du regroupement automatique s’il échoue, et signale une page illisible', async () => {
    const { user, api } = setup([CURRY, TARTIFLETTE, BASQUAISE])
    api.shopping.tidy.mockRejectedValue(new AppError('Regroupement automatique indisponible.'))
    api.recipes.importFromUrl.mockRejectedValue(new AppError('Page protégée'))
    const dialog = await preview(user)
    expect(within(dialog).getByText(/Regroupement automatique indisponible/)).toBeInTheDocument()
    expect(lineNames(dialog).map((t) => t!.replace(/Tartiflette.*/, ''))).toEqual(['Modifier Pommes de terre', 'Modifier Oignons jaunes', 'Modifier Reblochon', 'Modifier Sel'])

    const skipped = within(dialog).getByRole('region', { name: 'Non repris (2)' })
    expect(skipped).toHaveTextContent('CurryPage illisible · Jeudi 22 octobre · Soir')
    expect(within(skipped).getByRole('link', { name: 'Ouvrir la recette « Curry »' })).toHaveAttribute('href', 'https://exemple.fr/curry')

    await user.click(within(skipped).getByRole('button', { name: 'Ajouter « Curry » comme article' }))
    expect(within(dialog).getByRole('region', { name: 'Non repris (1)' })).toBeInTheDocument()
    expect(lineNames(dialog)).toContain('Modifier Ingrédients : CurryCurry')
    expect(within(dialog).getByRole('button', { name: 'Créer la liste (4 articles)' })).toBeEnabled()
  })

  it('complète une liste existante en additionnant les quantités', async () => {
    const api = fakeApi()
    api.shopping.listLists.mockResolvedValue([{ id: 'l1', name: 'Marché', updated_at: '2026-10-19T10:00:00Z', total: 2, checked: 0 }])
    const existing: ShoppingItem[] = [
      { id: 'i1', list_id: 'l1', name: 'Pommes de terre', quantity: 500, unit: 'g', aisle: 'FRUITS_LEGUMES', checked: false, position: 3 },
    ]
    api.shopping.listItems.mockResolvedValue(existing)
    const { user } = setup([TARTIFLETTE], api)
    const dialog = await preview(user)
    await user.click(within(dialog).getByRole('radio', { name: 'Compléter une liste' }))
    expect(within(dialog).getByLabelText('Liste à compléter')).toHaveValue('l1')
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter (3 articles)' }))
    expect(api.shopping.updateItem).toHaveBeenCalledWith('i1', { quantity: 1000 })
    expect(api.shopping.addItems).toHaveBeenCalledWith(
      'l1',
      [
        { name: 'Reblochon', quantity: 1, unit: null, aisle: 'CREMERIE' },
        { name: 'Oignon', quantity: 1, unit: null, aisle: 'FRUITS_LEGUMES' },
      ],
      4,
    )
    expect(api.shopping.createList).not.toHaveBeenCalled()
  })

  it('permet de corriger ou retirer un article de l’aperçu, et de revenir aux repas', async () => {
    const { user, api } = setup([TARTIFLETTE])
    const dialog = await preview(user)
    await user.click(within(dialog).getByRole('button', { name: /Modifier Reblochon/ }))
    const edit = await screen.findByRole('dialog', { name: "Modifier l'article" })
    await user.clear(within(edit).getByLabelText('Quantité'))
    await user.type(within(edit).getByLabelText('Quantité'), '2')
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: "Modifier l'article" })).not.toBeInTheDocument())
    expect(within(dialog).getByRole('button', { name: /Modifier Reblochon/ })).toHaveTextContent(/2$/)

    await user.click(within(dialog).getByRole('button', { name: /Modifier Oignon/ }))
    await user.click(within(await screen.findByRole('dialog', { name: "Modifier l'article" })).getByRole('button', { name: 'Supprimer' }))
    expect(within(dialog).getByRole('checkbox', { name: 'Acheter « Oignon »' })).not.toBeChecked()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Acheter « Oignon »' }))
    expect(within(dialog).getByRole('checkbox', { name: 'Acheter « Oignon »' })).toBeChecked()

    await user.clear(within(dialog).getByLabelText('Nom de la liste'))
    expect(within(dialog).getByRole('button', { name: /Créer la liste/ })).toBeDisabled()
    await user.type(within(dialog).getByLabelText('Nom de la liste'), 'x'.repeat(81))
    expect(within(dialog).getByText('80 caractères maximum')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    expect(within(dialog).getByRole('button', { name: 'Préparer la liste (1 repas)' })).toBeInTheDocument()
    expect(api.shopping.createList).not.toHaveBeenCalled()
  })

  it('affiche les erreurs sans perdre la sélection', async () => {
    const api = fakeApi()
    const { user } = setup([TARTIFLETTE], api)
    api.recipes.getIngredients.mockRejectedValueOnce(new AppError('Impossible de charger les ingrédients.'))
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /Préparer la liste/ }))
    expect(await screen.findByText('Impossible de charger les ingrédients.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Préparer la liste (1 repas)' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Préparer la liste/ }))
    api.shopping.createList.mockRejectedValueOnce(new AppError('Impossible de créer la liste.'))
    await user.click(await within(dialog).findByRole('button', { name: /Créer la liste/ }))
    expect(await screen.findByText('Impossible de créer la liste.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Liste de courses' })).toBeInTheDocument()
  })

  it('peut être annulé pendant la lecture des recettes', async () => {
    const api = fakeApi()
    const { user } = setup([CURRY], api)
    let finish: () => void = () => undefined
    api.recipes.importFromUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ recipe: { title: 'Curry', servings: 1, ingredients: [ing('riz', 100, 'g')], steps: '', tags: [] }, source: 'text', image: null })
        }),
    )
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /Préparer la liste/ }))
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Lecture des recettes…')
    await user.click(within(dialog).getByRole('button', { name: 'Retour' }))
    finish()
    await waitFor(() => expect(api.recipes.importFromUrl).toHaveBeenCalled())
    expect(within(dialog).getByRole('button', { name: /Préparer la liste/ })).toBeInTheDocument()
    expect(api.shopping.tidy).not.toHaveBeenCalled()
  })

  it('indique quand aucun ingrédient n’a été trouvé', async () => {
    const { user } = setup([BASQUAISE])
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: /Préparer la liste/ }))
    expect(await within(dialog).findByText('Aucun ingrédient trouvé.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Créer la liste (0 article)' })).toBeDisabled()
  })
})

describe('PlanningPage — liste de courses, semaine vide', () => {
  it('explique qu’il n’y a rien à prendre en compte', async () => {
    const api = fakeApi()
    renderWithApp(<PlanningPage today={TODAY} />, { api, route: '/planning', path: '/planning' })
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Liste de courses' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Liste de courses' }))
    const dialog = await screen.findByRole('dialog', { name: 'Liste de courses' })
    expect(dialog).toHaveTextContent('Aucun repas planifié cette semaine.')
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
