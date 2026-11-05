import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { eventFixture, plantFixture, ruleFixture } from '@/test/plants'
import type { Plant, WateringEvent } from '../lib/plants'
import { PlantDetailPage } from './PlantDetailPage'

const cactus = plantFixture({
  id: 'cactus',
  name: 'Cactus',
  species: 'Echinocactus grusonii',
  location: 'Salon',
  planted_on: '2026-04-01',
  planted_height_cm: 12.5,
  pot_diameter_cm: null,
  notes: 'Plein soleil',
  photos: [
    { id: 'p2', storage_path: 'cactus/2.jpg', position: 1 },
    { id: 'p1', storage_path: 'cactus/1.jpg', position: 0 },
  ],
  rules: [
    ruleFixture({ id: 'hiver', months: [11, 12, 1, 2], first_watering_on: '2026-11-15', interval_count: 6, interval_unit: 'week', amount_ml: 200 }),
    ruleFixture({ id: 'ete', months: [6, 7, 8], first_watering_on: '2026-06-05', interval_count: 1, interval_unit: 'month', amount_ml: 1000, note: 'Eau de pluie' }),
  ],
})

function setup(plant: Plant | null = cactus, events: WateringEvent[] = []) {
  const api = fakeApi()
  api.plants.getPlant.mockResolvedValue(plant)
  api.plants.listEvents.mockResolvedValue(events)
  const result = renderWithApp(<PlantDetailPage today="2026-10-24" />, {
    api,
    route: '/plantes/cactus',
    path: '/plantes/:id',
    extraRoutes: <Route path="/plantes" element={<p>Liste des plantes</p>} />,
  })
  return result
}

