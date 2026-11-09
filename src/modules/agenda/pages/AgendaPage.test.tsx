import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { ERIC_SOURCE, eventFixture, sourceFixture } from '@/test/agenda'
import { ERIC, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { plantFixture, ruleFixture } from '@/test/plants'
import { AgendaPage } from './AgendaPage'

// Aujourd'hui : mardi 10 novembre 2026 ; sa semaine va du lundi 9 au dimanche 15.
const TODAY = '2026-11-10'
const dentiste = eventFixture({ id: 'e1', title: 'Dentiste', location: 'Cabinet du centre', description: 'Apporter la carte Vitale\nhttps://www.doctolib.fr/rdv' })
const reunion = eventFixture({ id: 'e2', title: 'Réunion', sourceName: 'Travail', ownerId: ERIC.id, ownerName: ERIC.display_name, startsAt: '2026-11-12T13:00:00Z', endsAt: '2026-11-12T14:00:00Z' })
const vacances = eventFixture({ id: 'e3', title: 'Vacances', allDay: true, startDate: '2026-11-15', endDate: '2026-11-18' } as never)
const plusTard = eventFixture({ id: 'e4', title: 'Concert', startsAt: '2026-11-27T19:00:00Z', endsAt: '2026-11-27T21:00:00Z' })

function setup(options: { sources?: ReturnType<typeof sourceFixture>[]; pages?: { planning?: boolean; plantes?: boolean }; api?: ReturnType<typeof fakeApi>; route?: string } = {}) {
  const api = options.api ?? fakeApi()
  const disabled = DEFAULT_SETTINGS.disabledPages.filter((p) => !(p === 'plantes' && options.pages?.plantes)).concat(options.pages?.planning === false ? ['planning'] : [])
  api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: disabled })
  api.agenda.listSources.mockResolvedValue(options.sources ?? [sourceFixture(), ERIC_SOURCE])
  api.agenda.listEvents.mockResolvedValue([dentiste, reunion, vacances, plusTard])
  return renderWithApp(<AgendaPage today={TODAY} />, { api, route: options.route ?? '/agenda', path: '/agenda' })
}

const day = (name: RegExp) => screen.findByRole('region', { name })

