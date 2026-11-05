import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { eventFixture, plantFixture, ruleFixture } from '@/test/plants'
import { PlantsPage } from './PlantsPage'

// Aujourd'hui : samedi 24 octobre 2026. La règle par défaut tombe les jeudis (22 et 29 oct.).
const monstera = plantFixture({ id: 'monstera', name: 'Monstera', location: 'Salon', photos: [{ id: 'ph', storage_path: 'monstera/1.jpg', position: 0 }] })
const basilic = plantFixture({
  id: 'basilic',
  name: 'Basilic',
  species: null,
  location: 'Cuisine',
  rules: [ruleFixture({ id: 'r-basilic', first_watering_on: '2026-10-20', interval_count: 2, interval_unit: 'day', amount_ml: 100 })],
})
const ficus = plantFixture({ id: 'ficus', name: 'Ficus', species: 'Ficus elastica', location: 'Bureau', rules: [] })
const ancien = plantFixture({ id: 'ancien', name: 'Ancien cactus', archived_at: '2026-09-01T00:00:00Z' })

function setup(options: { plants?: ReturnType<typeof plantFixture>[]; events?: ReturnType<typeof eventFixture>[]; route?: string } = {}) {
  const api = fakeApi()
  // L'API renvoie les plantes triées par nom
  api.plants.listPlants.mockResolvedValue(options.plants ?? [ancien, basilic, ficus, monstera])
  api.plants.listEvents.mockResolvedValue(options.events ?? [])
  return renderWithApp(<PlantsPage today="2026-10-24" />, { api, route: options.route ?? '/plantes', path: '/plantes' })
}

describe('PlantsPage — À arroser', () => {
  it('liste les plantes à arroser, les plus en retard d’abord', async () => {
    setup()
    const list = await screen.findByRole('region', { name: /À arroser/ })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((i) => within(i).getAllByRole('link')[0]!.textContent)).toEqual(['Monstera', 'Basilic'])
    expect(within(items[0]!).getByText(/En retard de 2 jours · 250 ml/)).toBeInTheDocument()
    expect(within(items[1]!).getByText(/À arroser aujourd’hui · 100 ml/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /À arroser\s*2/ })).toBeInTheDocument()
  })

  it('marquer une plante comme arrosée enregistre l’échéance couverte', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Marquer Monstera comme arrosée' }))
    await waitFor(() =>
      expect(api.plants.water).toHaveBeenCalledWith({ plantId: 'monstera', scheduledOn: '2026-10-22', ruleId: 'rule-1', amountMl: 250 }),
    )
    expect(await screen.findByText('Monstera : arrosage noté')).toBeInTheDocument()
    // Rechargement des données après l'enregistrement
    await waitFor(() => expect(api.plants.listPlants).toHaveBeenCalledTimes(2))
  })

  it('le message de confirmation permet d’annuler', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.plants.water.mockResolvedValue(eventFixture({ id: 'event-new', plant_id: 'basilic' }))
    await user.click(await screen.findByRole('button', { name: 'Marquer Basilic comme arrosée' }))
    const toast = (await screen.findByText('Basilic : arrosage noté')).closest('[data-sonner-toast]') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(api.plants.undoWatering).toHaveBeenCalledWith('event-new'))
    expect(await screen.findByText('Arrosage annulé')).toBeInTheDocument()
  })

  it('erreur à l’enregistrement', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.plants.water.mockRejectedValue(new AppError('Cet arrosage a déjà été noté.'))
    await user.click(await screen.findByRole('button', { name: 'Marquer Basilic comme arrosée' }))
    expect(await screen.findByText('Cet arrosage a déjà été noté.')).toBeInTheDocument()
  })

  it('montre qui a déjà arrosé aujourd’hui, et permet d’annuler', async () => {
    const user = userEvent.setup()
    const { api } = setup({
      events: [eventFixture({ id: 'e-today', plant_id: 'monstera', scheduled_on: '2026-10-22', watered_at: '2026-10-24T07:12:00Z', done_by: 'u-eric' })],
    })
    const done = await screen.findByRole('region', { name: 'Déjà arrosées aujourd’hui' })
    expect(within(done).getByText('Monstera')).toBeInTheDocument()
    await waitFor(() => expect(within(done).getByText(/Arrosée à 9 h 12 par/)).toHaveTextContent('Arrosée à 9 h 12 par Eric · 250 ml'))
    expect(within(screen.getByRole('region', { name: /À arroser/ })).queryByText('Monstera')).not.toBeInTheDocument()

    await user.click(within(done).getByRole('button', { name: 'Annuler l’arrosage de Monstera' }))
    await waitFor(() => expect(api.plants.undoWatering).toHaveBeenCalledWith('e-today'))
  })

  it('tout est arrosé + échéances de la semaine', async () => {
    setup({ plants: [plantFixture({ rules: [ruleFixture({ first_watering_on: '2026-10-25' })] })] })
    expect(await screen.findByText('Tout est arrosé')).toBeInTheDocument()
    const week = screen.getByRole('region', { name: 'Cette semaine' })
    expect(within(week).getByText('Demain · 250 ml')).toBeInTheDocument()
  })

  it('aucune plante : invitation à en ajouter une', async () => {
    setup({ plants: [] })
    expect(await screen.findByText('Aucune plante pour l’instant')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ajouter une plante/ })[0]).toHaveAttribute('href', '/plantes/nouvelle')
  })

  it('erreur de chargement, puis nouvel essai', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.plants.listPlants.mockRejectedValueOnce(new AppError('Impossible de charger les plantes.')).mockResolvedValue([])
    renderWithApp(<PlantsPage today="2026-10-24" />, { api, route: '/plantes', path: '/plantes' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les plantes.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucune plante pour l’instant')).toBeInTheDocument()
  })

  it('recharge quand quelqu’un d’autre arrose (temps réel)', async () => {
    const { api } = setup()
    await screen.findByRole('region', { name: /À arroser/ })
    const onChange = api.plants.subscribe.mock.calls[0]![0]
    onChange()
    await waitFor(() => expect(api.plants.listPlants).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })
})

