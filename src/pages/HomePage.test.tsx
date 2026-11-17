import { AppError } from '@/api'
import { screen, waitFor, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import type { KnitProject, KnitStep } from '@/modules/tricot/lib/pattern'
import { LUCILE, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { plantFixture, ruleFixture } from '@/test/plants'
import { HomePage } from './HomePage'

const TODAY = '2026-11-09'

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos – côtes',
  instructions: 'Monter 64 m.',
  totalRows: 18,
  stitches: 64,
  sections: [],
  rowCount: 0, times: 1, pass: 1,
  notes: '',
  done: false,
  highlights: {},
  translation: null,
  ...overrides,
})

const PROJECT: KnitProject = {
  charts: [],
  chartHints: [],
  abbreviations: [],
  yarnChecks: [],
  sizes: [],
  sizeIndex: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  gauges: [],
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  pdfPath: null,
  steps: [step({ id: 's1', done: true, rowCount: 18 }), step({ id: 's2', position: 1, title: 'Emmanchures', rowCount: 23, totalRows: 30 })],
}

function setup(disabledPages: string[] = [], hour = 12) {
  const api = fakeApi()
  api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: disabledPages as never })
  api.meals.listMeals.mockResolvedValue([
    mealFixture({ id: 'd', meal_date: TODAY, slot: 'DINNER', recipe: { title: 'Gratin de courge' } }),
    mealFixture({ id: 'l', meal_date: TODAY, slot: 'LUNCH', recipe: { title: 'Curry coco' } }),
    mealFixture({ id: 't', meal_date: '2026-11-10', slot: 'LUNCH', recipe: { title: 'Demain' } }),
  ])
  // Arrosée tous les jours depuis janvier : toujours à arroser aujourd'hui.
  api.plants.listPlants.mockResolvedValue([plantFixture({ id: 'basilic', name: 'Basilic', rules: [ruleFixture({ first_watering_on: '2026-01-01', interval_unit: 'day', amount_ml: 100 })] })])
  api.knitting.listProjects.mockResolvedValue([
    { id: 'old', title: 'Bonnet', size: '4 ans', updatedAt: '2026-10-01T10:00:00Z', stepsDone: 2, stepsTotal: 2, current: null, hues: [] },
    { id: 'p1', title: 'Pull Bergamote', size: 'M', updatedAt: '2026-11-08T10:00:00Z', stepsDone: 1, stepsTotal: 2, current: { number: 2, title: 'Emmanchures', rowCount: 0, totalRows: 30, times: 1, pass: 1 }, hues: [] },
  ])
  api.knitting.getProject.mockResolvedValue(PROJECT)
  return { ...renderWithApp(<HomePage today={TODAY} hour={hour} />, { api }), user: setupUser() }
}

