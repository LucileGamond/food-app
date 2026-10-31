import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { Recipe } from '@/lib/recipes'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { CookingPage } from './CookingPage'

const TARTE: Recipe = {
  id: 'r1',
  is_saved: true,
  title: 'Tarte aux pommes',
  notes: '1. Préchauffer le four.\n2. Étaler la pâte.\n3. Cuire 30 min.',
  url: null,
  servings: 4,
  tags: [],
  ingredients: [
    { name: 'pommes', quantity: 4, unit: null, note: null, section: null },
    { name: 'sucre', quantity: 50, unit: 'g', note: null, section: 'Pour le caramel' },
  ],
  photos: [],
}

function renderCooking(api = fakeApi(), route = '/recettes/r1/cuisiner?personnes=6') {
  api.recipes.getRecipe.mockResolvedValue(TARTE)
  renderWithApp(<CookingPage />, {
    api,
    route,
    path: '/recettes/:id/cuisiner',
    extraRoutes: <Route path="/recettes/:id" element={<p>Fiche recette</p>} />,
  })
  return { user: userEvent.setup(), api }
}

type Sentinel = { release: ReturnType<typeof vi.fn>; addEventListener: (t: string, l: () => void) => void; fire: () => void }

function mockWakeLock() {
  const sentinels: Sentinel[] = []
  const request = vi.fn(async () => {
    let listener = () => undefined as void
    const sentinel: Sentinel = {
      release: vi.fn(async () => undefined),
      addEventListener: (_t, l) => void (listener = l),
      fire: () => listener(),
    }
    sentinels.push(sentinel)
    return sentinel
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, sentinels }
}

describe('CookingPage', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    delete (navigator as { wakeLock?: unknown }).wakeLock
  })

  it('affiche les ingrédients pour le nombre de personnes choisi et les étapes numérotées', async () => {
    const { user } = renderCooking()
    expect(await screen.findByRole('heading', { name: 'Tarte aux pommes' })).toBeInTheDocument()
    expect(screen.getByText('6 personnes')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '6 pommes' })).toBeInTheDocument()
    expect(screen.getByText('Pour le caramel')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '75 g sucre' })).toBeInTheDocument()

    expect(screen.getAllByRole('checkbox', { name: /^Étape/ })).toHaveLength(3)
    expect(screen.getByText('Étaler la pâte.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Une personne de moins' }))
    expect(screen.getByRole('checkbox', { name: '5 pommes' })).toBeInTheDocument()
  })

  it('coche ingrédients et étapes, met en avant l’étape en cours, et s’en souvient pendant la séance', async () => {
    const { user } = renderCooking()
    await screen.findByRole('heading', { name: 'Tarte aux pommes' })
    const step = (n: number) => screen.getByRole('checkbox', { name: `Étape ${n} faite` })
    const current = () => document.querySelector('[aria-current="step"]')?.textContent

    expect(current()).toContain('Préchauffer')
    await user.click(screen.getByRole('checkbox', { name: '6 pommes' }))
    expect(screen.getByRole('checkbox', { name: '6 pommes' })).toHaveAttribute('aria-checked', 'true')
    await user.click(step(1))
    expect(step(1)).toHaveAttribute('aria-checked', 'true')
    expect(current()).toContain('Étaler')
    expect(JSON.parse(sessionStorage.getItem('cuisine:r1')!)).toEqual({ ingredients: [0], steps: [0] })

    await user.click(step(2))
    await user.click(step(3))
    expect(screen.getByRole('status')).toHaveTextContent('Toutes les étapes sont faites')

    await user.click(screen.getByRole('button', { name: 'Recommencer' }))
    expect(step(1)).toHaveAttribute('aria-checked', 'false')
    expect(sessionStorage.getItem('cuisine:r1')).toBeNull()
  })

  it('reprend les cases cochées de la séance', async () => {
    sessionStorage.setItem('cuisine:r1', JSON.stringify({ ingredients: [1], steps: [0, 1] }))
    renderCooking(fakeApi(), '/recettes/r1/cuisiner')
    expect(await screen.findByRole('checkbox', { name: '50 g sucre' })).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Cuire')
    // Sans nombre dans l'adresse : celui de la recette.
    expect(screen.getByText('4 personnes')).toBeInTheDocument()
  })

  it('garde l’écran allumé et le redemande au retour sur l’onglet', async () => {
    const { request, sentinels } = mockWakeLock()
    const { user } = renderCooking()
    expect(await screen.findByText('L’écran reste allumé.')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('screen')

    // Onglet caché : le navigateur relâche le verrou ; au retour, il est redemandé.
    act(() => sentinels[0]!.fire())
    expect(screen.queryByText('L’écran reste allumé.')).not.toBeInTheDocument()
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(request).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('L’écran reste allumé.')).toBeInTheDocument()

    await user.click(screen.getAllByRole('link', { name: 'Quitter le mode cuisine' })[0]!)
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(sentinels[1]!.release).toHaveBeenCalled()
  })

  it('sans maintien de l’écran possible, rien n’est affiché', async () => {
    Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn(async () => Promise.reject(new Error('refusé'))) }, configurable: true })
    renderCooking()
    await screen.findByRole('heading', { name: 'Tarte aux pommes' })
    expect(screen.queryByText('L’écran reste allumé.')).not.toBeInTheDocument()
  })

  it('erreur de chargement, réessai, recette introuvable', async () => {
    const api = fakeApi()
    api.recipes.getRecipe.mockRejectedValueOnce(new AppError('Hors ligne')).mockResolvedValueOnce(null)
    renderWithApp(<CookingPage />, { api, route: '/recettes/r1/cuisiner', path: '/recettes/:id/cuisiner' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Recette introuvable')).toBeInTheDocument()
  })
})
