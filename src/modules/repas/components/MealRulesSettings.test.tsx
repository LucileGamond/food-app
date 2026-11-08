import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { LUCILE, fakeApi, fakeAuth, renderWithApp } from '@/test/fakes'
import { MealRulesSettings } from './MealRulesSettings'

function setup(api = fakeApi()) {
  renderWithApp(<MealRulesSettings />, { api, auth: fakeAuth({ userId: LUCILE.id }) })
  return api
}

describe('MealRulesSettings', () => {
  it('affiche ma règle et l’enregistre, mots-clés nettoyés', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.weekPlan.getMyRule.mockResolvedValue({ weekdayLunchAtWork: false, ignoredKeywords: ['yoga'] })
    setup(api)
    const checkbox = await screen.findByRole('checkbox', { name: 'Le midi en semaine, je mange au travail' })
    expect(checkbox).not.toBeChecked()
    expect(api.weekPlan.getMyRule).toHaveBeenCalledWith(LUCILE.id)
    const input = screen.getByRole('textbox', { name: 'Rendez-vous qui ne m’empêchent pas de manger à la maison' })
    expect(input).toHaveValue('yoga')

    await user.click(checkbox)
    await user.clear(input)
    await user.type(input, 'Escalade ,, escalade, yoga')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mes règles' }))
    await waitFor(() => expect(api.weekPlan.saveMyRule).toHaveBeenCalledWith({ weekdayLunchAtWork: true, ignoredKeywords: ['Escalade', 'yoga'] }))
    expect(input).toHaveValue('Escalade, yoga')
    expect(await screen.findByText('Règles des repas enregistrées')).toBeInTheDocument()
  })

  it('erreurs de chargement et d’enregistrement', async () => {
    const user = userEvent.setup()
    const failing = fakeApi()
    failing.weekPlan.getMyRule.mockRejectedValue(new AppError('Impossible de charger tes règles des repas.'))
    setup(failing)
    expect(await screen.findByText('Impossible de charger tes règles des repas.')).toBeInTheDocument()

    document.body.innerHTML = ''
    const api = fakeApi()
    api.weekPlan.saveMyRule.mockRejectedValue(new AppError('Impossible d’enregistrer tes règles des repas.'))
    setup(api)
    await user.click(await screen.findByRole('button', { name: 'Enregistrer mes règles' }))
    expect(await screen.findByText('Impossible d’enregistrer tes règles des repas.')).toBeInTheDocument()
  })
})