describe('HomePage', () => {
  it('résume le jour : repas, eau, plantes à arroser et tricot en cours', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Aujourd’hui' })).toBeInTheDocument()
    expect(screen.getByText('Lundi 9 novembre')).toBeInTheDocument()

    const meals = await screen.findByRole('region', { name: 'Repas' })
    await waitFor(() => expect(within(meals).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['MidiCurry coco', 'SoirGratin de courge']))
    expect(within(meals).getByRole('link', { name: 'Planning' })).toHaveAttribute('href', '/planning')

    expect(screen.getByRole('region', { name: 'Eau' })).toHaveTextContent('0 L sur 1,5 L')
    expect(await within(screen.getByRole('region', { name: 'Plantes à arroser' })).findByText(/Basilic/)).toBeInTheDocument()
    const knitting = await screen.findByRole('region', { name: 'Pull Bergamote' })
    expect(await within(knitting).findByText('Rang 24 à tricoter')).toBeInTheDocument()
    expect(within(knitting).getByText('Emmanchures')).toBeInTheDocument()
  })

  it('un verre, un arrosage et un rang en un geste', async () => {
    const { api, user } = setup()
    await user.click(await within(await screen.findByRole('region', { name: 'Eau' })).findByRole('button', { name: /^Grand verre/ }))
    expect(api.hydration.addIntake).toHaveBeenCalledWith(330)

    await user.click(await screen.findByRole('button', { name: 'Marquer Basilic comme arrosée' }))
    await waitFor(() => expect(api.plants.water).toHaveBeenCalledWith(expect.objectContaining({ plantId: 'basilic', amountMl: 100 })))

    const knitting = await screen.findByRole('region', { name: 'Pull Bergamote' })
    await user.click(await within(knitting).findByRole('button', { name: /1 rang/ }))
    await waitFor(() => expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 24 }))
  })

  it('un double appui sur un verre n’en note qu’un', async () => {
    const { api, user } = setup()
    let finish: () => void = () => undefined
    api.hydration.addIntake.mockImplementation(
      (volumeMl: number) => new Promise((resolve) => (finish = () => resolve({ id: 'w-1', volume_ml: volumeMl, drunk_at: new Date().toISOString() }))),
    )
    const glass = await within(await screen.findByRole('region', { name: 'Eau' })).findByRole('button', { name: /^Grand verre/ })
    await user.dblClick(glass)
    expect(api.hydration.addIntake).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(glass).toBeEnabled())
  })

  it('seulement les pages affichées', async () => {
    setup(['planning', 'hydratation'])
    expect(await screen.findByRole('region', { name: 'Plantes à arroser' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Pull Bergamote' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Repas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Eau' })).not.toBeInTheDocument()
  })

  it('chaque carte sans rien à montrer est absente ; aucune : un mot plutôt qu’une page vide', async () => {
    const { api } = setup(['plan'])
    api.meals.listMeals.mockResolvedValue([mealFixture({ meal_date: '2026-11-10' })])
    api.plants.listPlants.mockResolvedValue([])
    api.knitting.listProjects.mockResolvedValue([])
    // Objectif d'eau atteint
    api.hydration.listIntakes.mockResolvedValue([{ id: 'w', volume_ml: 1500, drunk_at: `${TODAY}T08:00:00Z` }])
    expect(await screen.findByText('Rien à signaler aujourd’hui.')).toBeVisible()
    await waitFor(() => expect(api.activity.listRecent).toHaveBeenCalled())
    for (const name of ['Repas', 'Eau', 'Plantes à arroser', 'Rendez-vous', 'Ce que l’autre a fait', 'Végé ou non ?']) {
      expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
    }
  })

  it('une erreur de chargement reste affichée', async () => {
    const { api } = setup()
    api.meals.listMeals.mockRejectedValue(new AppError('Impossible de charger le planning.'))
    expect(await within(await screen.findByRole('region', { name: 'Repas' })).findByText('Impossible de charger le planning.')).toBeInTheDocument()
  })

  it('montre ce que l’autre a fait, avec un lien vers chaque page', async () => {
    const { api } = setup()
    const at = new Date(Date.now() - 20 * 60_000).toISOString()
    api.activity.listRecent.mockResolvedValue([
      { kind: 'watered', actorId: 'eric', actorName: 'Eric', at, title: 'Ficus', detail: null, targetId: 'ficus' },
      { kind: 'shopping_added', actorId: 'eric', actorName: 'Eric', at, title: 'Lait', detail: 'Courses', targetId: 'l1' },
    ])
    const card = await screen.findByRole('region', { name: 'Ce que l’autre a fait' })
    expect(await within(card).findByRole('link', { name: 'Eric a arrosé Ficus' })).toHaveAttribute('href', '/plantes/ficus')
    expect(within(card).getByRole('link', { name: 'Eric a ajouté Lait à Courses' })).toHaveAttribute('href', '/courses/l1')
    expect(within(card).getAllByText('il y a 20 min')).toHaveLength(2)
    expect(api.activity.subscribe).toHaveBeenCalled()
  })

  it('rien de nouveau de l’autre : pas de carte', async () => {
    const { api } = setup()
    await screen.findByRole('region', { name: 'Eau' })
    await waitFor(() => expect(api.activity.listRecent).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Ce que l’autre a fait' })).not.toBeInTheDocument()
  })

  it('aucune page résumable : renvoie aux réglages', async () => {
    setup(['planning', 'recettes', 'plan', 'courses', 'hydratation', 'plantes', 'tricot', 'agenda'])
    expect(await screen.findByText('Rien à résumer ici')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
  })

  describe('journal des repas', () => {
    const full = (day: string) => (['BREAKFAST', 'LUNCH', 'DINNER'] as const).map((slot) => ({ profile_id: LUCILE.id, eaten_on: day, slot, kind: 'vegetarian' as const }))
    const card = () => screen.findByRole('region', { name: 'Végé ou non ?' })

    it('note les repas du jour en un geste, d’après le planning', async () => {
      const { api, user } = setup()
      const lunch = within(await card()).getByRole('group', { name: 'Midi' })
      // « Curry coco » prévu à midi : rien à en déduire ; « Gratin de courge » non plus
      await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
      expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, TODAY, 'LUNCH', 'vegetarian')
      expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(await card()).getByRole('link', { name: 'Stats' })).toHaveAttribute('href', `/plan?profil=${LUCILE.id}`)
    })

    it('propose la réponse déduite du planning', async () => {
      const { api } = setup()
      api.meals.listMeals.mockResolvedValue([mealFixture({ meal_date: TODAY, slot: 'DINNER', recipe: { title: 'Saumon aux poireaux' } })])
      expect(await within(await card()).findByRole('button', { name: 'Non végé, prévu au planning' })).toBeInTheDocument()
    })

    it('jours passés à rattraper : leur nombre, et le lien ouvre le plus ancien ; la série', async () => {
      const { api } = setup()
      api.mealLog.list.mockResolvedValue([...full('2026-11-05'), ...full('2026-11-07')])
      const link = await within(await card()).findByRole('link', { name: '2 jours à rattraper depuis le 6 novembre' })
      expect(link).toHaveAttribute('href', `/plan?profil=${LUCILE.id}&jour=2026-11-06`)
      expect(api.mealLog.list).toHaveBeenCalledWith(LUCILE.id, '2026-09-10', TODAY)
    })

    it('un seul jour à rattraper, et la série en cours', async () => {
      const { api } = setup()
      api.mealLog.list.mockResolvedValue([...full('2026-11-06'), ...full('2026-11-07')])
      expect(await within(await card()).findByRole('link', { name: '1 jour à rattraper (8 novembre)' })).toBeInTheDocument()
      expect(within(await card()).queryByTitle('Jours complets d’affilée')).not.toBeInTheDocument()
    })

    it('série de jours complets jusqu’à hier', async () => {
      const { api } = setup()
      api.mealLog.list.mockResolvedValue([...full('2026-11-07'), ...full('2026-11-08')])
      expect(await within(await card()).findByTitle('Jours complets d’affilée')).toHaveTextContent('2')
      expect(within(await card()).queryByRole('link', { name: /rattraper/ })).not.toBeInTheDocument()
    })

    it('tout est rempli, ou page Plan masquée : pas de carte', async () => {
      const { api, unmount } = setup([], 22)
      api.mealLog.list.mockResolvedValue([...full('2026-11-08'), ...full(TODAY)])
      await screen.findByRole('region', { name: 'Eau' })
      await waitFor(() => expect(api.mealLog.list).toHaveBeenCalled())
      expect(screen.queryByRole('region', { name: 'Végé ou non ?' })).not.toBeInTheDocument()
      unmount()
      const hidden = setup(['plan'], 22)
      await screen.findByRole('region', { name: 'Eau' })
      expect(hidden.api.mealLog.list).not.toHaveBeenCalled()
      expect(screen.queryByRole('region', { name: 'Végé ou non ?' })).not.toBeInTheDocument()
    })
  })
})
