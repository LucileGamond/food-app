import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsProvider } from '@/app/SettingsContext'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { HydrationPage } from './HydrationPage'

const NOW = new Date('2026-11-10T15:00:00')
const local = (time: string) => new Date(`2026-11-10T${time}:00`).toISOString()

function setup() {
  const api = fakeApi()
  api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: [] })
  return api
}

function renderPage(api = setup()) {
  return renderWithApp(
    <SettingsProvider>
      <HydrationPage today="2026-11-10" now={NOW} />
    </SettingsProvider>,
    { api },
  )
}

describe('HydrationPage', () => {
  it('ajoute un petit et un grand verre au total du jour', async () => {
    const user = userEvent.setup()
    const { api } = renderPage()
    expect(await screen.findByText('Rien bu aujourd’hui pour l’instant.')).toBeInTheDocument()
    expect(api.hydration.listIntakes).toHaveBeenCalledWith(new Date('2026-11-10T00:00:00'))

    await user.click(screen.getByRole('button', { name: /Petit verre/ }))
    expect(api.hydration.addIntake).toHaveBeenCalledWith(200)
    await user.click(screen.getByRole('button', { name: /Grand verre/ }))
    expect(api.hydration.addIntake).toHaveBeenLastCalledWith(330)

    const today = screen.getByRole('region', { name: 'Aujourd’hui' })
    expect(within(today).getByText('0,53 L')).toBeInTheDocument()
    expect(within(today).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35')
    expect(within(today).getByText('Encore 0,97 L à boire aujourd’hui.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Supprimer le verre de/ })).toHaveLength(2)
  })

  it('affiche le dernier verre, et supprime un verre noté par erreur', async () => {
    const user = userEvent.setup()
    const api = setup()
    api.hydration.listIntakes.mockResolvedValue([
      { id: 'w1', volume_ml: 330, drunk_at: local('09:30') },
      { id: 'w2', volume_ml: 200, drunk_at: local('12:50') },
    ])
    renderPage(api)
    expect(await screen.findByText('Dernier verre à 12:50 (il y a 2 h 10).')).toBeInTheDocument()
    // Navigateur de test sans notifications
    expect(screen.getByText(/Pas de rappel sur cet appareil/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Régler les notifications' })).toHaveAttribute('href', '/reglages')

    await user.click(screen.getByRole('button', { name: 'Supprimer le verre de 12:50' }))
    expect(api.hydration.deleteIntake).toHaveBeenCalledWith('w2')
    expect(screen.queryByRole('button', { name: 'Supprimer le verre de 12:50' })).not.toBeInTheDocument()
    expect(screen.getByText('0,33 L')).toBeInTheDocument()
  })

  it('félicite une fois l’objectif atteint (objectif réglé par la personne)', async () => {
    const api = setup()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: [], hydrationGoalMl: 1000 })
    api.hydration.listIntakes.mockResolvedValue([{ id: 'w1', volume_ml: 1000, drunk_at: local('10:00') }])
    renderPage(api)
    expect(await screen.findByText('Objectif atteint, bravo !')).toBeInTheDocument()
    expect(screen.getByText('Objectif : 1 L par jour')).toBeInTheDocument()
  })

  it('propose de réessayer si le chargement échoue', async () => {
    const user = userEvent.setup()
    const api = setup()
    api.hydration.listIntakes.mockRejectedValueOnce(new Error('réseau'))
    renderPage(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Rien bu aujourd’hui pour l’instant.')).toBeInTheDocument()
  })

  it('rétablit la liste si la suppression échoue', async () => {
    const user = userEvent.setup()
    const api = setup()
    api.hydration.listIntakes.mockResolvedValue([{ id: 'w1', volume_ml: 200, drunk_at: local('10:00') }])
    api.hydration.deleteIntake.mockRejectedValueOnce(new Error('réseau'))
    renderPage(api)
    await user.click(await screen.findByRole('button', { name: 'Supprimer le verre de 10:00' }))
    expect(await screen.findByRole('button', { name: 'Supprimer le verre de 10:00' })).toBeInTheDocument()
    expect(api.hydration.listIntakes).toHaveBeenCalledTimes(2)
  })

  it('signale un verre non enregistré', async () => {
    const user = userEvent.setup()
    const api = setup()
    api.hydration.addIntake.mockRejectedValueOnce(new Error('réseau'))
    renderPage(api)
    await user.click(await screen.findByRole('button', { name: /Petit verre/ }))
    expect((await screen.findAllByText('Une erreur est survenue.')).length).toBeGreaterThan(0)
    expect(api.hydration.addIntake).toHaveBeenCalledWith(200)
    expect(screen.queryByRole('button', { name: /Supprimer le verre de/ })).not.toBeInTheDocument()
  })
})
