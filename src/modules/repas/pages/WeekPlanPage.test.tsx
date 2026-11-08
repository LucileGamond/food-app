import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { eventFixture } from '@/test/agenda'
import { ERIC, LUCILE, fakeApi, fakeAuth, mealFixture, renderWithApp } from '@/test/fakes'
import type { InboxItem } from '@/lib/inbox'
import { WeekPlanPage } from './WeekPlanPage'

// Lundi 9 novembre 2026 → dimanche 15.
const TODAY = '2026-11-09'

const item = (id: string, title: string, recipeId: string | null = null): InboxItem => ({ id, title, url: null, recipe_id: recipeId, created_at: '2026-11-01T10:00:00Z', list: 'plan' })

function setup({ items = [item('i1', 'Lasagnes', 'r1'), item('i2', 'Salade de saumon')], eventsError = false }: { items?: InboxItem[]; eventsError?: boolean } = {}) {
  const api = fakeApi()
  api.weekPlan.listRules.mockResolvedValue([{ profileId: LUCILE.id, weekdayLunchAtWork: true, ignoredKeywords: ['escalade'] }])
  api.agenda.listEvents.mockResolvedValue([
    // Eric dîne dehors mardi (20 h – 23 h à Paris) ; Lucile grimpe lundi 18 h 30 – 20 h 30.
    eventFixture({ ownerId: ERIC.id, title: 'Dîner chez Paul', startsAt: '2026-11-10T19:00:00Z', endsAt: '2026-11-10T22:00:00Z' }),
    eventFixture({ ownerId: LUCILE.id, title: 'Escalade', startsAt: '2026-11-09T17:30:00Z', endsAt: '2026-11-09T19:30:00Z' }),
  ])
  if (eventsError) api.agenda.listEvents.mockRejectedValue(new AppError('Impossible de charger l’agenda.'))
  api.meals.listMeals.mockResolvedValue([mealFixture({ meal_date: '2026-11-15', slot: 'DINNER', recipe: { title: 'Pizza' } })])
  api.inbox.listItems.mockResolvedValue(items)
  api.weekPlan.listDishes.mockImplementation(async (list) =>
    list.map((i) => ({
      id: i.id,
      title: i.title,
      recipeId: i.recipe_id,
      minutes: i.id === 'i1' ? 90 : 15,
      servings: i.id === 'i1' ? 4 : 2,
      ingredients: i.id === 'i2' ? ['saumon', 'salade'] : ['pâtes'],
    })),
  )
  const auth = fakeAuth({ userId: LUCILE.id })
  const result = renderWithApp(<WeekPlanPage today={TODAY} />, {
    api,
    auth,
    route: '/planning/semaine',
    path: '/planning/semaine',
    extraRoutes: <Route path="/planning" element={<p>Page planning</p>} />,
  })
  return { ...result, api }
}

const slot = (name: string) => screen.findByRole('group', { name })

