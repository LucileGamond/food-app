import { act, screen, waitFor, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { setupUser } from '@/test/user'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { eventFixture } from '@/test/agenda'
import { ERIC, LUCILE, fakeApi, fakeAuth, mealFixture, renderWithApp } from '@/test/fakes'
import type { InboxItem } from '@/lib/inbox'
import { WeekPlanPage } from './WeekPlanPage'

// Lundi 9 novembre 2026 → dimanche 15, à 8 h à Paris (aucun repas encore passé).
const TODAY = '2026-11-09'
const MORNING = () => Date.parse('2026-11-09T07:00:00Z')

const item = (id: string, title: string, recipeId: string | null = null): InboxItem => ({ id, title, url: null, recipe_id: recipeId, created_at: '2026-11-01T10:00:00Z', list: 'plan' })

function setup({
  items = [item('i1', 'Lasagnes', 'r1'), item('i2', 'Salade de saumon')],
  eventsError = false,
  now = MORNING,
}: { items?: InboxItem[]; eventsError?: boolean; now?: () => number } = {}) {
  // Le jour peut changer en cours de test (passage à minuit).
  const clock = { changeDay: (_day: string) => undefined as void }
  function Clock() {
    const [day, setDay] = useState(TODAY)
    useEffect(() => {
      clock.changeDay = setDay
    }, [])
    return <WeekPlanPage today={day} now={now} />
  }
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
      portions: i.portions ?? null,
      ingredients: i.id === 'i2' ? ['saumon', 'salade'] : ['pâtes'],
    })),
  )
  const auth = fakeAuth({ userId: LUCILE.id })
  const result = renderWithApp(<Clock />, {
    api,
    auth,
    route: '/planning/semaine',
    path: '/planning/semaine',
    extraRoutes: <Route path="/planning" element={<p>Page planning</p>} />,
  })
  return { ...result, api, setToday: (day: string) => act(() => clock.changeDay(day)) }
}