describe('AgendaPage — semaine', () => {
  it('la semaine du lundi au dimanche, avec les rendez-vous des deux agendas', async () => {
    const { api } = setup()
    const today = await day(/Mardi 10 novembre/)
    expect(within(today).getByText('aujourd’hui')).toBeInTheDocument()
    expect(within(today).getByText('9 h – 10 h')).toBeInTheDocument()
    expect(within(today).getByText('Cabinet du centre')).toBeInTheDocument()
    const thursday = await day(/Jeudi 12 novembre/)
    expect(within(thursday).getByText('Réunion')).toBeInTheDocument()
    expect(within(thursday).getByText('Eric')).toBeInTheDocument()
    expect(within(await day(/Dimanche 15 novembre/)).getByText('Vacances')).toBeInTheDocument()
    expect(within(await day(/Lundi 9 novembre/)).getByText('Aucun rendez-vous')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /novembre/ })).toHaveLength(7)
    expect(screen.getByText('Du 9 novembre au 15 novembre')).toBeInTheDocument()
    expect(api.agenda.listEvents).toHaveBeenCalledWith('2026-11-09', '2026-11-15')
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

  it('semaines suivante et précédente, retour à aujourd’hui', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await day(/Mardi 10 novembre/)
    expect(screen.getByRole('button', { name: 'Aujourd’hui' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-16', '2026-11-22'))
    expect(screen.getByText('Du 16 novembre au 22 novembre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    await user.click(screen.getByRole('button', { name: 'Semaine précédente' }))
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-02', '2026-11-08'))
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
    // Arrosages prévus jusqu'au dimanche ; rien la veille (passé)
    expect(within(await day(/Dimanche 15 novembre/)).getByText('Basilic · 100 ml')).toBeInTheDocument()
    expect(within(await day(/Lundi 9 novembre/)).queryByText('Basilic · 100 ml')).not.toBeInTheDocument()
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-11-09', '2026-11-15')
  })

  it('pages Planning et Plantes masquées : ni repas ni arrosages', async () => {
    const { api } = setup({ pages: { planning: false } })
    await day(/Mardi 10 novembre/)
    expect(api.meals.listMeals).not.toHaveBeenCalled()
    expect(api.plants.listPlants).not.toHaveBeenCalled()
  })
})

describe('AgendaPage — mois', () => {
  it('grille du mois en semaines complètes, puis le jour choisi', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await day(/Mardi 10 novembre/)
    await user.click(screen.getByRole('tab', { name: 'Mois' }))
    const grid = await screen.findByRole('group', { name: 'Novembre 2026' })
    expect(within(grid).getAllByRole('button')).toHaveLength(42)
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06'))
    // Aujourd'hui choisi par défaut, ses rendez-vous dessous
    expect(within(grid).getByRole('button', { name: 'Mardi 10 novembre : 1 rendez-vous' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(await day(/Mardi 10 novembre/)).getByText('Dentiste')).toBeInTheDocument()

    await user.click(within(grid).getByRole('button', { name: 'Vendredi 27 novembre : 1 rendez-vous' }))
    expect(within(await day(/Vendredi 27 novembre/)).getByText('Concert')).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Mercredi 11 novembre : aucun rendez-vous' })).toHaveAttribute('aria-pressed', 'false')
    // Vacances sur trois jours, à cheval sur deux semaines
    expect(within(grid).getByRole('button', { name: 'Lundi 16 novembre : 1 rendez-vous' })).toBeInTheDocument()
  })

  it('mois suivant, gardé dans l’adresse', async () => {
    const user = userEvent.setup()
    const { api } = setup({ route: '/agenda?vue=mois&jour=2026-11-27' })
    expect(await screen.findByRole('group', { name: 'Novembre 2026' })).toBeInTheDocument()
    expect(within(await day(/Vendredi 27 novembre/)).getByText('Concert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }))
    expect(await screen.findByRole('group', { name: 'Décembre 2026' })).toBeInTheDocument()
    await waitFor(() => expect(api.agenda.listEvents).toHaveBeenLastCalledWith('2026-11-30', '2027-01-03'))
    await user.click(screen.getByRole('tab', { name: 'Semaine' }))
    expect(await screen.findByText('Du 21 décembre au 27 décembre')).toBeInTheDocument()
  })
})

describe('AgendaPage — détail d’un rendez-vous', () => {
  it('un clic ouvre le détail : quand, où, quel agenda, description', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: /Dentiste.*voir le détail/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Dentiste' })
    expect(dialog).toHaveTextContent('Mardi 10 novembre, 9 h – 10 h')
    expect(dialog).toHaveTextContent('Cabinet du centre')
    expect(within(dialog).getByRole('link', { name: /Ouvrir dans Maps/ })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Cabinet%20du%20centre')
    expect(dialog).toHaveTextContent('Perso · moi')
    expect(dialog).toHaveTextContent('Apporter la carte Vitale')
    expect(within(dialog).getByRole('link', { name: 'doctolib.fr/rdv' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Rendez-vous d'Eric, sans lieu ni description
    await user.click(screen.getByRole('button', { name: /Réunion/ }))
    const other = await screen.findByRole('dialog', { name: 'Réunion' })
    expect(other).toHaveTextContent('Travail · Eric')
    expect(within(other).queryByRole('link', { name: /Ouvrir dans Maps/ })).not.toBeInTheDocument()
  })
})

describe('AgendaPage — période', () => {
  it('au changement de semaine, chargement (pas « Aucun rendez-vous ») tant que la nouvelle semaine n’est pas lue', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await day(/Mardi 10 novembre/)
    let resolve: (events: never[]) => void = () => undefined
    api.agenda.listEvents.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    expect(await screen.findByLabelText('Chargement de l’agenda')).toBeInTheDocument()
    expect(screen.queryByText('Aucun rendez-vous')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Lundi 16 novembre/ })).not.toBeInTheDocument()
    resolve([])
    expect(within(await day(/Lundi 16 novembre/)).getByText('Aucun rendez-vous')).toBeInTheDocument()
  })

  it('hors de la période synchronisée (semaine passée → deux mois) : dit pourquoi il n’y a rien', async () => {
    setup({ route: '/agenda?jour=2027-01-20' })
    const far = await day(/Mercredi 20 janvier/)
    expect(within(far).getByText(/Hors de la période synchronisée/)).toBeInTheDocument()
    expect(within(far).queryByText('Aucun rendez-vous')).not.toBeInTheDocument()
  })

  it('dans la période synchronisée : « Aucun rendez-vous »', async () => {
    setup({ route: '/agenda?jour=2026-11-03' })
    expect(within(await day(/Mercredi 4 novembre/)).getByText('Aucun rendez-vous')).toBeInTheDocument()
    expect(within(await day(/Mardi 3 novembre/)).getByText(/Hors de la période synchronisée/)).toBeInTheDocument()
  })
})

describe('AgendaPage — états', () => {
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
