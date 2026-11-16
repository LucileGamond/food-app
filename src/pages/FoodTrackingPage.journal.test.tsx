import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { FoodPeriod } from '@/lib/food'
import type { LogKind, LogSlot, MealLogEntry } from '@/lib/mealLog'
import { ERIC, LUCILE, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { FoodTrackingPage } from './FoodTrackingPage'

const TODAY = '2026-10-24' // samedi
const PERIOD: FoodPeriod = { id: 'p1', profile_id: LUCILE.id, start_date: '2026-10-19', end_date: '2026-11-02' }

const e = (eaten_on: string, slot: LogSlot, kind: LogKind, profile_id = LUCILE.id): MealLogEntry => ({ profile_id, eaten_on, slot, kind })
const full = (day: string, kinds: [LogKind, LogKind, LogKind] = ['vegetarian', 'meat', 'vegetarian']) => [e(day, 'BREAKFAST', kinds[0]), e(day, 'LUNCH', kinds[1]), e(day, 'DINNER', kinds[2])]

function renderJournal({ api = fakeApi(), periods = [PERIOD], entries = [] as MealLogEntry[], route = '/plan', today = TODAY } = {}) {
  api.food.listPeriods.mockResolvedValue(periods)
  api.food.listPeriodItems.mockResolvedValue([])
  api.mealLog.list.mockResolvedValue(entries)
  return { ...renderWithApp(<FoodTrackingPage today={today} hour={12} />, { api, route, path: '/plan' }), user: userEvent.setup() }
}

const journal = () => screen.findByRole('region', { name: 'Repas du jour' })
const slot = async (name: string) => within(await journal()).getByRole('group', { name })

describe('FoodTrackingPage : journal des repas', () => {
  it('note végé, non végé ou pas de repas pour le jour affiché, et efface d’un second appui', async () => {
    const { api, user } = renderJournal()
    const lunch = await slot('Midi')
    await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
    expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'true')
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, TODAY, 'LUNCH', 'vegetarian')

    // Changer d'avis remplace la réponse
    await user.click(within(lunch).getByRole('button', { name: 'Non végé' }))
    expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'false')
    expect(api.mealLog.set).toHaveBeenLastCalledWith(LUCILE.id, TODAY, 'LUNCH', 'meat')

    await user.click(within(lunch).getByRole('button', { name: 'Non végé' }))
    expect(api.mealLog.clear).toHaveBeenCalledWith(LUCILE.id, TODAY, 'LUNCH')
    expect(within(lunch).getByRole('button', { name: 'Non végé' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(within(await slot('Petit-déj')).getByRole('button', { name: 'Pas de repas' }))
    expect(api.mealLog.set).toHaveBeenLastCalledWith(LUCILE.id, TODAY, 'BREAKFAST', 'skipped')
  })

  it('suit le jour choisi dans la période', async () => {
    const { api, user } = renderJournal({ entries: [e('2026-10-23', 'DINNER', 'meat')] })
    await journal()
    await user.click(screen.getAllByRole('button', { name: 'Jour précédent' })[0]!)
    expect(await screen.findByText('Vendredi 23 octobre')).toBeInTheDocument()
    expect(within(await slot('Soir')).getByRole('button', { name: 'Non végé' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(await slot('Soir')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, '2026-10-23', 'DINNER', 'vegetarian')
  })

  it('propose la réponse d’après le planning, sans rien enregistrer avant confirmation', async () => {
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([
      mealFixture({ meal_date: TODAY, slot: 'DINNER', recipe: { title: 'Poulet basquaise' } }),
      mealFixture({ id: 'm2', meal_date: TODAY, slot: 'LUNCH', recipe: { title: 'Dahl', tags: ['végé'] } }),
    ])
    const { user } = renderJournal({ api })
    expect(await screen.findByRole('button', { name: 'Non végé, prévu au planning' })).toHaveAttribute('aria-pressed', 'false')
    const dinner = await slot('Soir')
    expect(within(dinner).getByRole('button', { name: 'Non végé, prévu au planning' })).toBeInTheDocument()
    expect(within(await slot('Midi')).getByRole('button', { name: 'Végé, prévu au planning' })).toBeInTheDocument()
    expect(api.meals.listMeals).toHaveBeenCalledWith(TODAY, TODAY)
    expect(api.mealLog.set).not.toHaveBeenCalled()

    await user.click(within(dinner).getByRole('button', { name: 'Non végé, prévu au planning' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, TODAY, 'DINNER', 'meat')
    // Une fois répondu, plus de suggestion
    expect(within(dinner).getByRole('button', { name: 'Non végé' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('le planning ne se charge pas : pas de suggestion, le journal reste utilisable', async () => {
    const api = fakeApi()
    api.meals.listMeals.mockRejectedValue(new Error('hors ligne'))
    const { user } = renderJournal({ api })
    await user.click(within(await slot('Soir')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /prévu au planning/ })).not.toBeInTheDocument()
  })

  it('annule la réponse et prévient si le serveur refuse', async () => {
    const api = fakeApi()
    api.mealLog.set.mockRejectedValueOnce(new AppError('Impossible d’enregistrer le repas.'))
    const { user } = renderJournal({ api })
    const lunch = await slot('Midi')
    await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
    expect(await screen.findByText('Impossible d’enregistrer le repas.')).toBeInTheDocument()
    expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sans période : le journal a sa propre navigation, jusqu’à aujourd’hui', async () => {
    const { api, user } = renderJournal({ periods: [] })
    const card = await journal()
    expect(screen.getByText('Aucune période')).toBeInTheDocument()
    expect(within(card).getByText('Samedi 24 octobre')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Jour suivant' })).toBeDisabled()
    await user.click(within(card).getByRole('button', { name: 'Jour précédent' }))
    expect(within(card).getByText('Vendredi 23 octobre')).toBeInTheDocument()
    await user.click(within(await slot('Midi')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, '2026-10-23', 'LUNCH', 'vegetarian')
    await user.click(within(card).getByRole('button', { name: 'Jour suivant' }))
    expect(within(card).getByText('Samedi 24 octobre')).toBeInTheDocument()
  })

  it('ouvre le jour demandé par le rappel (?jour=), dans la période comme sans', async () => {
    const { unmount } = renderJournal({ route: '/plan?jour=2026-10-21' })
    expect(await screen.findByText('Mercredi 21 octobre')).toBeInTheDocument()
    unmount()
    renderJournal({ periods: [], route: '/plan?jour=2026-10-21' })
    expect(within(await journal()).getByText('Mercredi 21 octobre')).toBeInTheDocument()
  })

  it('ignore un jour invalide ou à venir', async () => {
    const { unmount } = renderJournal({ periods: [], route: '/plan?jour=2026-02-31' })
    expect(within(await journal()).getByText('Samedi 24 octobre')).toBeInTheDocument()
    unmount()
    renderJournal({ periods: [], route: '/plan?jour=2026-10-30' })
    expect(within(await journal()).getByText('Samedi 24 octobre')).toBeInTheDocument()
  })

  it('affiche la série de jours complets et la part de repas végés par semaine', async () => {
    const entries = [...full('2026-10-21'), ...full('2026-10-22', ['skipped', 'vegetarian', 'vegetarian']), ...full('2026-10-23'), ...full('2026-10-14', ['meat', 'meat', 'meat'])]
    renderJournal({ entries })
    expect(within(await journal()).getByText('3 jours d’affilée')).toBeInTheDocument()
    const stats = await screen.findByRole('region', { name: 'Repas végés' })
    // Semaine du 19 octobre : 6 végés sur 8 (« pas de repas » non compté)
    expect(within(stats).getByText(/Cette semaine : 75 % \(6 sur 8\)\. Sur 8 semaines : 55 %\./)).toBeInTheDocument()
    expect(within(stats).getByRole('img', { name: 'Semaine du 12 octobre : 0 % végé' })).toBeInTheDocument()
    expect(within(stats).getByRole('img', { name: 'Semaine du 5 octobre : rien de noté' })).toBeInTheDocument()
    expect(within(stats).getAllByRole('img')).toHaveLength(8)
  })

  it('rien de noté : pas de série, statistiques vides', async () => {
    renderJournal()
    await journal()
    expect(screen.queryByText(/d’affilée/)).not.toBeInTheDocument()
    expect(await screen.findByText('Rien de noté cette semaine.')).toBeInTheDocument()
  })

  it('suit la personne choisie', async () => {
    const { api, user } = renderJournal({ route: `/plan?profil=${ERIC.id}` })
    await waitFor(() => expect(api.mealLog.list).toHaveBeenCalledWith(ERIC.id, expect.any(String), TODAY))
    await user.click(within(await slot('Midi')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(ERIC.id, TODAY, 'LUNCH', 'vegetarian')
  })

  it('erreur de chargement du journal : la carte n’apparaît pas, le plan reste utilisable', async () => {
    const api = fakeApi()
    api.mealLog.list.mockRejectedValue(new AppError('Impossible de charger le journal des repas.'))
    api.food.listPeriods.mockResolvedValue([PERIOD])
    api.food.listPeriodItems.mockResolvedValue([])
    renderWithApp(<FoodTrackingPage today={TODAY} hour={12} />, { api, route: '/plan', path: '/plan' })
    expect(await screen.findByText('Samedi 24 octobre')).toBeInTheDocument()
    await waitFor(() => expect(api.mealLog.list).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'Repas du jour' })).not.toBeInTheDocument()
  })
})
