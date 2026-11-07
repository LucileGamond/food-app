import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { ERIC_SOURCE, eventFixture, sourceFixture } from '@/test/agenda'
import { ERIC, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { plantFixture, ruleFixture } from '@/test/plants'
import { AgendaPage } from './AgendaPage'

// Aujourd'hui : mardi 10 novembre 2026.
const TODAY = '2026-11-10'
const dentiste = eventFixture({ id: 'e1', title: 'Dentiste', location: 'Cabinet du centre' })
const reunion = eventFixture({ id: 'e2', title: 'Réunion', ownerId: ERIC.id, ownerName: ERIC.display_name, startsAt: '2026-11-12T13:00:00Z', endsAt: '2026-11-12T14:00:00Z' })
const vacances = eventFixture({ id: 'e3', title: 'Vacances', allDay: true, startDate: '2026-11-15', endDate: '2026-11-18' } as never)

function setup(options: { sources?: ReturnType<typeof sourceFixture>[]; pages?: { planning?: boolean; plantes?: boolean }; api?: ReturnType<typeof fakeApi> } = {}) {
  const api = options.api ?? fakeApi()
  const disabled = DEFAULT_SETTINGS.disabledPages.filter((p) => !(p === 'plantes' && options.pages?.plantes)).concat(options.pages?.planning === false ? ['planning'] : [])
  api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: disabled })
  api.agenda.listSources.mockResolvedValue(options.sources ?? [sourceFixture(), ERIC_SOURCE])
  api.agenda.listEvents.mockResolvedValue([dentiste, reunion, vacances])
  return renderWithApp(<AgendaPage today={TODAY} />, { api, route: '/agenda', path: '/agenda' })
}

const day = (name: RegExp) => screen.findByRole('region', { name })

describe('AgendaPage', () => {
  it('la semaine à partir d’aujourd’hui, avec les rendez-vous des deux agendas', async () => {
    const { api } = setup()
    const today = await day(/Mardi 10 novembre/)
    expect(within(today).getByText('aujourd’hui')).toBeInTheDocument()
    expect(within(today).getByText('9 h – 10 h')).toBeInTheDocument()
    expect(within(today).getByText('Cabinet du centre')).toBeInTheDocument()
    // Rendez-vous d'Eric : son prénom
    const thursday = await day(/Jeudi 12 novembre/)
    expect(within(thursday).getByText('Réunion')).toBeInTheDocument()
    expect(within(thursday).getByText('Eric')).toBeInTheDocument()
    // Journée entière sur plusieurs jours
    expect(within(await day(/Lundi 16 novembre/)).getByText('Vacances')).toBeInTheDocument()
    expect(within(await day(/Mercredi 11 novembre/)).getByText('Aucun rendez-vous')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /novembre/ })).toHaveLength(7)
    expect(api.agenda.listEvents).toHaveBeenCalledWith('2026-11-10', '2026-11-16')
  })

  it('choisir les agendas affichés : filtre et enregistre le réglage', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await day(/Mardi 10 novembre/)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Eric' })).toBeEnabled())
    await user.click(screen.getByRole('radio', { name: 'Eric' }))
    await waitFor(() => expect(screen.queryByText('Dentiste')).not.toBeInTheDocument())
    expect(screen.getByText('Réunion')).toBeInTheDocument()
    await waitFor(() => expect(api.settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ agendaScope: 'other' })))

    await user.click(screen.getByRole('radio', { name: 'Moi' }))
    expect(await screen.findByText('Dentiste')).toBeInTheDocument()
    expect(screen.queryByText('Réunion')).not.toBeInTheDocument()
  })

  it('semaines suivante et précédente', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await day(/Mardi 10 novembre/)
    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-17', '2026-11-23'))
    expect(screen.getByText('Du 17 novembre au 23 novembre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    await user.click(screen.getByRole('button', { name: 'Semaine précédente' }))
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-03', '2026-11-09'))
  })

  it('avec les repas planifiés et les arrosages prévus (pages affichées)', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: ['hydratation', 'tricot'] })
    api.agenda.listSources.mockResolvedValue([sourceFixture()])
    api.meals.listMeals.mockResolvedValue([mealFixture({ meal_date: TODAY, slot: 'DINNER', recipe: { title: 'Soupe de potiron' } })])
    api.plants.listPlants.mockResolvedValue([plantFixture({ id: 'b', name: 'Basilic', rules: [ruleFixture({ first_watering_on: '2026-11-10', interval_count: 1, interval_unit: 'day', amount_ml: 100 })] })])
    renderWithApp(<AgendaPage today={TODAY} />, { api, route: '/agenda', path: '/agenda' })
    const extras = await screen.findByRole('list', { name: 'Repas et arrosages — Mardi 10 novembre' })
    await within(extras).findByText('Basilic · 100 ml')
    expect(within(extras).getByText('Soupe de potiron')).toBeInTheDocument()
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-11-10', '2026-11-16')
  })

  it('pages Planning et Plantes masquées : ni repas ni arrosages', async () => {
    const { api } = setup({ pages: { planning: false } })
    await day(/Mardi 10 novembre/)
    expect(api.meals.listMeals).not.toHaveBeenCalled()
    expect(api.plants.listPlants).not.toHaveBeenCalled()
  })

  it('aucun agenda suivi : invite à en ajouter un', async () => {
    setup({ sources: [] })
    expect(await screen.findByText('Aucun agenda suivi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajouter un agenda' })).toHaveAttribute('href', '/agenda/sources')
  })

  it('erreur de chargement : réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.agenda.listEvents.mockRejectedValueOnce(new AppError('Impossible de charger l’agenda.'))
    setup({ api })
    expect(await screen.findByText('Impossible de charger l’agenda.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await day(/Mardi 10 novembre/)).toBeInTheDocument()
  })
})