describe('WeekPlanPage — qui mange à la maison', () => {
  it('préremplit les 7 jours d’après l’agenda et les règles', async () => {
    const { api } = setup()
    const mondayLunch = await slot('Lundi 9 novembre — Midi')
    expect(within(mondayLunch).getByRole('button', { name: 'Lucile' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(mondayLunch).getByText('Lucile : Au travail')).toBeInTheDocument()
    expect(within(mondayLunch).getByRole('button', { name: 'Eric' })).toHaveAttribute('aria-pressed', 'true')

    const mondayDinner = await slot('Lundi 9 novembre — Soir')
    expect(within(mondayDinner).getByRole('button', { name: 'Lucile' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(mondayDinner).getByText('Lucile : 18 h 30 Escalade (mange à la maison)')).toBeInTheDocument()

    const tuesdayDinner = await slot('Mardi 10 novembre — Soir')
    expect(within(tuesdayDinner).getByRole('button', { name: 'Eric' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(tuesdayDinner).getByText('Eric : 20 h Dîner chez Paul')).toBeInTheDocument()

    expect(within(await slot('Dimanche 15 novembre — Soir')).getByText('Déjà prévu : Pizza')).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: / — (Midi|Soir)$/ })).toHaveLength(14)
    expect(screen.getByText(/^2 plats à planifier · \d+ créneaux à remplir$/)).toBeInTheDocument()
    expect(api.agenda.listEvents).toHaveBeenCalledWith('2026-11-09', '2026-11-15')
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-11-09', '2026-11-15')
  })

  it('la présence se corrige à la main avant de demander à l’IA', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    const mondayLunch = await slot('Lundi 9 novembre — Midi')
    await user.click(within(mondayLunch).getByRole('button', { name: 'Lucile' }))
    expect(within(mondayLunch).getByRole('button', { name: 'Lucile' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(await slot('Mardi 10 novembre — Midi')).getByRole('button', { name: 'Eric' }))

    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())
    const request = api.weekPlan.proposePlan.mock.calls[0]![0]
    expect(request.slots.find((s) => s.key === '2026-11-09|LUNCH')).toMatchObject({ people: [ERIC.id, LUCILE.id], freeCooks: [ERIC.id, LUCILE.id] })
    // Personne mardi midi : créneau pas proposé ; dimanche soir déjà prévu non plus.
    expect(request.slots.map((s) => s.key)).not.toContain('2026-11-10|LUNCH')
    expect(request.slots.map((s) => s.key)).not.toContain('2026-11-15|DINNER')
    expect(request.dishes.map((d) => [d.id, d.long, d.fragile])).toEqual([
      ['i1', true, false],
      ['i2', false, true],
    ])
  })

  it('rien à planifier : on le dit, et l’IA n’est pas proposée', async () => {
    setup({ items: [] })
    expect(await screen.findByText(/Rien dans « À planifier »/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proposer avec l’IA' })).toBeDisabled()
  })
})

describe('WeekPlanPage — proposition', () => {
  it('affiche la proposition, la laisse modifier avec ses alertes, puis crée les repas', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.weekPlan.proposePlan.mockResolvedValue({
      meals: [
        { slot: '2026-11-09|DINNER', dishId: 'i2', cookId: ERIC.id, why: 'Saumon à manger vite' },
        { slot: '2026-11-11|DINNER', dishId: 'i1', cookId: LUCILE.id, why: 'Soirée libre' },
        { slot: '2026-11-12|LUNCH', dishId: 'i1', cookId: null, why: 'Restes' },
      ],
    })
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))

    const monday = await slot('Lundi 9 novembre — Soir')
    expect(within(monday).getByRole('combobox', { name: 'Plat' })).toHaveDisplayValue('Salade de saumon')
    expect(within(monday).getByRole('combobox', { name: 'Qui cuisine' })).toHaveDisplayValue('Eric')
    expect(within(monday).getByText('Saumon à manger vite')).toBeInTheDocument()
    expect(within(await slot('Jeudi 12 novembre — Midi')).getByRole('combobox', { name: 'Qui cuisine' })).toHaveDisplayValue('Personne (restes)')

    // Mettre la salade samedi : trop tard pour du saumon.
    await user.selectOptions(within(monday).getByRole('combobox', { name: 'Plat' }), '')
    const saturday = await slot('Samedi 14 novembre — Soir')
    await user.selectOptions(within(saturday).getByRole('combobox', { name: 'Plat' }), 'Salade de saumon')
    expect(within(saturday).getByText('Ingrédients fragiles : plutôt en début de semaine')).toBeInTheDocument()
    await user.selectOptions(within(saturday).getByRole('combobox', { name: 'Qui cuisine' }), 'Lucile')

    await user.click(screen.getByRole('button', { name: 'Valider la semaine' }))
    await waitFor(() => expect(api.weekPlan.saveWeek).toHaveBeenCalled())
    expect(api.weekPlan.saveWeek.mock.calls[0]![0]).toEqual([
      { item_id: 'i1', meal_date: '2026-11-11', slot: 'DINNER', people: [ERIC.id, LUCILE.id], cook_id: LUCILE.id },
      { item_id: 'i1', meal_date: '2026-11-12', slot: 'LUNCH', people: [ERIC.id], cook_id: null },
      { item_id: 'i2', meal_date: '2026-11-14', slot: 'DINNER', people: [ERIC.id, LUCILE.id], cook_id: LUCILE.id },
    ])
    expect(await screen.findByText('Page planning')).toBeInTheDocument()
  })

  it('placer soi-même, sans IA, et revenir à la présence', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    const monday = await slot('Lundi 9 novembre — Soir')
    expect(within(monday).getByRole('combobox', { name: 'Plat' })).toHaveDisplayValue('—')
    expect(screen.getByRole('button', { name: 'Valider la semaine' })).toBeDisabled()
    expect(screen.getByText('Non placés : Lasagnes, Salade de saumon')).toBeInTheDocument()
    expect(api.weekPlan.proposePlan).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Modifier qui mange' }))
    expect(await screen.findByRole('button', { name: 'Proposer avec l’IA' })).toBeInTheDocument()
  })

  it('signale une erreur de l’IA et reste sur la présence', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.weekPlan.proposePlan.mockRejectedValue(new AppError('Le service d’analyse est surchargé.'))
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    expect(await screen.findByText('Le service d’analyse est surchargé.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proposer avec l’IA' })).toBeEnabled()
  })

  it('signale un échec de l’enregistrement', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.weekPlan.proposePlan.mockResolvedValue({ meals: [{ slot: '2026-11-09|DINNER', dishId: 'i2', cookId: ERIC.id, why: '' }] })
    api.weekPlan.saveWeek.mockRejectedValue(new AppError('Un plat n’est plus dans la liste « À planifier » : recharge la page.'))
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await user.click(await screen.findByRole('button', { name: 'Valider la semaine' }))
    expect(await screen.findByText('Un plat n’est plus dans la liste « À planifier » : recharge la page.')).toBeInTheDocument()
  })

  it('erreur de chargement : message et nouvel essai', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.weekPlan.listRules.mockRejectedValueOnce(new AppError('Impossible de charger les règles des repas.'))
    renderWithApp(<WeekPlanPage today={TODAY} />, { api, auth: fakeAuth({ userId: LUCILE.id }), route: '/planning/semaine', path: '/planning/semaine' })
    expect(await screen.findByText('Impossible de charger les règles des repas.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findAllByRole('group', { name: / — Midi$/ })).toHaveLength(7)
  })

  it('agenda indisponible : la présence se fait sans rendez-vous', async () => {
    setup({ eventsError: true })
    const tuesdayDinner = await slot('Mardi 10 novembre — Soir')
    expect(within(tuesdayDinner).getByRole('button', { name: 'Eric' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Agenda indisponible : vérifie qui mange à la maison.')).toBeInTheDocument()
  })
})
