import { DEFAULT_SETTINGS } from '@/lib/settings'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { Layout } from '@/components/Layout'
import { SettingsPage } from '@/pages/SettingsPage'
import { currentDevicePush, PushPermissionError, pushRegistration, subscribeDevice, unsubscribeDevice } from '@/lib/push'
import { fakeApi, renderWithApp } from '@/test/fakes'

vi.mock('@/lib/push', () => {
  class PushPermissionError extends Error {}
  return {
    PushPermissionError,
    pushRegistration: vi.fn(),
    currentDevicePush: vi.fn(),
    subscribeDevice: vi.fn(),
    unsubscribeDevice: vi.fn(),
    rememberPushConfig: vi.fn(async () => undefined),
  }
})

const DEVICE = { endpoint: 'https://push.exemple/abc', p256dh: 'cle', auth: 'secret' }
const registration = {} as ServiceWorkerRegistration

// L'application (proposition d'activer, déconnexion) et ses réglages (état et réglage sur cet appareil).
function renderLayout(api = fakeApi()) {
  return renderWithApp(
    <>
      <Layout />
      <SettingsPage />
    </>,
    { api, route: '/', path: '/' },
  )
}

/** État des notifications de cet appareil, dans les réglages (une fois vérifié). */
const deviceStatus = () => screen.findByText(/^(Activées|Désactivées) sur cet appareil|^Bloquées par le téléphone|^Disponibles seulement/)

describe('notifications de l’application', () => {
  beforeEach(() => {
    vi.mocked(pushRegistration).mockResolvedValue(registration)
    vi.mocked(currentDevicePush).mockResolvedValue(null)
    vi.mocked(subscribeDevice).mockResolvedValue(DEVICE)
    vi.mocked(unsubscribeDevice).mockResolvedValue(DEVICE.endpoint)
    vi.stubGlobal('Notification', { permission: 'default' })
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('propose une fois d’activer les notifications, pour toute l’application', async () => {
    const user = userEvent.setup()
    const { api } = renderLayout()
    const prompt = await screen.findByRole('region', { name: 'Activer les notifications' })
    await user.click(within(prompt).getByRole('button', { name: 'Activer' }))
    expect(subscribeDevice).toHaveBeenCalledWith(registration)
    expect(api.push.saveSubscription).toHaveBeenCalledWith({ ...DEVICE, userAgent: navigator.userAgent })
    expect(await screen.findByText('Notifications activées sur cet appareil')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument())
  })

  it('décrit les notifications choisies dans les réglages, et ne propose rien sans aucune', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: [] })
    const { unmount } = renderLayout(api)
    expect(await screen.findByRole('region', { name: 'Activer les notifications' })).toHaveTextContent(
      'Tu seras prévenu(e) : listes de courses modifiées par l’autre, rappels pour boire, plantes à arroser et rendez-vous du jour.',
    )
    unmount()

    const none = fakeApi()
    none.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, mutedNotifications: ['courses'] })
    renderLayout(none)
    await deviceStatus()
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('« Plus tard » masque la proposition, mémorisée pour les prochains lancements', async () => {
    const user = userEvent.setup()
    const { unmount } = renderLayout()
    const prompt = await screen.findByRole('region', { name: 'Activer les notifications' })
    await user.click(within(prompt).getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
    unmount()
    renderLayout()
    await deviceStatus()
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('les réglages permettent d’activer puis de désactiver sur cet appareil', async () => {
    const user = userEvent.setup()
    const { api } = renderLayout()
    expect(await deviceStatus()).toHaveTextContent('Désactivées sur cet appareil.')
    await user.click(screen.getByRole('button', { name: 'Activer sur cet appareil' }))
    expect(api.push.saveSubscription).toHaveBeenCalled()
    expect(await screen.findByText('Activées sur cet appareil.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Désactiver sur cet appareil' }))
    expect(unsubscribeDevice).toHaveBeenCalledWith(registration)
    expect(api.push.deleteSubscription).toHaveBeenCalledWith(DEVICE.endpoint)
    expect(await screen.findByRole('button', { name: 'Activer sur cet appareil' })).toBeInTheDocument()
  })

  it('reconnaît un appareil déjà abonné (pas de proposition)', async () => {
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockResolvedValue(true)
    renderLayout(api)
    expect(await deviceStatus()).toHaveTextContent('Activées sur cet appareil.')
    expect(api.push.isSubscribed).toHaveBeenCalledWith(DEVICE.endpoint)
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('explique comment débloquer des notifications refusées', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    renderLayout()
    expect(await deviceStatus()).toHaveTextContent('Autorise-les pour Life dans les réglages du téléphone (Applications → Life → Notifications)')
    expect(screen.queryByRole('button', { name: 'Activer sur cet appareil' })).not.toBeInTheDocument()
  })

  it('passe à « bloquées » si l’autorisation est refusée au moment d’activer', async () => {
    const user = userEvent.setup()
    vi.mocked(subscribeDevice).mockRejectedValueOnce(new PushPermissionError())
    const { api } = renderLayout()
    await user.click(within(await screen.findByRole('region', { name: 'Activer les notifications' })).getByRole('button', { name: 'Activer' }))
    expect(await screen.findByText(/^Bloquées par le téléphone/)).toBeInTheDocument()
    expect(api.push.saveSubscription).not.toHaveBeenCalled()
  })

  it('affiche l’erreur d’enregistrement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.push.saveSubscription.mockRejectedValueOnce(new AppError("Impossible d'activer les notifications."))
    renderLayout(api)
    await user.click(within(await screen.findByRole('region', { name: 'Activer les notifications' })).getByRole('button', { name: 'Activer' }))
    expect(await screen.findByText("Impossible d'activer les notifications.")).toBeInTheDocument()
  })

  it('ne montre rien sans application installée', async () => {
    vi.mocked(pushRegistration).mockResolvedValue(null)
    renderLayout()
    await waitFor(() => expect(pushRegistration).toHaveBeenCalled())
    expect(await deviceStatus()).toHaveTextContent('Disponibles seulement dans l’application installée sur le téléphone.')
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('à la déconnexion, l’appareil ne reçoit plus les notifications du compte', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockResolvedValue(true)
    const { auth } = renderLayout(api)
    await deviceStatus()
    await user.click(screen.getAllByRole('button', { name: 'Se déconnecter' })[0]!)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(api.push.deleteSubscription).toHaveBeenCalledWith(DEVICE.endpoint)
  })

  it('se déconnecte même si l’abonnement ne peut pas être retiré', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.deleteSubscription.mockRejectedValueOnce(new AppError('Hors ligne'))
    const { auth } = renderLayout(api)
    await deviceStatus()
    await user.click(screen.getAllByRole('button', { name: 'Se déconnecter' })[0]!)
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })

  it('considère l’appareil non abonné si la vérification échoue', async () => {
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderLayout(api)
    expect(await screen.findByRole('region', { name: 'Activer les notifications' })).toBeInTheDocument()
  })
})
