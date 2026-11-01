import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsProvider } from '@/app/SettingsContext'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { SettingsPage } from './SettingsPage'

function renderPage(api = fakeApi()) {
  return renderWithApp(
    <SettingsProvider>
      <SettingsPage />
    </SettingsProvider>,
    { api },
  )
}

const checkboxes = (name: string) => screen.getAllByRole('checkbox', { name })

describe('SettingsPage', () => {
  it('active le suivi d’hydratation pour la personne connectée', async () => {
    const user = userEvent.setup()
    const { api } = renderPage()
    const [page, notification] = await screen.findAllByRole('checkbox', { name: 'Hydratation' })
    expect(page).not.toBeChecked()
    expect(checkboxes('Planning')[0]).toBeChecked()
    expect(screen.queryByRole('region', { name: 'Hydratation' })).not.toBeInTheDocument()
    // Notifications d'une page désactivée : sans objet
    expect(notification).toHaveAttribute('aria-disabled', 'true')

    await user.click(page!)
    expect(api.settings.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, disabledPages: [] })
    expect(screen.getByRole('region', { name: 'Hydratation' })).toBeInTheDocument()
    expect(checkboxes('Hydratation')[1]).toBeChecked()
  })

  it('masque une page, et coupe les notifications des courses', async () => {
    const user = userEvent.setup()
    const { api } = renderPage()
    await screen.findAllByRole('checkbox', { name: 'Courses' })
    await user.click(checkboxes('Courses')[0]!)
    expect(api.settings.saveSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, disabledPages: ['hydratation', 'courses'] })
    expect(checkboxes('Courses')[1]).toHaveAttribute('aria-disabled', 'true')

    await user.click(checkboxes('Courses')[0]!)
    await user.click(checkboxes('Courses')[1]!)
    expect(api.settings.saveSettings).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, mutedNotifications: ['courses'] })
    expect(checkboxes('Courses')[1]).not.toBeChecked()
  })

  it('change l’objectif d’hydratation, en litres', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: [] })
    renderPage(api)
    const goal = await screen.findByRole('textbox', { name: 'Objectif par jour (litres)' })
    expect(goal).toHaveValue('1,5')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()

    await user.clear(goal)
    await user.type(goal, '9')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Entre un objectif entre 0,5 et 5 L.')
    expect(api.settings.saveSettings).not.toHaveBeenCalled()

    await user.clear(goal)
    await user.type(goal, '2')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(api.settings.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, disabledPages: [], hydrationGoalMl: 2000 })
    expect(await screen.findByRole('textbox', { name: 'Objectif par jour (litres)' })).toHaveValue('2')
  })

  it('rétablit le réglage si l’enregistrement échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.settings.saveSettings.mockRejectedValueOnce(new Error('réseau'))
    renderPage(api)
    await screen.findAllByRole('checkbox', { name: 'Planning' })
    await user.click(checkboxes('Planning')[0]!)
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument()
    expect(checkboxes('Planning')[0]).toBeChecked()
  })

  it('signale des réglages illisibles et explique les notifications hors application installée', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockRejectedValueOnce(new Error('réseau'))
    renderPage(api)
    expect(await screen.findByText('Une erreur est survenue.')).toBeInTheDocument()
    expect(screen.getByText('Disponibles seulement dans l’application installée sur le téléphone.')).toBeInTheDocument()
  })
})
