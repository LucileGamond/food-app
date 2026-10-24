import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { PlanItem } from '@/lib/food'
import { ERIC, LUCILE, fakeApi, renderWithApp } from '@/test/fakes'
import { FoodPlanPage } from './FoodPlanPage'

const PLAN: PlanItem[] = [
  { id: 'cafe', meal: 'BREAKFAST', category: 'Boisson', name: 'Café au lait', quantity: 250, unit: 'ml', allowed_occurrences: 7, position: 10 },
  { id: 'yaourt', meal: 'LUNCH', category: 'Produit laitier', name: 'Yaourt', quantity: 125, unit: 'g', allowed_occurrences: 4, position: 20 },
  { id: 'soja', meal: 'LUNCH', category: 'Autres', name: 'Sauce soja', quantity: null, unit: null, allowed_occurrences: 2, position: 30 },
]

function renderPlan(plan = PLAN, api = fakeApi(), route = '/plan/modifier') {
  api.food.listPlan.mockImplementation(async (id: string) => (id === LUCILE.id ? plan : []))
  return renderWithApp(<FoodPlanPage />, { api, route, path: '/plan/modifier' })
}

describe('FoodPlanPage', () => {
  it('liste le plan par moment et par catégorie', async () => {
    const { api } = renderPlan()
    const lunch = await screen.findByRole('region', { name: 'Déjeuner' })
    expect(api.food.listPlan).toHaveBeenCalledWith(LUCILE.id)
    expect(within(lunch).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Produit laitier', 'Autres'])
    const yaourt = within(lunch).getByRole('button', { name: /^Modifier Yaourt.*\(Déjeuner\)$/ })
    expect(yaourt).toHaveTextContent('Modifier Yaourt · 125 g× 4 (Déjeuner)')
    expect(within(lunch).getByRole('button', { name: /^Modifier Sauce\ soja.*\(Déjeuner\)$/ })).toHaveTextContent('Modifier Sauce soja× 2 (Déjeuner)')
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('href', `/plan?profil=${LUCILE.id}`)
  })

  it('ajoute un aliment après validation du formulaire', async () => {
    const user = userEvent.setup()
    const { api } = renderPlan()
    await screen.findByRole('region', { name: 'Déjeuner' })
    await user.click(screen.getByRole('button', { name: 'Ajouter un aliment (Déjeuner)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un aliment' })
    expect(within(dialog).getByLabelText('Moment')).toHaveValue('LUNCH')
    // Les champs requis ne sont signalés qu'à l'enregistrement
    expect(within(dialog).queryByText('Nom requis')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByText('Nom requis')).toBeInTheDocument()
    expect(within(dialog).getByText('Catégorie requise')).toBeInTheDocument()
    expect(api.food.savePlanItem).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Aliment'), 'yaourt')
    await user.type(within(dialog).getByLabelText('Catégorie'), 'Produit laitier')
    expect(within(dialog).getByText('Déjà dans le plan (déjeuner)')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Moment'), 'DINNER')
    expect(within(dialog).queryByText('Déjà dans le plan (déjeuner)')).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Quantité'), '62,5')
    await user.type(within(dialog).getByLabelText('Unité'), 'g')
    await user.clear(within(dialog).getByLabelText('Fois / période'))
    await user.type(within(dialog).getByLabelText('Fois / période'), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.food.savePlanItem).toHaveBeenCalledWith(
      LUCILE.id,
      { meal: 'DINNER', category: 'Produit laitier', name: 'yaourt', quantity: 62.5, unit: 'g', allowed_occurrences: 3, position: 31 },
      undefined,
    )
    expect(await screen.findByText('Aliment ajouté')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('modifie un aliment ; garde le formulaire ouvert en cas d’erreur', async () => {
    const user = userEvent.setup()
    const { api } = renderPlan()
    await user.click(await screen.findByRole('button', { name: /^Modifier Yaourt.*\(Déjeuner\)$/ }))
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'aliment" })
    expect(within(dialog).getByLabelText('Aliment')).toHaveValue('Yaourt')
    expect(within(dialog).getByLabelText('Quantité')).toHaveValue('125')
    expect(within(dialog).getByLabelText('Fois / période')).toHaveValue('4')
    await user.clear(within(dialog).getByLabelText('Fois / période'))
    await user.type(within(dialog).getByLabelText('Fois / période'), '0')
    expect(within(dialog).getByText('Entre 1 et 99')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Fois / période'))
    await user.type(within(dialog).getByLabelText('Fois / période'), '5')

    api.food.savePlanItem.mockRejectedValueOnce(new AppError('Cet aliment est déjà dans le plan pour ce moment.'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Cet aliment est déjà dans le plan pour ce moment.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.food.savePlanItem).toHaveBeenLastCalledWith(
      LUCILE.id,
      { meal: 'LUNCH', category: 'Produit laitier', name: 'Yaourt', quantity: 125, unit: 'g', allowed_occurrences: 5 },
      'yaourt',
    )
    expect(await screen.findByText('Aliment modifié')).toBeInTheDocument()
  })

  it('retire un aliment après confirmation', async () => {
    const user = userEvent.setup()
    const { api } = renderPlan()
    await user.click(await screen.findByRole('button', { name: /^Modifier Sauce\ soja.*\(Déjeuner\)$/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Sauce soja (Déjeuner). Les périodes déjà créées ne changent pas.')
    await user.click(within(confirm).getByRole('button', { name: 'Retirer' }))
    expect(api.food.deletePlanItem).toHaveBeenCalledWith('soja')
    expect(await screen.findByText('Aliment retiré du plan')).toBeInTheDocument()
  })

  it('plan vide pour une autre personne', async () => {
    const user = userEvent.setup()
    const { api } = renderPlan(PLAN, fakeApi(), `/plan/modifier?profil=${ERIC.id}`)
    expect(await screen.findByText('Plan vide')).toBeInTheDocument()
    expect(api.food.listPlan).toHaveBeenCalledWith(ERIC.id)
    expect(screen.getByText(/Ajoute les aliments du plan de Eric/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Lucile' }))
    expect(await screen.findByRole('region', { name: 'Petit-déjeuner' })).toBeInTheDocument()
  })

  it('ajoute depuis l’en-tête avec le premier moment par défaut', async () => {
    const user = userEvent.setup()
    const { api } = renderPlan([])
    await screen.findByText('Plan vide')
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un aliment' })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Moment')).toHaveValue('BREAKFAST')
    await user.type(within(dialog).getByLabelText('Aliment'), 'Pain')
    await user.type(within(dialog).getByLabelText('Catégorie'), 'Aliment glucidique')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.food.savePlanItem).toHaveBeenCalledWith(
      LUCILE.id,
      { meal: 'BREAKFAST', category: 'Aliment glucidique', name: 'Pain', quantity: null, unit: null, allowed_occurrences: 1, position: 1 },
      undefined,
    )
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.food.listPlan.mockRejectedValueOnce(new AppError('Impossible de charger le plan.'))
    renderPlan(PLAN, api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le plan.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('region', { name: 'Déjeuner' })).toBeInTheDocument()
  })
})
