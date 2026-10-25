const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

async function loadPush(key: string | undefined = KEY) {
  vi.resetModules()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', key ?? '')
  return import('./push')
}

function fakeSubscription(json: PushSubscriptionJSON) {
  return { toJSON: () => json, unsubscribe: vi.fn(async () => true), endpoint: json.endpoint } as unknown as PushSubscription
}

function fakeRegistration(subscription: PushSubscription | null, subscribed = subscription) {
  return {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe: vi.fn(async () => subscribed),
    },
  } as unknown as ServiceWorkerRegistration
}

const JSON_OK = { endpoint: 'https://push.exemple/abc', keys: { p256dh: 'cle', auth: 'secret' } }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('notifications Push', () => {
  it('décode une clé base64url', async () => {
    const { base64UrlToBytes } = await loadPush()
    expect(Array.from(base64UrlToBytes('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(base64UrlToBytes('-_8'))).toEqual([251, 255])
    expect(base64UrlToBytes(KEY)).toHaveLength(65)
  })

  it('n’est pas disponible sans clé, sans service worker ou sans Push', async () => {
    let push = await loadPush('')
    expect(await push.pushRegistration()).toBeNull()

    push = await loadPush()
    // jsdom : pas de service worker
    expect(await push.pushRegistration()).toBeNull()

    const registration = fakeRegistration(null)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn(async () => registration) } })
    expect(await push.pushRegistration()).toBeNull() // pas de PushManager
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(await push.pushRegistration()).toBe(registration)
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn(async () => undefined) } })
    expect(await push.pushRegistration()).toBeNull()
  })

  it('lit l’abonnement actuel', async () => {
    const { currentDevicePush } = await loadPush()
    expect(await currentDevicePush(fakeRegistration(null))).toBeNull()
    expect(await currentDevicePush(fakeRegistration(fakeSubscription(JSON_OK)))).toEqual({ endpoint: JSON_OK.endpoint, p256dh: 'cle', auth: 'secret' })
    expect(await currentDevicePush(fakeRegistration(fakeSubscription({ endpoint: 'https://x' })))).toBeNull()
  })

  it('abonne l’appareil après autorisation', async () => {
    const { subscribeDevice, PushPermissionError } = await loadPush()
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
    const registration = fakeRegistration(null, fakeSubscription(JSON_OK))
    expect(await subscribeDevice(registration)).toEqual({ endpoint: JSON_OK.endpoint, p256dh: 'cle', auth: 'secret' })
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })

    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'denied') })
    await expect(subscribeDevice(registration)).rejects.toBeInstanceOf(PushPermissionError)

    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'granted') })
    await expect(subscribeDevice(fakeRegistration(null, fakeSubscription({ endpoint: 'https://x' })))).rejects.toThrow('Abonnement incomplet')
  })

  it('désabonne l’appareil', async () => {
    const { unsubscribeDevice } = await loadPush()
    expect(await unsubscribeDevice(fakeRegistration(null))).toBeNull()
    const subscription = fakeSubscription(JSON_OK)
    expect(await unsubscribeDevice(fakeRegistration(subscription))).toBe(JSON_OK.endpoint)
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })
})
