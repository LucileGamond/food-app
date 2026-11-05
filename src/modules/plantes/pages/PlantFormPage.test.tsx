import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { plantFixture, ruleFixture } from '@/test/plants'
import { PlantFormPage } from './PlantFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file], { type: 'image/jpeg' })),
}))

function renderNew(api = fakeApi()) {
  return renderWithApp(<PlantFormPage today="2026-10-24" />, {
    api,
    route: '/plantes/nouvelle',
    path: '/plantes/nouvelle',
    extraRoutes: <Route path="/plantes/:id" element={<p>Fiche enregistrée</p>} />,
  })
}

function renderEdit(plant = plantFixture({ id: 'p1' }), api = fakeApi()) {
  api.plants.getPlant.mockResolvedValue(plant)
  return renderWithApp(<PlantFormPage today="2026-10-24" />, {
    api,
    route: `/plantes/${plant.id}/modifier`,
    path: '/plantes/:id/modifier',
    extraRoutes: <Route path="/plantes/:id" element={<p>Fiche enregistrée</p>} />,
  })
}

describe('PlantFormPage — nouvelle plante', () => {
  it('exige un nom', async () => {
    const user = userEvent.setup()
    const { api } = renderNew()
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Donne un nom à la plante.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-invalid', 'true')
    expect(api.plants.savePlant).not.toHaveBeenCalled()
  })

  it('crée une plante avec deux règles saisonnières', async () => {
    const user = userEvent.setup()
    const { api } = renderNew()

    await user.type(await screen.findByLabelText('Nom'), 'Cactus')
    await user.type(screen.getByLabelText('Espèce'), 'Echinocactus grusonii')
    await user.type(screen.getByLabelText('Emplacement'), 'Salon')
    await user.type(screen.getByLabelText('Date de plantation'), '2026-04-01')
    await user.type(screen.getByLabelText('Taille (cm)'), '12,5')

    // Règle 1 : été, 1 L par mois à partir du 5 juin
    await user.click(screen.getByRole('button', { name: 'Ajouter une règle' }))
    const rule1 = screen.getByRole('group', { name: /Règle 1/ })
    await user.click(within(rule1).getByRole('button', { name: 'Tout désélectionner' }))
    for (const month of ['juin', 'juillet', 'août']) await user.click(within(rule1).getByRole('button', { name: month }))
    expect(within(rule1).getByRole('button', { name: 'juin' })).toHaveAttribute('aria-pressed', 'true')
    const first = within(rule1).getByLabelText('1er arrosage')
    await user.clear(first)
    await user.type(first, '2026-06-05')
    await user.selectOptions(within(rule1).getByLabelText('Unité de fréquence de la règle 1'), 'month')
    const amount = within(rule1).getByLabelText('Quantité')
    await user.clear(amount)
    await user.type(amount, '1')
    await user.selectOptions(within(rule1).getByLabelText('Unité de quantité de la règle 1'), 'L')
    expect(within(rule1).getByText(/Prochains arrosages :/).closest('p')).toHaveTextContent('5 juin, 5 juil., 5 août · 1 L')

    // Règle 2 : propose les mois restants (septembre → mai)
    await user.click(screen.getByRole('button', { name: 'Ajouter une règle' }))
    const rule2 = screen.getByRole('group', { name: /Règle 2/ })
    expect(within(rule2).getByText('· Septembre → mai')).toBeInTheDocument()
    expect(within(rule2).getByText(/Prochains arrosages :/).closest('p')).toHaveTextContent('24 oct., 31 oct., 7 nov., 14 nov., 21 nov. · 250 ml')

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.plants.savePlant).toHaveBeenCalledWith(
        { name: 'Cactus', species: 'Echinocactus grusonii', location: 'Salon', planted_on: '2026-04-01', planted_height_cm: 12.5, pot_diameter_cm: null, notes: null },
        [
          { months: [6, 7, 8], first_watering_on: '2026-06-05', interval_count: 1, interval_unit: 'month', amount_ml: 1000, note: null },
          { months: [1, 2, 3, 4, 5, 9, 10, 11, 12], first_watering_on: '2026-10-24', interval_count: 1, interval_unit: 'week', amount_ml: 250, note: null },
        ],
        undefined,
      ),
    )
    expect(await screen.findByText('Fiche enregistrée')).toBeInTheDocument()
    expect(screen.getByText('Plante ajoutée')).toBeInTheDocument()
  })

  it('erreurs de règles affichées sous le bon champ', async () => {
    const user = userEvent.setup()
    const { api } = renderNew()
    await user.type(await screen.findByLabelText('Nom'), 'Ficus')
    await user.click(screen.getByRole('button', { name: 'Ajouter une règle' }))
    const rule = screen.getByRole('group', { name: /Règle 1/ })
    await user.click(within(rule).getByRole('button', { name: 'Tout désélectionner' }))
    await user.click(within(rule).getByRole('button', { name: 'mars' }))
    await user.click(within(rule).getByRole('button', { name: 'mai' }))
    await user.clear(within(rule).getByLabelText('Fréquence'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await within(rule).findByText('Les mois doivent se suivre : crée une autre règle pour une autre période.')).toBeInTheDocument()
    expect(within(rule).getByText('Fréquence entre 1 et 365.')).toBeInTheDocument()
    expect(within(rule).getByText('Le 1er arrosage doit tomber dans un des mois choisis.')).toBeInTheDocument()
    expect(api.plants.savePlant).not.toHaveBeenCalled()

    await user.click(within(rule).getByRole('button', { name: 'Supprimer la règle 1' }))
    expect(screen.getByText(/Aucune règle : la plante n’aura pas de rappel/)).toBeInTheDocument()
  })

  it('envoie les photos ajoutées après l’enregistrement, dans l’ordre choisi', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.plants.uploadPhoto.mockResolvedValueOnce({ id: 'up1', storage_path: 'new-plant/1.jpg', position: 0 }).mockResolvedValueOnce({ id: 'up2', storage_path: 'new-plant/2.jpg', position: 1 })
    renderNew(api)
    await user.type(await screen.findByLabelText('Nom'), 'Monstera')
    await user.upload(screen.getByLabelText('Choisir des photos'), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ])
    expect(within(screen.getByRole('list', { name: 'Photos de la plante' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Utiliser la photo 2 comme photo principale' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.plants.reorderPhotos).toHaveBeenCalledWith(['up1', 'up2']))
    expect(api.plants.uploadPhoto).toHaveBeenCalledTimes(2)
    expect(api.plants.uploadPhoto.mock.calls[0]![0]).toBe('new-plant')
  })

  it('erreur à l’enregistrement : on reste sur le formulaire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.plants.savePlant.mockRejectedValue(new AppError('Deux règles couvrent le même mois.'))
    renderNew(api)
    await user.type(await screen.findByLabelText('Nom'), 'Ficus')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Deux règles couvrent le même mois.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nouvelle plante' })).toBeInTheDocument()
  })
})