describe('PlantsPage — Toutes', () => {
  it('grille des plantes actives avec leur état et le dernier arrosage', async () => {
    setup({
      route: '/plantes?vue=toutes',
      events: [eventFixture({ plant_id: 'ficus', scheduled_on: null, watered_at: '2026-10-23T16:00:00Z', done_by: 'u-lucile' })],
    })
    const cards = within(await screen.findByRole('list', { name: 'Liste des plantes' })).getAllByRole('listitem')
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Basilic', 'Ficus', 'Monstera'])
    const ficusCard = cards[1]!
    expect(within(ficusCard).getByText('Aucune règle d’arrosage')).toBeInTheDocument()
    await waitFor(() => expect(within(ficusCard).getByText(/Arrosée hier par/)).toHaveTextContent('Arrosée hier par Lucile'))
    expect(within(cards[0]!).getByText('Jamais arrosée')).toBeInTheDocument()
    expect(await within(cards[2]!).findByRole('img', { name: 'Monstera' })).toHaveAttribute('src', 'https://cdn.test/monstera/1.jpg')
  })

  it('recherche sans tenir compte des accents ni des majuscules', async () => {
    const user = userEvent.setup()
    setup({ route: '/plantes?vue=toutes' })
    await user.type(await screen.findByRole('searchbox', { name: 'Rechercher une plante' }), 'ELASTICA')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Ficus'])
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('Aucune plante trouvée')).toBeInTheDocument()
  })

  it('filtre par emplacement', async () => {
    const user = userEvent.setup()
    setup({ route: '/plantes?vue=toutes' })
    const filters = await screen.findByRole('group', { name: 'Filtrer par emplacement' })
    await user.click(within(filters).getByRole('button', { name: 'Cuisine' }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Basilic'])
    await user.click(within(filters).getByRole('button', { name: 'Tous les emplacements' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('affiche les plantes archivées à la demande', async () => {
    const user = userEvent.setup()
    setup({ route: '/plantes?vue=toutes' })
    await user.click(await screen.findByRole('button', { name: 'Archivées (1)' }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Ancien cactus'])
  })

  it('changer d’onglet met à jour l’adresse', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('tab', { name: /Toutes/ }))
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /À arroser/ }))
    expect(await screen.findByRole('region', { name: /À arroser/ })).toBeInTheDocument()
  })
})
