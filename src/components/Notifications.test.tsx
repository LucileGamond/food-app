import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { Layout } from '@/components/Layout'
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
  }
})

const DEVICE = { endpoint: 'https://push.exemple/abc', p256dh: 'cle', auth: 'secret' }
const registration = {} as ServiceWorkerRegistration

function renderLayout(api = fakeApi()) {
  return renderWithApp(<Layout />, { api, route: '/', path: '/' })
}

// La cloche existe dans la barre latérale (ordinateur) et l'en-tête (téléphone) : on prend la première.
const bell = () => screen.findAllByRole('button', { name: 'Notifications' }).then((buttons) => buttons[0]!)

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

  it('« Plus tard » masque la proposition, mémorisée pour les prochains lancements', async () => {
    const user = userEvent.setup()
    const { unmount } = renderLayout()
    const prompt = await screen.findByRole('region', { name: 'Activer les notifications' })
    await user.click(within(prompt).getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
    unmount()
    renderLayout()
    await bell()
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('la cloche permet d’activer puis de désactiver', async () => {
    const user = userEvent.setup()
    const { api } = renderLayout()
    await user.click(await bell())
    let dialog = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(dialog).toHaveTextContent('Être prévenu(e) sur cet appareil')
    await user.click(within(dialog).getByRole('button', { name: 'Activer' }))
    expect(api.push.saveSubscription).toHaveBeenCalled()
    expect(await within(dialog).findByText(/Activées sur cet appareil/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Désactiver' }))
    expect(unsubscribeDevice).toHaveBeenCalledWith(registration)
    expect(api.push.deleteSubscription).toHaveBeenCalledWith(DEVICE.endpoint)
    dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('button', { name: 'Activer' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('reconnaît un appareil déjà abonné (pas de proposition)', async () => {
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockResolvedValue(true)
    renderLayout(api)
    await bell()
    expect(api.push.isSubscribed).toHaveBeenCalledWith(DEVICE.endpoint)
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('explique comment débloquer des notifications refusées', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('Notification', { permission: 'denied' })
    renderLayout()
    await user.click(await bell())
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Bloquées par le téléphone')
    expect(within(dialog).queryByRole('button', { name: 'Activer' })).not.toBeInTheDocument()
  })

  it('passe à « bloquées » si l’autorisation est refusée au moment d’activer', async () => {
    const user = userEvent.setup()
    vi.mocked(subscribeDevice).mockRejectedValueOnce(new PushPermissionError())
    const { api } = renderLayout()
    await user.click(within(await screen.findByRole('region', { name: 'Activer les notifications' })).getByRole('button', { name: 'Activer' }))
    await user.click(await bell())
    expect(await screen.findByRole('dialog')).toHaveTextContent('Bloquées par le téléphone')
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
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Activer les notifications' })).not.toBeInTheDocument()
  })

  it('considère l’appareil non abonné si la vérification échoue', async () => {
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderLayout(api)
    expect(await screen.findByRole('region', { name: 'Activer les notifications' })).toBeInTheDocument()
  })
})