describe('PlantFormPage — modification', () => {
  const plant = plantFixture({
    id: 'p1',
    name: 'Monstera',
    pot_diameter_cm: 20,
    photos: [
      { id: 'ph1', storage_path: 'p1/1.jpg', position: 0 },
      { id: 'ph2', storage_path: 'p1/2.jpg', position: 1 },
    ],
    rules: [ruleFixture({ amount_ml: 1500, note: 'Doucement' })],
  })

  it('pré-remplit le formulaire et enregistre les modifications', async () => {
    const user = userEvent.setup()
    const { api } = renderEdit(plant)
    expect(await screen.findByRole('heading', { name: 'Modifier Monstera' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('Monstera')
    expect(screen.getByLabelText('Pot (Ø cm)')).toHaveValue('20')
    const rule = screen.getByRole('group', { name: /Règle 1/ })
    expect(within(rule).getByLabelText('Quantité')).toHaveValue('1,5')
    expect(within(rule).getByLabelText('Unité de quantité de la règle 1')).toHaveValue('L')
    expect(await screen.findByRole('img', { name: 'Photo 1' })).toHaveAttribute('src', 'https://cdn.test/p1/1.jpg')

    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Nom'), 'Monstera géante')
    await user.click(screen.getByRole('button', { name: 'Retirer la photo 1' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(api.plants.savePlant).toHaveBeenCalled())
    const [input, rules, id] = api.plants.savePlant.mock.calls[0]!
    expect(input.name).toBe('Monstera géante')
    expect(rules[0]).toMatchObject({ amount_ml: 1500, note: 'Doucement' })
    expect(id).toBe('p1')
    expect(api.plants.deletePhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'ph1', storage_path: 'p1/1.jpg' }))
    expect(api.plants.reorderPhotos).not.toHaveBeenCalled()
    expect(await screen.findByText('Plante modifiée')).toBeInTheDocument()
  })

  it('plante supprimée entre-temps', async () => {
    const api = fakeApi()
    api.plants.getPlant.mockResolvedValue(null)
    renderWithApp(<PlantFormPage today="2026-10-24" />, { api, route: '/plantes/x/modifier', path: '/plantes/:id/modifier' })
    expect(await screen.findByText('Plante introuvable')).toBeInTheDocument()
  })

  it('erreur de chargement', async () => {
    const api = fakeApi()
    api.plants.getPlant.mockRejectedValue(new AppError('Impossible de charger la plante.'))
    renderWithApp(<PlantFormPage today="2026-10-24" />, { api, route: '/plantes/x/modifier', path: '/plantes/:id/modifier' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la plante.')
  })
})
