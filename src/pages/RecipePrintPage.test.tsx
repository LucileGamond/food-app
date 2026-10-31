import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { Recipe } from '@/lib/recipes'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { RecipePrintPage } from './RecipePrintPage'

const TARTE: Recipe = {
  id: 'r1',
  is_saved: true,
  title: 'Tarte aux pommes',
  notes: '1. Préchauffer le four.\n2. Cuire 30 min.',
  url: 'https://exemple.fr/tarte',
  servings: 4,
  tags: ['dessert'],
  ingredients: [
    { name: 'pommes', quantity: 4, unit: null, note: null, section: null },
    { name: 'sucre', quantity: 50, unit: 'g', note: null, section: 'Pour le caramel' },
  ],
  photos: [],
  source: 'Pâtisserie maison',
  source_page: '146',
  cook_minutes: 30,
}

function renderPrint(api = fakeApi(), route = '/recettes/r1/imprimer?personnes=6') {
  renderWithApp(<RecipePrintPage />, {
    api,
    route,
    path: '/recettes/:id/imprimer',
    extraRoutes: <Route path="/recettes/:id" element={<p>Fiche recette</p>} />,
  })
  return { user: userEvent.setup(), api }
}

describe('RecipePrintPage', () => {
  const print = vi.fn()
  beforeEach(() => {
    print.mockReset()
    vi.stubGlobal('print', print)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('affiche la fiche pour le nombre de personnes choisi et ouvre la boîte d’impression une seule fois', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    const { user } = renderPrint(api)
    expect(await screen.findByRole('heading', { name: 'Tarte aux pommes' })).toBeInTheDocument()
    expect(screen.getByText(/^6 personnes · .*Pâtisserie maison, p\. 146$/)).toBeInTheDocument()
    const ingredients = screen.getByRole('region', { name: 'Ingrédients' })
    expect(within(ingredients).getByText('6 pommes')).toBeInTheDocument()
    expect(within(ingredients).getByText('Pour le caramel')).toBeInTheDocument()
    const steps = within(screen.getByRole('region', { name: 'Préparation' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual(['1.Préchauffer le four.', '2.Cuire 30 min.'])
    expect(screen.getByText('https://exemple.fr/tarte')).toBeInTheDocument()

    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Imprimer ou enregistrer en PDF' }))
    expect(print).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('link', { name: 'Retour' }))
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
  })

  it('sans nombre de personnes, quantités de la recette ; recette vide', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({ ...TARTE, notes: null, ingredients: [], tags: [], url: null, source: null, source_page: null, cook_minutes: null, servings: 1 })
    renderPrint(api, '/recettes/r1/imprimer')
    expect(await screen.findByText('1 personne')).toBeInTheDocument()
    expect(screen.getByText('Aucun ingrédient renseigné.')).toBeInTheDocument()
    expect(screen.getByText('Aucune étape renseignée.')).toBeInTheDocument()
  })

  it('erreur de chargement, réessai, recette introuvable : rien à imprimer', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockRejectedValueOnce(new AppError('Hors ligne')).mockResolvedValueOnce(null)
    const { user } = renderPrint(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Recette introuvable')).toBeInTheDocument()
    expect(print).not.toHaveBeenCalled()
  })
})
