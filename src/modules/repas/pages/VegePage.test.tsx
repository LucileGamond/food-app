import { screen, waitFor, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { AppError } from '@/api'
import type { LogKind, LogSlot, MealLogEntry } from '@/lib/mealLog'
import { ERIC, LUCILE, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { VegePage } from './VegePage'

const TODAY = '2026-10-24' // samedi

const e = (eaten_on: string, slot: LogSlot, kind: LogKind, profile_id = LUCILE.id): MealLogEntry => ({ profile_id, eaten_on, slot, kind })
const full = (day: string, kinds: [LogKind, LogKind, LogKind] = ['vegetarian', 'meat', 'vegetarian']) => [e(day, 'BREAKFAST', kinds[0]), e(day, 'LUNCH', kinds[1]), e(day, 'DINNER', kinds[2])]

function renderPage({ api = fakeApi(), entries = [] as MealLogEntry[], route = '/vege' } = {}) {
  api.mealLog.list.mockResolvedValue(entries)
  return { ...renderWithApp(<VegePage today={TODAY} />, { api, route, path: '/vege' }), user: setupUser() }
}

const today = () => screen.findByRole('region', { name: 'Repas du jour' })
const late = () => screen.findByRole('region', { name: 'À rattraper' })
const stats = () => screen.findByRole('region', { name: 'Repas végés' })
const slot = async (name: string) => within(await today()).getByRole('group', { name })
const dayGroups = (container: HTMLElement) => within(container).getAllByRole('group', { name: /octobre$/ })

describe('VegePage', () => {
  it('note végé, non végé ou pas de repas pour aujourd’hui, et efface d’un second appui', async () => {
    const { api, user } = renderPage()
    const lunch = await slot('Midi')
    await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
    expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'true')
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, TODAY, 'LUNCH', 'vegetarian')

    await user.click(within(lunch).getByRole('button', { name: 'Non végé' }))
    expect(api.mealLog.set).toHaveBeenLastCalledWith(LUCILE.id, TODAY, 'LUNCH', 'meat')
    await user.click(within(lunch).getByRole('button', { name: 'Non végé' }))
    expect(api.mealLog.clear).toHaveBeenCalledWith(LUCILE.id, TODAY, 'LUNCH')

    await user.click(within(await slot('Petit-déj')).getByRole('button', { name: 'Pas de repas' }))
    expect(api.mealLog.set).toHaveBeenLastCalledWith(LUCILE.id, TODAY, 'BREAKFAST', 'skipped')
  })

  it('charge le journal des 8 semaines et le planning de la même période', async () => {
    const { api } = renderPage()
    await today()
    expect(api.mealLog.list).toHaveBeenCalledWith(LUCILE.id, '2026-08-31', TODAY)
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-08-31', TODAY)
  })

  it('liste les jours passés pas remplis, du plus récent au plus ancien, depuis le premier jour noté', async () => {
    // Commencé le 20 ; le 22 est complet ; le 23 à moitié
    const entries = [e('2026-10-20', 'LUNCH', 'meat'), ...full('2026-10-22'), e('2026-10-23', 'DINNER', 'vegetarian')]
    const { api, user } = renderPage({ entries })
    const section = await late()
    expect(within(section).getByText('3 jours à remplir, depuis le 20 octobre.')).toBeInTheDocument()
    const days = dayGroups(section)
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual(['Vendredi 23 octobre', 'Mercredi 21 octobre', 'Mardi 20 octobre'])

    // Les réponses déjà notées sont affichées ; on complète après coup
    const friday = days[0]!
    expect(within(within(friday).getByRole('group', { name: 'Soir' })).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(within(friday).getByRole('group', { name: 'Midi' })).getByRole('button', { name: 'Non végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, '2026-10-23', 'LUNCH', 'meat')
    await user.click(within(within(friday).getByRole('group', { name: 'Petit-déj' })).getByRole('button', { name: 'Pas de repas' }))

    // Rempli : le jour quitte la liste
    expect(within(section).queryByRole('group', { name: 'Vendredi 23 octobre' })).not.toBeInTheDocument()
    expect(within(section).getByText('2 jours à remplir, depuis le 20 octobre.')).toBeInTheDocument()
  })

  it('un seul jour à rattraper ; tout rempli ; rien de noté', async () => {
    const { unmount } = renderPage({ entries: full('2026-10-22') })
    expect(within(await late()).getByText('1 jour à remplir.')).toBeInTheDocument()
    unmount()

    const second = renderPage({ entries: [...full('2026-10-22'), ...full('2026-10-23')] })
    expect(within(await late()).getByText('Tous les jours passés sont remplis.')).toBeInTheDocument()
    second.unmount()

    renderPage()
    expect(within(await late()).getByText('Les jours oubliés apparaîtront ici.')).toBeInTheDocument()
    expect(within(await stats()).getByText('Rien de noté cette semaine.')).toBeInTheDocument()
    expect(screen.queryByText(/d’affilée/)).not.toBeInTheDocument()
  })

  it('propose les réponses du planning, aujourd’hui comme les jours passés, sans rien enregistrer avant confirmation', async () => {
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([
      mealFixture({ meal_date: TODAY, slot: 'DINNER', recipe: { title: 'Poulet basquaise' } }),
      mealFixture({ id: 'm2', meal_date: '2026-10-23', slot: 'LUNCH', recipe: { title: 'Dahl', tags: ['végé'] } }),
    ])
    const { user } = renderPage({ api, entries: [e('2026-10-23', 'DINNER', 'meat')] })
    const dinner = await slot('Soir')
    expect(await within(dinner).findByRole('button', { name: 'Non végé, prévu au planning' })).toBeInTheDocument()
    const friday = within(await late()).getByRole('group', { name: 'Vendredi 23 octobre' })
    expect(within(within(friday).getByRole('group', { name: 'Midi' })).getByRole('button', { name: 'Végé, prévu au planning' })).toBeInTheDocument()
    expect(api.mealLog.set).not.toHaveBeenCalled()

    await user.click(within(dinner).getByRole('button', { name: 'Non végé, prévu au planning' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, TODAY, 'DINNER', 'meat')
    expect(within(dinner).getByRole('button', { name: 'Non végé' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('le planning ne se charge pas : pas de suggestion, le journal reste utilisable', async () => {
    const api = fakeApi()
    api.meals.listMeals.mockRejectedValue(new Error('hors ligne'))
    const { user } = renderPage({ api })
    await user.click(within(await slot('Soir')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /prévu au planning/ })).not.toBeInTheDocument()
  })

  it('annule la réponse et prévient si le serveur refuse', async () => {
    const api = fakeApi()
    api.mealLog.set.mockRejectedValueOnce(new AppError('Impossible d’enregistrer le repas.'))
    const { user } = renderPage({ api })
    const lunch = await slot('Midi')
    await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
    expect(await screen.findByText('Impossible d’enregistrer le repas.')).toBeInTheDocument()
    expect(within(lunch).getByRole('button', { name: 'Végé' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('affiche la série et la part de repas végés par semaine', async () => {
    const entries = [...full('2026-10-21'), ...full('2026-10-22', ['skipped', 'vegetarian', 'vegetarian']), ...full('2026-10-23'), ...full('2026-10-14', ['meat', 'meat', 'meat'])]
    renderPage({ entries })
    expect(within(await today()).getByText('3 jours d’affilée')).toBeInTheDocument()
    const chart = await stats()
    // Semaine du 19 octobre : 6 végés sur 8 (« pas de repas » non compté)
    expect(within(chart).getByText(/Cette semaine : 75 % \(6 sur 8\)\. Sur 8 semaines : 55 %\./)).toBeInTheDocument()
    expect(within(chart).getByRole('button', { name: 'Semaine du 12 octobre : 0 % végé' })).toBeInTheDocument()
    expect(within(chart).getByRole('button', { name: 'Semaine du 5 octobre : rien de noté' })).toBeInTheDocument()
    expect(within(chart).getAllByRole('button', { name: /^Semaine du/ })).toHaveLength(8)
  })

  it('touche une semaine du graphique : ses jours s’affichent pour les corriger ; un second appui la referme', async () => {
    const { api, user } = renderPage({ entries: full('2026-10-14', ['meat', 'meat', 'meat']) })
    const chart = await stats()
    const week = within(chart).getByRole('button', { name: 'Semaine du 12 octobre : 0 % végé' })
    await user.click(week)
    expect(week).toHaveAttribute('aria-pressed', 'true')
    expect(within(chart).getByRole('heading', { name: 'Semaine du 12 octobre' })).toBeInTheDocument()
    const days = dayGroups(chart)
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Lundi 12 octobre',
      'Mardi 13 octobre',
      'Mercredi 14 octobre',
      'Jeudi 15 octobre',
      'Vendredi 16 octobre',
      'Samedi 17 octobre',
      'Dimanche 18 octobre',
    ])

    // Le mercredi était non végé à midi : on corrige
    const lunch = within(days[2]!).getByRole('group', { name: 'Midi' })
    expect(within(lunch).getByRole('button', { name: 'Non végé' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(lunch).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(LUCILE.id, '2026-10-14', 'LUNCH', 'vegetarian')
    const updated = within(chart).getByRole('button', { name: 'Semaine du 12 octobre : 33 % végé' })
    expect(updated).toHaveAttribute('aria-pressed', 'true')

    await user.click(updated)
    expect(within(chart).queryByRole('heading', { name: 'Semaine du 12 octobre' })).not.toBeInTheDocument()
  })

  it('la semaine en cours s’arrête à aujourd’hui', async () => {
    const { user } = renderPage({ entries: full('2026-10-21') })
    const chart = await stats()
    await user.click(within(chart).getByRole('button', { name: /^Semaine du 19 octobre/ }))
    const days = dayGroups(chart)
    expect(days).toHaveLength(6)
    expect(days.at(-1)).toHaveAttribute('aria-label', 'Aujourd’hui, samedi 24 octobre')
  })

  it('suit la personne choisie', async () => {
    const { api, user } = renderPage({ route: `/vege?profil=${ERIC.id}` })
    await waitFor(() => expect(api.mealLog.list).toHaveBeenCalledWith(ERIC.id, expect.any(String), TODAY))
    expect(screen.getByText('Repas végés ou non de Eric')).toBeInTheDocument()
    await user.click(within(await slot('Midi')).getByRole('button', { name: 'Végé' }))
    expect(api.mealLog.set).toHaveBeenCalledWith(ERIC.id, TODAY, 'LUNCH', 'vegetarian')
    await user.click(screen.getByRole('radio', { name: 'Lucile' }))
    await waitFor(() => expect(api.mealLog.list).toHaveBeenCalledWith(LUCILE.id, expect.any(String), TODAY))
  })

  it('erreur de chargement : un message et « Réessayer »', async () => {
    const api = fakeApi()
    api.mealLog.list.mockRejectedValueOnce(new AppError('Impossible de charger le journal des repas.'))
    const { user } = renderPage({ api })
    expect(await screen.findByText('Impossible de charger le journal des repas.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Repas du jour' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await today()).toBeInTheDocument()
  })
})
