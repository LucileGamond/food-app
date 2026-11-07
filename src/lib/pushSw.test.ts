import code from '../../public/push-sw.js?raw'
import { PUSH_CONFIG_CACHE, PUSH_CONFIG_KEY, rememberPushConfig } from './push'

const ORIGIN = 'https://life.exemple'
const BASE = 'https://base.exemple'

interface Shown {
  title: string
  options: { tag?: string; actions?: unknown[]; data?: { url: string; token?: string }; silent?: boolean; body?: string }
  close: () => void
}

/** Charge public/push-sw.js avec un faux service worker, un faux Cache API et un faux fetch. */
function loadWorker({ config = true, response = new Response(JSON.stringify({ kind: 'water', volume_ml: 200, drunk_ml: 1200, goal_ml: 1500 })) } = {}) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const shown: Shown[] = []
  const opened: string[] = []
  const store = new Map<string, Response>()
  if (config) store.set(PUSH_CONFIG_KEY, new Response(JSON.stringify({ url: BASE, key: 'cle-publique' })))
  const caches = { open: async (name: string) => ({ match: async (key: string) => (name === PUSH_CONFIG_CACHE ? store.get(key)?.clone() : undefined) }) }
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response)
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] ??= []).push(listener),
    registration: {
      showNotification: async (title: string, options: Shown['options']) => {
        const notification: Shown = { title, options, close: () => shown.splice(shown.indexOf(notification), 1) }
        // Même étiquette : la nouvelle notification remplace l'ancienne.
        const same = shown.findIndex((n) => n.options.tag === options.tag)
        if (same >= 0) shown.splice(same, 1)
        shown.push(notification)
      },
      getNotifications: async ({ tag }: { tag: string }) => shown.filter((n) => n.options.tag === tag),
    },
    clients: { matchAll: async () => [], openWindow: async (url: string) => void opened.push(url) },
  }
  new Function('self', 'caches', 'fetch', code)(self, caches, fetch)

  async function dispatch(type: string, event: object) {
    let pending: Promise<unknown> = Promise.resolve()
    for (const listener of listeners[type] ?? []) listener({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) })
    return pending
  }
  const push = (data: unknown) => dispatch('push', { data: { json: () => data, text: () => JSON.stringify(data) } })
  const click = (notification: Shown, action = '') => dispatch('notificationclick', { notification: { ...notification.options, tag: notification.options.tag, close: notification.close }, action })
  return { push, click, shown, opened, fetch }
}

const WATER = { title: 'Pense à boire 💧', body: '4 h sans boire.', url: '/hydratation', tag: 'hydration', token: 'jeton', actions: [{ action: 'drink:200', title: 'Petit verre · 20 cl' }] }

describe('notifications (service worker)', () => {
  afterEach(() => vi.useRealTimers())

  it('affiche les boutons seulement avec un jeton', async () => {
    const worker = loadWorker()
    await worker.push(WATER)
    expect(worker.shown[0]!.options.actions).toEqual(WATER.actions)
    expect(worker.shown[0]!.options.data).toEqual({ url: '/hydratation', token: 'jeton' })
    await worker.push({ ...WATER, tag: 'autre', token: undefined })
    expect(worker.shown[1]!.options.actions).toEqual([])
  })

  it('un bouton fait le geste sans ouvrir l’application, puis confirme brièvement', async () => {
    vi.useFakeTimers()
    const worker = loadWorker()
    await worker.push(WATER)
    const done = worker.click(worker.shown[0]!, 'drink:200')
    await vi.advanceTimersByTimeAsync(100)
    const [url, init] = worker.fetch.mock.calls[0]!
    expect(url).toBe(`${BASE}/rest/v1/rpc/run_notification_action`)
    expect(init.headers).toMatchObject({ apikey: 'cle-publique', authorization: 'Bearer cle-publique' })
    expect(JSON.parse(init.body as string)).toEqual({ p_token: 'jeton', p_action: 'drink:200' })
    expect(worker.shown.map((n) => [n.title, n.options.body, n.options.silent])).toEqual([['Noté : 20 cl 💧', '1,2 L sur 1,5 L aujourd’hui.', true]])
    await vi.advanceTimersByTimeAsync(4000)
    await done
    expect(worker.shown).toEqual([])
    expect(worker.opened).toEqual([])
  })

  it('confirme l’arrosage, ou signale qu’il était déjà noté', async () => {
    vi.useFakeTimers()
    for (const [count, title, body] of [
      [2, 'Arrosage noté 🪴', '2 plantes arrosées.'],
      [1, 'Arrosage noté 🪴', '1 plante arrosée.'],
      [0, 'Déjà arrosé 🪴', 'Quelqu’un l’a noté entre-temps.'],
    ] as const) {
      const worker = loadWorker({ response: new Response(JSON.stringify({ kind: 'plants', count })) })
      await worker.push({ ...WATER, tag: 'plants', url: '/plantes', actions: [{ action: 'watered', title: 'Tout est arrosé' }] })
      void worker.click(worker.shown[0]!, 'watered')
      await vi.advanceTimersByTimeAsync(100)
      expect(worker.shown.map((n) => [n.title, n.options.body])).toEqual([[title, body]])
    }
  })

  it('ouvre la page si le geste échoue (jeton expiré, pas de configuration)', async () => {
    const refused = loadWorker({ response: new Response('{}', { status: 400 }) })
    await refused.push(WATER)
    await refused.click(refused.shown[0]!, 'drink:200')
    expect(refused.opened).toEqual([`${ORIGIN}/hydratation`])

    const unconfigured = loadWorker({ config: false })
    await unconfigured.push(WATER)
    await unconfigured.click(unconfigured.shown[0]!, 'drink:200')
    expect(unconfigured.fetch).not.toHaveBeenCalled()
    expect(unconfigured.opened).toEqual([`${ORIGIN}/hydratation`])
  })

  it('un clic sur la notification ouvre sa page, jamais une adresse externe', async () => {
    const worker = loadWorker()
    await worker.push(WATER)
    await worker.click(worker.shown[0]!)
    expect(worker.fetch).not.toHaveBeenCalled()
    expect(worker.opened).toEqual([`${ORIGIN}/hydratation`])
    await worker.push({ title: 'Courses', url: 'https://ailleurs.exemple/piege', tag: 'shopping' })
    await worker.click(worker.shown.at(-1)!)
    expect(worker.opened.at(-1)).toBe(`${ORIGIN}/courses`)
  })
})

describe('rememberPushConfig', () => {
  it('range l’adresse et la clé publique de la base pour le service worker', async () => {
    const store = new Map<string, Response>()
    vi.stubGlobal('caches', { open: async (name: string) => (name === PUSH_CONFIG_CACHE ? { put: async (key: string, r: Response) => void store.set(key, r) } : null) })
    await rememberPushConfig(BASE, 'cle')
    expect(await store.get(PUSH_CONFIG_KEY)!.json()).toEqual({ url: BASE, key: 'cle' })
    // Sans configuration, ou stockage indisponible : rien, sans erreur.
    await rememberPushConfig('', 'cle')
    vi.stubGlobal('caches', { open: async () => Promise.reject(new Error('plein')) })
    await expect(rememberPushConfig(BASE, 'cle')).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