describe('PlantDetailPage', () => {
  it('affiche la fiche, les photos, les règles et les prochains arrosages', async () => {
    const { api } = setup()
    expect(await screen.findByRole('heading', { name: 'Cactus', level: 1 })).toBeInTheDocument()
    expect(api.plants.listEvents).toHaveBeenCalledWith({ plantId: 'cactus' })
    expect(screen.getByText('Echinocactus grusonii')).toBeInTheDocument()

    const infos = screen.getByRole('region', { name: 'Informations' })
    expect(within(infos).getByText('Salon')).toBeInTheDocument()
    expect(within(infos).getByText('1 avril 2026')).toBeInTheDocument()
    expect(within(infos).getByText('12,5 cm')).toBeInTheDocument()
    expect(within(infos).getByText('Plein soleil')).toBeInTheDocument()

    const rules = screen.getByRole('list', { name: 'Règles d’arrosage' })
    expect(within(rules).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Juin → août1 L tous les moisEau de pluie',
      'Novembre → février200 ml toutes les 6 semaines',
    ])
    expect(screen.getByText(/Prochain arrosage le 15 nov\. · 200 ml/)).toBeInTheDocument()
    expect(screen.getByText('Le 15 nov. · 200 ml')).toBeInTheDocument()

    // Photo principale = position 0, vignettes pour changer
    expect(await screen.findByRole('img', { name: 'Cactus' })).toHaveAttribute('src', 'https://cdn.test/cactus/1.jpg')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Voir la photo 2' }))
    expect(screen.getByRole('img', { name: 'Cactus' })).toHaveAttribute('src', 'https://cdn.test/cactus/2.jpg')
  })

  it('historique : qui, quand, combien, prévu ou hors planning', async () => {
    setup(cactus, [
      eventFixture({ id: 'e2', plant_id: 'cactus', scheduled_on: null, watered_at: '2026-10-20T17:30:00Z', amount_ml: null, done_by: 'u-lucile', note: 'Feuilles molles' }),
      eventFixture({ id: 'e1', plant_id: 'cactus', scheduled_on: '2026-08-05', watered_at: '2026-08-07T06:00:00Z', amount_ml: 1000, done_by: 'u-eric' }),
      eventFixture({ id: 'e0', plant_id: 'cactus', scheduled_on: '2026-07-05', watered_at: '2026-07-05T06:00:00Z', amount_ml: 1000, done_by: null }),
    ])
    const history = await screen.findByRole('list', { name: 'Historique des arrosages' })
    const items = within(history).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Mardi 20 octobre à 19 h 30')
    // Noms des profils chargés avec la session
    await waitFor(() => expect(items[0]).toHaveTextContent('Par Lucile'))
    expect(items[0]).toHaveTextContent('Hors planning')
    expect(items[0]).toHaveTextContent('Feuilles molles')
    expect(items[1]).toHaveTextContent('Par Eric · 1 L')
    expect(items[1]).toHaveTextContent('Prévu le 5 août · 2 j de retard')
    expect(items[2]).toHaveTextContent('Par quelqu’un · 1 L')
    expect(items[2]).toHaveTextContent('Prévu le 5 juil.')
    expect(screen.getByText(/Arrosée il y a 4 jours par/)).toHaveTextContent('Arrosée il y a 4 jours par Lucile')
  })

  it('supprimer un arrosage de l’historique, après confirmation', async () => {
    const user = userEvent.setup()
    const { api } = setup(cactus, [eventFixture({ id: 'e1', plant_id: 'cactus', watered_at: '2026-10-20T17:30:00Z' })])
    await user.click(await screen.findByRole('button', { name: 'Supprimer l’arrosage du mardi 20 octobre' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.plants.undoWatering).toHaveBeenCalledWith('e1'))
  })

  it('échéance en attente : « Marquer comme arrosée » la couvre', async () => {
    const user = userEvent.setup()
    const plant = plantFixture({ id: 'cactus', name: 'Cactus' })
    const { api } = setup(plant)
    expect(await screen.findByText(/En retard de 2 jours/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Marquer comme arrosée/ }))
    await waitFor(() =>
      expect(api.plants.water).toHaveBeenCalledWith({ plantId: 'cactus', scheduledOn: '2026-10-22', ruleId: 'rule-1', amountMl: 250 }),
    )
  })

  it('rien en attente : « Arroser maintenant » note un arrosage hors planning', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: /Arroser maintenant/ }))
    await waitFor(() => expect(api.plants.water).toHaveBeenCalledWith({ plantId: 'cactus', scheduledOn: null, ruleId: null, amountMl: 200 }))
  })

  it('sans règle : lien pour en ajouter', async () => {
    setup(plantFixture({ id: 'cactus', rules: [] }))
    expect(await screen.findByText(/Aucune règle d’arrosage\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'En ajouter une' })).toHaveAttribute('href', '/plantes/cactus/modifier')
  })

  it('archiver puis réactiver', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archiver' }))
    await waitFor(() => expect(api.plants.setArchived).toHaveBeenCalledWith('cactus', true))
    expect(await screen.findByText('Plante archivée : plus de rappels')).toBeInTheDocument()
  })

  it('plante archivée : pas de rappel, réactivation possible', async () => {
    const user = userEvent.setup()
    const { api } = setup({ ...cactus, archived_at: '2026-10-01T00:00:00Z' })
    expect(await screen.findByText('Archivée')).toBeInTheDocument()
    expect(screen.getByText('Plante archivée : aucun rappel n’est envoyé.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Réactiver' }))
    await waitFor(() => expect(api.plants.setArchived).toHaveBeenCalledWith('cactus', false))
  })

  it('erreur à l’archivage', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.plants.setArchived.mockRejectedValue(new AppError('Impossible d’archiver la plante.'))
    await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archiver' }))
    expect(await screen.findByText('Impossible d’archiver la plante.')).toBeInTheDocument()
  })

  it('supprimer la plante après confirmation, retour à la liste', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer Cactus ?' })
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.plants.deletePlant).toHaveBeenCalledWith(cactus))
    expect(await screen.findByText('Liste des plantes')).toBeInTheDocument()
  })

  it('erreur à la suppression', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    api.plants.deletePlant.mockRejectedValue(new AppError('Impossible de supprimer la plante.'))
    await user.click(await screen.findByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Impossible de supprimer la plante.')).toBeInTheDocument()
  })

  it('plante introuvable', async () => {
    setup(null)
    expect(await screen.findByText('Plante introuvable')).toBeInTheDocument()
  })

  it('erreur de chargement', async () => {
    const api = fakeApi()
    api.plants.getPlant.mockRejectedValue(new AppError('Impossible de charger la plante.'))
    renderWithApp(<PlantDetailPage today="2026-10-24" />, { api, route: '/plantes/x', path: '/plantes/:id' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la plante.')
  })
})