const slot = (name: string) => screen.findByRole('group', { name })
/** La ligne repliable d'un jour, pour lire son attribut `open`. */
const summaryOf = (day: string) => screen.getAllByText(day).map((el) => el.closest('summary')).find(Boolean)!
const dayRow = (day: string) => summaryOf(day).closest('details')!

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
    // Quatre semaines chargées d'un coup : les jours se cochent sans attendre.
    expect(api.agenda.listEvents).toHaveBeenCalledWith('2026-11-09', '2026-12-06')
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-11-09', '2026-12-06')
  })

  it('la présence se corrige à la main avant de demander à l’IA', async () => {
    const user = setupUser()
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

  it('semaine repliée : seuls les jours touchés par l’agenda sont ouverts', async () => {
    setup()
    await slot('Lundi 9 novembre — Midi')
    expect(screen.getByText('5 jours sur 7 sans rien à corriger')).toBeInTheDocument()
    // Escalade lundi, dîner dehors mardi : ces deux jours s'ouvrent tout seuls.
    expect(dayRow('Lundi 9 novembre')).toHaveAttribute('open')
    expect(dayRow('Mardi 10 novembre')).toHaveAttribute('open')
    expect(dayRow('Mercredi 11 novembre')).not.toHaveAttribute('open')
    expect(dayRow('Samedi 14 novembre')).not.toHaveAttribute('open')
    // Le résumé dit l'essentiel sans déplier.
    expect(within(summaryOf('Mercredi 11 novembre')).getByText('Midi : Eric · Soir : Eric et Lucile')).toBeInTheDocument()
    expect(within(summaryOf('Samedi 14 novembre')).getByText('Midi et soir : Eric et Lucile')).toBeInTheDocument()
    expect(within(summaryOf('Mercredi 11 novembre')).getByText('Habitude')).toBeInTheDocument()
    expect(within(summaryOf('Mardi 10 novembre')).getByText('Agenda')).toBeInTheDocument()
  })

  it('tout déplier, tout replier, et un jour corrigé reste ouvert', async () => {
    const user = setupUser()
    setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Tout déplier' }))
    expect(dayRow('Mercredi 11 novembre')).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Tout replier' }))
    expect(dayRow('Lundi 9 novembre')).not.toHaveAttribute('open')

    // Corriger qui mange marque le jour et le laisse ouvert.
    await user.click(summaryOf('Samedi 14 novembre'))
    await user.click(within(await slot('Samedi 14 novembre — Midi')).getByRole('button', { name: 'Eric' }))
    expect(dayRow('Samedi 14 novembre')).toHaveAttribute('open')
    expect(within(summaryOf('Samedi 14 novembre')).getByText('Modifié')).toBeInTheDocument()
    expect(screen.getByText('4 jours sur 7 sans rien à corriger')).toBeInTheDocument()
  })

  it('repas déjà passés du jour : affichés comme tels, pas proposés à l’IA', async () => {
    const user = setupUser()
    // Lundi 20 h à Paris : le midi est fini, le soir pas encore.
    const { api } = setup({ now: () => Date.parse('2026-11-09T19:00:00Z') })
    expect(within(await slot('Lundi 9 novembre — Midi')).getByText('Repas passé')).toBeInTheDocument()
    expect(within(await slot('Lundi 9 novembre — Soir')).getByRole('button', { name: 'Eric' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())
    expect(api.weekPlan.proposePlan.mock.calls[0]![0].slots.map((s) => s.key)).not.toContain('2026-11-09|LUNCH')
  })

  it('plus de 40 plats : seuls les 40 premiers partent à l’IA, et on le dit', async () => {
    const user = setupUser()
    const { api } = setup({ items: Array.from({ length: 45 }, (_, i) => item(`x${i}`, `Plat ${i}`)) })
    expect(await screen.findByText('Seuls les 40 premiers plats sont proposés à l’IA.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())
    expect(api.weekPlan.proposePlan.mock.calls[0]![0].dishes).toHaveLength(40)
  })

  it('foyer introuvable : erreur et nouvel essai, pas de chargement sans fin', async () => {
    const user = setupUser()
    const api = fakeApi()
    api.meals.listProfiles.mockResolvedValueOnce([])
    renderWithApp(<WeekPlanPage today={TODAY} now={MORNING} />, { api, auth: fakeAuth({ userId: LUCILE.id }), route: '/planning/semaine', path: '/planning/semaine' })
    expect(await screen.findByText('Impossible de charger le foyer.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findAllByRole('group', { name: / — Midi$/ })).toHaveLength(7)
  })

  it('jours libres : cochés au choix sur 4 semaines, 14 jours au plus du premier au dernier', async () => {
    const user = setupUser()
    const { api } = setup()
    await slot('Lundi 9 novembre — Midi')
    // Le calendrier est replié : on l'ouvre pour changer les jours.
    const picker = screen.getByText('Jours à planifier').closest('details')!
    expect(picker).not.toHaveAttribute('open')
    await user.click(screen.getByText('Jours à planifier'))
    const days = within(picker)
    expect(days.getAllByRole('button')).toHaveLength(28)
    // Retire lundi et mardi, ajoute le lundi suivant : la période va du mercredi 11 au lundi 16.
    await user.click(days.getByRole('button', { name: 'Lundi 9 novembre' }))
    await user.click(days.getByRole('button', { name: 'Mardi 10 novembre' }))
    await user.click(days.getByRole('button', { name: 'Lundi 16 novembre' }))
    expect(screen.queryByRole('group', { name: 'Lundi 9 novembre — Midi' })).not.toBeInTheDocument()
    expect(await slot('Lundi 16 novembre — Soir')).toBeInTheDocument()
    expect(screen.getByText(/Du 11 novembre au 16 novembre · 6 jours/)).toBeInTheDocument()
    // Au-delà de 14 jours après le mercredi 11 : grisé.
    expect(days.getByRole('button', { name: 'Mardi 24 novembre' })).toBeEnabled()
    expect(days.getByRole('button', { name: 'Mercredi 25 novembre' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())
    const request = api.weekPlan.proposePlan.mock.calls[0]![0]
    expect(request.start).toBe('2026-11-11')
    expect(request.slots.map((s) => s.key)).toContain('2026-11-16|DINNER')
    expect(request.slots.map((s) => s.key)).not.toContain('2026-11-10|DINNER')
  })

  it('portions à cuisiner : proposées d’après les couverts, réglées sur le premier repas du plat', async () => {
    const user = setupUser()
    const { api } = setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    // Lasagnes lundi soir (Eric et Lucile) puis mardi midi (Eric seul) : 3 couverts proposés.
    await user.selectOptions(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' }), 'Lasagnes')
    const field = within(await slot('Lundi 9 novembre — Soir')).getByRole('spinbutton', { name: 'Portions à cuisiner pour « Lasagnes »' })
    expect(field).toHaveAttribute('placeholder', '2')
    await user.selectOptions(within(await slot('Mardi 10 novembre — Midi')).getByRole('combobox', { name: 'Plat' }), 'i1')
    expect(within(await slot('Lundi 9 novembre — Soir')).getByRole('spinbutton', { name: 'Portions à cuisiner pour « Lasagnes »' })).toHaveAttribute('placeholder', '3')
    // Le repas suivant n'a pas de réglage : ce sont des restes.
    const tuesday = await slot('Mardi 10 novembre — Midi')
    expect(within(tuesday).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(tuesday).getByText('Restes de lun. 9, soir')).toBeInTheDocument()

    await user.type(field, '8')
    await user.tab()
    expect(api.inbox.setPortions).toHaveBeenCalledWith('i1', 8)
  })

  it('portions refusées par la base : valeur d’avant remise, erreur affichée', async () => {
    const user = setupUser()
    const { api } = setup()
    api.inbox.setPortions.mockRejectedValueOnce(new AppError('Impossible de régler les portions.'))
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    await user.selectOptions(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' }), 'Salade de saumon')
    await user.type(within(await slot('Lundi 9 novembre — Soir')).getByRole('spinbutton', { name: /Salade de saumon/ }), '3{Enter}')
    expect(await screen.findByText('Impossible de régler les portions.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier qui mange' }))
    await user.click(screen.getByRole('button', { name: 'Reproposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())
    expect(api.weekPlan.proposePlan.mock.calls[0]![0].dishes.find((d) => d.id === 'i2')!.servings).toBe(2)
  })

  it('rien à planifier : on le dit, et l’IA n’est pas proposée', async () => {
    setup({ items: [] })
    expect(await screen.findByText(/Rien dans « À planifier »/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proposer avec l’IA' })).toBeDisabled()
  })
})

describe('WeekPlanPage — proposition', () => {
  it('affiche la proposition, la laisse modifier avec ses alertes, puis crée les repas', async () => {
    const user = setupUser()
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
      { item_id: 'i1', meal_date: '2026-11-11', slot: 'DINNER', people: [ERIC.id, LUCILE.id], cook_id: LUCILE.id, portions: 3 },
      { item_id: 'i1', meal_date: '2026-11-12', slot: 'LUNCH', people: [ERIC.id], cook_id: null, portions: 0 },
      { item_id: 'i2', meal_date: '2026-11-14', slot: 'DINNER', people: [ERIC.id, LUCILE.id], cook_id: LUCILE.id, portions: 2 },
    ])
    expect(await screen.findByText('Page planning')).toBeInTheDocument()
  })

  it('placer soi-même, sans IA, et revenir à la présence', async () => {
    const user = setupUser()
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

  it('aller-retour avec la présence : le placement est gardé, « Tout recommencer » le vide', async () => {
    const user = setupUser()
    setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    await user.selectOptions(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' }), 'Lasagnes')

    await user.click(screen.getByRole('button', { name: 'Modifier qui mange' }))
    await user.click(await screen.findByRole('button', { name: 'Reprendre le placement' }))
    expect(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' })).toHaveDisplayValue('Lasagnes')

    await user.click(screen.getByRole('button', { name: 'Modifier qui mange' }))
    await user.click(await screen.findByRole('button', { name: 'Tout recommencer' }))
    expect(screen.getByRole('button', { name: 'Placer moi-même' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    expect(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' })).toHaveDisplayValue('—')
  })

  it('créneau refermé pendant l’aller-retour : le plat posé là est retiré', async () => {
    const user = setupUser()
    setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    await user.selectOptions(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' }), 'Lasagnes')
    await user.click(screen.getByRole('button', { name: 'Modifier qui mange' }))
    // Plus personne lundi soir : le créneau n'est plus à remplir.
    const monday = await slot('Lundi 9 novembre — Soir')
    await user.click(within(monday).getByRole('button', { name: 'Eric' }))
    await user.click(within(monday).getByRole('button', { name: 'Lucile' }))
    await user.click(screen.getByRole('button', { name: 'Reprendre le placement' }))
    expect(within(await slot('Lundi 9 novembre — Soir')).getByText('Personne à la maison')).toBeInTheDocument()
    expect(screen.getByText('Non placés : Lasagnes, Salade de saumon')).toBeInTheDocument()
  })

  it('même plat deux jours de suite : le second est des restes, sans cuisinier', async () => {
    const user = setupUser()
    const { api } = setup()
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Placer moi-même' }))
    await user.selectOptions(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Plat' }), 'Lasagnes')
    const tuesday = await slot('Mardi 10 novembre — Midi')
    // Le plat déjà placé est annoncé comme des restes dans la liste du créneau.
    expect(within(tuesday).getByRole('option', { name: 'Lasagnes — restes' })).toBeInTheDocument()
    await user.selectOptions(within(tuesday).getByRole('combobox', { name: 'Plat' }), 'i1')
    expect(within(await slot('Mardi 10 novembre — Midi')).getByRole('combobox', { name: 'Qui cuisine' })).toHaveDisplayValue('Personne (restes)')
    expect(within(await slot('Lundi 9 novembre — Soir')).getByRole('combobox', { name: 'Qui cuisine' })).toHaveDisplayValue('Eric')

    await user.click(screen.getByRole('button', { name: 'Valider la semaine' }))
    await waitFor(() => expect(api.weekPlan.saveWeek).toHaveBeenCalled())
    expect(api.weekPlan.saveWeek.mock.calls[0]![0].map((m) => [m.meal_date, m.cook_id, m.portions])).toEqual([
      ['2026-11-09', ERIC.id, 3],
      ['2026-11-10', null, 0],
    ])
  })

  it('signale une erreur de l’IA et reste sur la présence', async () => {
    const user = setupUser()
    const { api } = setup()
    api.weekPlan.proposePlan.mockRejectedValue(new AppError('Le service d’analyse est surchargé.'))
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    expect(await screen.findByText('Le service d’analyse est surchargé.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proposer avec l’IA' })).toBeEnabled()
  })

  it('signale un échec de l’enregistrement', async () => {
    const user = setupUser()
    const { api } = setup()
    api.weekPlan.proposePlan.mockResolvedValue({ meals: [{ slot: '2026-11-09|DINNER', dishId: 'i2', cookId: ERIC.id, why: '' }] })
    api.weekPlan.saveWeek.mockRejectedValue(new AppError('Un plat n’est plus dans la liste « À planifier » : recharge la page.'))
    await slot('Lundi 9 novembre — Midi')
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await user.click(await screen.findByRole('button', { name: 'Valider la semaine' }))
    expect(await screen.findByText('Un plat n’est plus dans la liste « À planifier » : recharge la page.')).toBeInTheDocument()
  })

  it('passage à minuit : brouillon de la veille abandonné, réponse tardive de l’IA ignorée', async () => {
    const user = setupUser()
    const { api, setToday } = setup()
    let answer: (value: unknown) => void = () => undefined
    api.weekPlan.proposePlan.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    await user.click(within(await slot('Mardi 10 novembre — Soir')).getByRole('button', { name: 'Lucile' }))
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await waitFor(() => expect(api.weekPlan.proposePlan).toHaveBeenCalled())

    setToday('2026-11-10')
    answer({ meals: [{ slot: '2026-11-10|DINNER', dishId: 'i2', cookId: ERIC.id, why: '' }] })
    const tuesday = await slot('Mardi 10 novembre — Soir')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proposer avec l’IA' })).toBeEnabled())
    expect(within(tuesday).queryByRole('combobox', { name: 'Plat' })).not.toBeInTheDocument()
    expect(within(tuesday).getByRole('button', { name: 'Lucile' })).toHaveAttribute('aria-pressed', 'true')
    expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-10', '2026-12-07')

    // Proposition et validation repartent du nouveau jour, sans la correction de la veille.
    api.weekPlan.proposePlan.mockResolvedValue({ meals: [{ slot: '2026-11-10|DINNER', dishId: 'i2', cookId: LUCILE.id, why: '' }] })
    await user.click(screen.getByRole('button', { name: 'Proposer avec l’IA' }))
    await user.click(await screen.findByRole('button', { name: 'Valider la semaine' }))
    await waitFor(() => expect(api.weekPlan.saveWeek).toHaveBeenCalled())
    expect(api.weekPlan.saveWeek.mock.calls[0]![0]).toEqual([
      { item_id: 'i2', meal_date: '2026-11-10', slot: 'DINNER', people: [LUCILE.id], cook_id: LUCILE.id, portions: 1 },
    ])
  })

  it('erreur de chargement : message et nouvel essai', async () => {
    const user = setupUser()
    const api = fakeApi()
    api.weekPlan.listRules.mockRejectedValueOnce(new AppError('Impossible de charger les règles des repas.'))
    renderWithApp(<WeekPlanPage today={TODAY} now={MORNING} />, { api, auth: fakeAuth({ userId: LUCILE.id }), route: '/planning/semaine', path: '/planning/semaine' })
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
