import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { currentDevicePush, PushPermissionError, pushRegistration, subscribeDevice, unsubscribeDevice } from '@/lib/push'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { ShoppingListsPage } from './ShoppingListsPage'

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

function setPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission })
}

function renderPage(api = fakeApi()) {
  return renderWithApp(<ShoppingListsPage today="2026-10-25" />, { api, route: '/courses', path: '/courses' })
}

describe('ShoppingListsPage — notifications', () => {
  beforeEach(() => {
    vi.mocked(pushRegistration).mockResolvedValue(registration)
    vi.mocked(currentDevicePush).mockResolvedValue(null)
    vi.mocked(subscribeDevice).mockResolvedValue(DEVICE)
    vi.mocked(unsubscribeDevice).mockResolvedValue(DEVICE.endpoint)
    setPermission('default')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('active les notifications sur cet appareil', async () => {
    const user = userEvent.setup()
    const { api } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Activer sur cet appareil' }))
    expect(subscribeDevice).toHaveBeenCalledWith(registration)
    expect(api.push.saveSubscription).toHaveBeenCalledWith({ ...DEVICE, userAgent: navigator.userAgent })
    expect(await screen.findByText('Notifications activées sur cet appareil', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument()
  })

  it('reconnaît un appareil déjà abonné et le désabonne', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockResolvedValue(true)
    renderPage(api)
    await user.click(await screen.findByRole('button', { name: 'Désactiver' }))
    expect(unsubscribeDevice).toHaveBeenCalledWith(registration)
    expect(api.push.deleteSubscription).toHaveBeenCalledWith(DEVICE.endpoint)
    expect(await screen.findByRole('button', { name: 'Activer sur cet appareil' })).toBeInTheDocument()
    expect(api.push.isSubscribed).toHaveBeenCalledWith(DEVICE.endpoint)
  })

  it('explique comment débloquer des notifications refusées', async () => {
    setPermission('denied')
    renderPage()
    expect(await screen.findByText(/Les notifications sont bloquées/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activer sur cet appareil' })).not.toBeInTheDocument()
  })

  it('passe à « bloquées » si l’autorisation est refusée au moment d’activer', async () => {
    const user = userEvent.setup()
    vi.mocked(subscribeDevice).mockRejectedValueOnce(new PushPermissionError())
    const { api } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Activer sur cet appareil' }))
    expect(await screen.findByText(/Les notifications sont bloquées/)).toBeInTheDocument()
    expect(api.push.saveSubscription).not.toHaveBeenCalled()
  })

  it('affiche l’erreur d’enregistrement ou de désabonnement', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.push.saveSubscription.mockRejectedValueOnce(new AppError("Impossible d'activer les notifications."))
    renderPage(api)
    await user.click(await screen.findByRole('button', { name: 'Activer sur cet appareil' }))
    expect(await screen.findByText("Impossible d'activer les notifications.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activer sur cet appareil' })).toBeEnabled())
  })

  it('ne propose rien sans application installée', async () => {
    vi.mocked(pushRegistration).mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/disponibles depuis l'application installée/)).toBeInTheDocument()
  })

  it('considère l’appareil non abonné si la vérification échoue', async () => {
    const api = fakeApi()
    vi.mocked(currentDevicePush).mockResolvedValue(DEVICE)
    api.push.isSubscribed.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderPage(api)
    expect(await screen.findByRole('button', { name: 'Activer sur cet appareil' })).toBeInTheDocument()
  })
})
