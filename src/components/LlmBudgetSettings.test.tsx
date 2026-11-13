import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api/errors'
import { fakeApi, LUCILE, renderWithApp } from '@/test/fakes'
import { LlmBudgetSettings } from './LlmBudgetSettings'

describe('LlmBudgetSettings : budget du mois', () => {
  it('sans budget : le dit, et permet d’en fixer un', async () => {
    const user = userEvent.setup()
    const { api } = renderWithApp(<LlmBudgetSettings />)
    const budget = await screen.findByRole('group', { name: 'Budget du mois' })
    expect(await within(budget).findByText(/Pas de budget/)).toBeInTheDocument()

    await user.type(within(budget).getByLabelText('Budget mensuel (€)'), '5,5')
    api.llmUsage.budgetStatus.mockResolvedValue({ monthlyEur: 5.5, spentUsd: 0 })
    await user.click(within(budget).getByRole('button', { name: 'Enregistrer le budget' }))
    expect(api.llmUsage.setBudget).toHaveBeenCalledWith(5.5)
    // Le bloc est reconstruit avec le nouveau budget
    expect(await screen.findByText('0,00 € sur 5,50 €')).toBeInTheDocument()
  })

  it('affiche la dépense, le reste et la jauge ; refuse un montant invalide ; retire le budget', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.llmUsage.budgetStatus.mockResolvedValue({ monthlyEur: 5, spentUsd: 2.5 })
    renderWithApp(<LlmBudgetSettings />, { api })
    const budget = await screen.findByRole('group', { name: 'Budget du mois' })
    expect(await within(budget).findByText('2,15 € sur 5,00 €')).toBeInTheDocument()
    expect(within(budget).getByText('Reste 2,85 €')).toBeInTheDocument()
    expect(within(budget).getByRole('progressbar', { name: 'Part du budget dépensée' })).toHaveAttribute('aria-valuenow', '43')

    const input = within(budget).getByLabelText('Budget mensuel (€)')
    await user.clear(input)
    await user.type(input, 'beaucoup')
    await user.click(within(budget).getByRole('button', { name: 'Enregistrer le budget' }))
    expect(within(budget).getByRole('alert')).toHaveTextContent('Montant invalide')
    expect(api.llmUsage.setBudget).not.toHaveBeenCalled()

    await user.click(within(budget).getByRole('button', { name: 'Retirer le budget' }))
    expect(api.llmUsage.setBudget).toHaveBeenCalledWith(null)
  })

  it('budget atteint : prévient que les appels IA sont bloqués', async () => {
    const api = fakeApi()
    api.llmUsage.budgetStatus.mockResolvedValue({ monthlyEur: 1, spentUsd: 2 })
    renderWithApp(<LlmBudgetSettings />, { api })
    expect(await screen.findByText(/Budget atteint : les fonctions IA sont bloquées/)).toBeInTheDocument()
  })
})

describe('LlmBudgetSettings : crédit Anthropic', () => {
  it('aucune recharge : invite à en saisir une, sans demander le coût réel', async () => {
    const { api } = renderWithApp(<LlmBudgetSettings />)
    const credit = await screen.findByRole('group', { name: 'Crédit Anthropic' })
    expect(await within(credit).findByText(/Aucune recharge saisie/)).toBeInTheDocument()
    expect(api.llmUsage.realCost).toHaveBeenCalled()
  })

  it('crédit restant estimé et réel, recharges listées, ajout et suppression', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.llmUsage.creditStatus.mockResolvedValue({ creditsUsd: 20, since: '2026-11-01', spentUsd: 3.5 })
    api.llmUsage.listCredits.mockResolvedValue([{ id: 'c1', addedOn: '2026-11-01', amountUsd: 20, note: 'Première', createdBy: LUCILE.id }])
    api.llmUsage.realCost.mockResolvedValue({ available: true, since: '2026-11-01', costUsd: 4, fetchedAt: '2026-11-13T09:00:00Z' })
    renderWithApp(<LlmBudgetSettings />, { api })
    const credit = await screen.findByRole('group', { name: 'Crédit Anthropic' })

    expect(await within(credit).findByText('16,50 $')).toBeInTheDocument()
    expect(within(credit).getByText(/≈ 14,19 €/)).toBeInTheDocument()
    expect(await within(credit).findByText('16,00 $')).toBeInTheDocument()
    expect(within(credit).getByText(/mis à jour le 13\/11/)).toBeInTheDocument()

    const list = within(credit).getByRole('list', { name: 'Recharges' })
    expect(list).toHaveTextContent('20,00 $')
    expect(list).toHaveTextContent('Première')
    await user.click(within(list).getByRole('button', { name: 'Supprimer la recharge du 01/11/2026' }))
    expect(api.llmUsage.deleteCredit).toHaveBeenCalledWith('c1')

    await user.clear(within(credit).getByLabelText('Date'))
    await user.type(within(credit).getByLabelText('Date'), '2026-11-12')
    await user.type(within(credit).getByLabelText('Montant ($)'), '10')
    await user.type(within(credit).getByLabelText('Note (facultatif)'), 'Recharge')
    await user.click(within(credit).getByRole('button', { name: 'Ajouter la recharge' }))
    expect(api.llmUsage.addCredit).toHaveBeenCalledWith({ addedOn: '2026-11-12', amountUsd: 10, note: 'Recharge' })
    expect(api.llmUsage.creditStatus).toHaveBeenCalledTimes(3)
  })

  it('montant de recharge invalide refusé ; coût réel en erreur ou sans clé Admin signalé', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.llmUsage.creditStatus.mockResolvedValue({ creditsUsd: 20, since: '2026-11-01', spentUsd: 0 })
    api.llmUsage.realCost.mockResolvedValue({ available: true, since: '2026-11-01', error: 'La clé Admin Anthropic est refusée.' })
    renderWithApp(<LlmBudgetSettings />, { api })
    const credit = await screen.findByRole('group', { name: 'Crédit Anthropic' })
    expect(await within(credit).findByText('La clé Admin Anthropic est refusée.')).toBeInTheDocument()
    await user.type(within(credit).getByLabelText('Montant ($)'), '0')
    await user.click(within(credit).getByRole('button', { name: 'Ajouter la recharge' }))
    expect(within(credit).getByRole('alert')).toHaveTextContent('Montant invalide')
    expect(api.llmUsage.addCredit).not.toHaveBeenCalled()
  })

  it('sans clé Admin : crédit estimé seulement, avec une explication', async () => {
    const api = fakeApi()
    api.llmUsage.creditStatus.mockResolvedValue({ creditsUsd: 20, since: '2026-11-01', spentUsd: 1 })
    renderWithApp(<LlmBudgetSettings />, { api })
    expect(await screen.findByText(/clé Admin Anthropic/)).toBeInTheDocument()
  })

  it('erreur de chargement', async () => {
    const api = fakeApi()
    api.llmUsage.budgetStatus.mockRejectedValue(new AppError('Impossible de charger le budget IA.'))
    renderWithApp(<LlmBudgetSettings />, { api })
    expect(await screen.findByText('Impossible de charger le budget IA.')).toBeInTheDocument()
  })
})
