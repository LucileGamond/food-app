import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import type { KnitProject, KnitStep } from '@/modules/tricot/lib/pattern'
import { fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
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
  rowCount: 0,
  notes: '',
  done: false,
  ...overrides,
})

const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  pdfPath: null,
  steps: [step({ id: 's1', done: true, rowCount: 18 }), step({ id: 's2', position: 1, title: 'Emmanchures', rowCount: 23, totalRows: 30 })],
}

function setup(disabledPages: string[] = []) {
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
    { id: 'old', title: 'Bonnet', size: '4 ans', updatedAt: '2026-10-01T10:00:00Z', stepsDone: 2, stepsTotal: 2 },
    { id: 'p1', title: 'Pull Bergamote', size: 'M', updatedAt: '2026-11-08T10:00:00Z', stepsDone: 1, stepsTotal: 2 },
  ])
  api.knitting.getProject.mockResolvedValue(PROJECT)
  return { ...renderWithApp(<HomePage today={TODAY} />, { api }), user: userEvent.setup() }
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
    await user.click(await within(await screen.findByRole('region', { name: 'Eau' })).findByRole('button', { name: 'Grand verre' }))
    expect(api.hydration.addIntake).toHaveBeenCalledWith(330)

    await user.click(await screen.findByRole('button', { name: 'Marquer Basilic comme arrosée' }))
    await waitFor(() => expect(api.plants.water).toHaveBeenCalledWith(expect.objectContaining({ plantId: 'basilic', amountMl: 100 })))

    const knitting = await screen.findByRole('region', { name: 'Pull Bergamote' })
    await user.click(await within(knitting).findByRole('button', { name: /1 rang/ }))
    await waitFor(() => expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 24 }))
  })

  it('seulement les pages affichées ; rien à arroser ni tricot en cours', async () => {
    const { api } = setup(['planning', 'hydratation'])
    api.plants.listPlants.mockResolvedValue([])
    api.knitting.listProjects.mockResolvedValue([])
    expect(await within(await screen.findByRole('region', { name: 'Plantes à arroser' })).findByText(/Tout est arrosé/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Repas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Eau' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Pull/ })).not.toBeInTheDocument()
  })

  it('aucune page résumable : renvoie aux réglages', async () => {
    setup(['planning', 'hydratation', 'plantes', 'tricot'])
    expect(await screen.findByText('Rien à résumer ici')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
  })
})
