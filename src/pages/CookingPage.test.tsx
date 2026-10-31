import { act, screen, waitFor, within } from '@testing-library/react'
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

  it('coche ingrédients et étapes, met en avant l’étape en cours, et enregistre la progression', async () => {
    const { user, api } = renderCooking()
    await screen.findByRole('heading', { name: 'Tarte aux pommes' })
    const step = (n: number) => screen.getByRole('checkbox', { name: `Étape ${n} faite` })
    const current = () => document.querySelector('[aria-current="step"]')?.textContent

    expect(current()).toContain('Préchauffer')
    expect(screen.queryByRole('button', { name: 'Terminer la recette' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '6 pommes' }))
    expect(screen.getByRole('checkbox', { name: '6 pommes' })).toHaveAttribute('aria-checked', 'true')
    await user.click(step(1))
    expect(step(1)).toHaveAttribute('aria-checked', 'true')
    expect(current()).toContain('Étaler')
    await waitFor(() => expect(api.recipes.saveProgress).toHaveBeenLastCalledWith('r1', { ingredients: [0], steps: [0], people: 6 }))
    expect(screen.getByText(/ta progression est gardée/)).toBeInTheDocument()

    await user.click(step(2))
    await user.click(step(3))
    expect(screen.getByRole('status')).toHaveTextContent('Toutes les étapes sont faites')
  })

  it('reprend la progression enregistrée (autre jour, autre appareil)', async () => {
    const api = fakeApi()
    api.recipes.getProgress.mockResolvedValue({ ingredients: [1], steps: [0, 1], updatedAt: '2026-10-30T18:00:00Z' })
    renderCooking(api, '/recettes/r1/cuisiner')
    expect(await screen.findByRole('checkbox', { name: '50 g sucre' })).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Cuire')
    expect(api.recipes.getProgress).toHaveBeenCalledWith('r1')
    // Sans nombre dans l'adresse ni dans la séance : celui de la recette.
    expect(screen.getByText('4 personnes')).toBeInTheDocument()
  })

  it('reprend avec le nombre de personnes de la séance, et l’enregistre quand il change', async () => {
    const api = fakeApi()
    api.recipes.getProgress.mockResolvedValue({ ingredients: [], steps: [0], people: 2, updatedAt: '2026-10-30T18:00:00Z' })
    const { user } = renderCooking(api, '/recettes/r1/cuisiner')
    expect(await screen.findByText('2 personnes')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '2 pommes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Une personne de plus' }))
    await waitFor(() => expect(api.recipes.saveProgress).toHaveBeenLastCalledWith('r1', { ingredients: [], steps: [0], people: 3 }))
  })

  it('« Terminer la recette » efface la progression et revient à la fiche', async () => {
    const api = fakeApi()
    api.recipes.getProgress.mockResolvedValue({ ingredients: [], steps: [0], updatedAt: '2026-10-30T18:00:00Z' })
    const { user } = renderCooking(api)
    await user.click((await screen.findAllByRole('button', { name: 'Terminer la recette' }))[0]!)
    expect(api.recipes.saveProgress).toHaveBeenCalledWith('r1', { ingredients: [], steps: [] })
    expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
    expect(screen.getByText('Recette terminée')).toBeInTheDocument()
  })

  it('« Terminer » attend l’enregistrement en cours, et reste sur place s’il échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    let release: () => void = () => undefined
    api.recipes.saveProgress
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockRejectedValueOnce(new AppError('Hors ligne'))
    renderCooking(api)
    await user.click(await screen.findByRole('checkbox', { name: 'Étape 1 faite' }))
    const finish = screen.getAllByRole('button', { name: 'Terminer la recette' })[0]!
    await user.click(finish)
    // L'effacement n'est envoyé qu'après l'enregistrement en cours.
    expect(api.recipes.saveProgress).toHaveBeenCalledTimes(1)
    release()
    expect(await screen.findByText('Hors ligne')).toBeInTheDocument()
    expect(api.recipes.saveProgress).toHaveBeenLastCalledWith('r1', { ingredients: [], steps: [] })
    expect(screen.getByRole('heading', { name: 'Tarte aux pommes' })).toBeInTheDocument()
  })

  it('signale une seule fois un enregistrement en échec, les cases restent cochées', async () => {
    const api = fakeApi()
    api.recipes.saveProgress.mockRejectedValue(new AppError('Hors ligne'))
    const { user } = renderCooking(api)
    await user.click(await screen.findByRole('checkbox', { name: 'Étape 1 faite' }))
    await user.click(screen.getByRole('checkbox', { name: 'Étape 2 faite' }))
    await waitFor(() => expect(api.recipes.saveProgress).toHaveBeenCalledTimes(2))
    expect(screen.getAllByText('Progression non enregistrée : Hors ligne')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'Étape 2 faite' })).toHaveAttribute('aria-checked', 'true')
  })

  it('sans progression lisible, ne commence pas à zéro par-dessus : erreur et réessai', async () => {
    const api = fakeApi()
    api.recipes.getProgress.mockRejectedValueOnce(new AppError('Impossible de charger la progression.'))
    const { user } = renderCooking(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la progression.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { name: 'Tarte aux pommes' })).toBeInTheDocument()
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

  describe('minuteurs', () => {
    const KEY = 'food-app:minuteurs:r1'
    afterEach(() => {
      localStorage.clear()
      delete (navigator as { vibrate?: unknown }).vibrate
    })

    it('lance un minuteur depuis une durée d’étape, le met en pause, ajoute une minute et le supprime', async () => {
      const { user } = renderCooking()
      await user.click(await screen.findByRole('button', { name: 'Lancer un minuteur de 30 min' }))
      const bar = screen.getByRole('region', { name: 'Minuteurs' })
      expect(within(bar).getByText('Étape 3 · 30 min')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Minuteur lancé : 30 min ?· / })).toBeInTheDocument()
      // Gardé dans le navigateur (heure de fin) : il survit au rechargement de la page.
      expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject([{ id: 'etape-2-6', label: 'Étape 3 · 30 min', seconds: 1800 }])
      // Relancer la même durée ne crée pas de doublon.
      await user.click(screen.getByRole('button', { name: /^Minuteur lancé : 30 min ?· / }))
      expect(within(bar).getAllByRole('listitem')).toHaveLength(1)

      await user.click(within(bar).getByRole('button', { name: 'Mettre en pause : Étape 3 · 30 min' }))
      const remaining = within(bar).getByText(/^(29:5\d|30:00)$/).textContent
      await user.click(within(bar).getByRole('button', { name: 'Une minute de plus : Étape 3 · 30 min' }))
      expect(within(bar).getByText(String(Number(remaining!.split(':')[0]) + 1) + ':' + remaining!.split(':')[1])).toBeInTheDocument()
      await user.click(within(bar).getByRole('button', { name: 'Reprendre : Étape 3 · 30 min' }))
      expect(within(bar).getByRole('button', { name: 'Mettre en pause : Étape 3 · 30 min' })).toBeInTheDocument()

      await user.click(within(bar).getByRole('button', { name: 'Supprimer : Étape 3 · 30 min' }))
      expect(screen.queryByRole('region', { name: 'Minuteurs' })).not.toBeInTheDocument()
      expect(localStorage.getItem(KEY)).toBeNull()
    })

    it('sur Android, propose de lancer le minuteur du téléphone avec le temps restant', async () => {
      const userAgent = vi.spyOn(navigator, 'userAgent', 'get')
      try {
        const { user } = renderCooking()
        await user.click(await screen.findByRole('button', { name: 'Lancer un minuteur de 30 min' }))
        expect(screen.queryByRole('link', { name: /Minuteur du téléphone/ })).not.toBeInTheDocument()

        userAgent.mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile')
        await user.click(screen.getByRole('button', { name: /^Mettre en pause/ }))
        const link = screen.getByRole('link', { name: 'Minuteur du téléphone : Étape 3 · 30 min' })
        expect(link.getAttribute('href')).toMatch(/^intent:#Intent;action=android\.intent\.action\.SET_TIMER;i\.android\.intent\.extra\.alarm\.LENGTH=(1799|1800);/)
      } finally {
        userAgent.mockRestore()
      }
    })

    it('lance un minuteur libre', async () => {
      const { user } = renderCooking()
      await user.click(await screen.findByRole('button', { name: 'Nouveau minuteur' }))
      const minutes = screen.getByRole('textbox', { name: 'Minutes' })
      await user.clear(minutes)
      expect(screen.getByRole('button', { name: 'Lancer' })).toBeDisabled()
      await user.type(minutes, '5')
      await user.click(screen.getByRole('button', { name: 'Lancer' }))
      expect(screen.queryByRole('form', { name: 'Nouveau minuteur' })).not.toBeInTheDocument()
      const bar = screen.getByRole('region', { name: 'Minuteurs' })
      expect(within(bar).getByText('Minuteur 5 min')).toBeInTheDocument()
      expect(within(bar).getByText(/^(4:5\d|5:00)$/)).toBeInTheDocument()
    })

    it('un minuteur terminé sonne jusqu’à ce qu’on l’arrête, ou repart pour une minute', async () => {
      const vibrate = vi.fn()
      Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
      const done = (id: string) => ({ id, label: `Étape ${id}`, seconds: 60, endsAt: Date.now() - 1000, remaining: 60_000 })
      localStorage.setItem(KEY, JSON.stringify([done('1'), done('2')]))
      const { user } = renderCooking()
      const bar = await screen.findByRole('region', { name: 'Minuteurs' })
      expect(within(bar).getAllByRole('alert')).toHaveLength(2)
      expect(vibrate).toHaveBeenCalled()

      await user.click(within(bar).getByRole('button', { name: 'Encore une minute : Étape 1' }))
      expect(within(bar).getAllByRole('alert')).toHaveLength(1)
      await user.click(within(bar).getByRole('button', { name: 'Arrêter' }))
      expect(within(bar).queryByRole('alert')).not.toBeInTheDocument()
      expect(within(bar).getByText(/^(0:5\d|1:00)$/)).toBeInTheDocument()
    })

    it('« Terminer la recette » supprime les minuteurs', async () => {
      const api = fakeApi()
      api.recipes.getProgress.mockResolvedValue({ ingredients: [], steps: [0], updatedAt: '2026-10-30T18:00:00Z' })
      const { user } = renderCooking(api)
      await user.click(await screen.findByRole('button', { name: 'Lancer un minuteur de 30 min' }))
      await user.click(screen.getAllByRole('button', { name: 'Terminer la recette' })[0]!)
      expect(await screen.findByText('Fiche recette')).toBeInTheDocument()
      expect(localStorage.getItem(KEY)).toBeNull()
    })
  })
})
