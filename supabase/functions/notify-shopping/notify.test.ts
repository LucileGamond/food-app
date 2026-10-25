import { createHandler, notifyPending, type Deps, type DeviceSubscription } from './handler.ts'
import { buildShoppingMessage, joinFr, QUIET_MS, readyGroups, type ShoppingEvent, type ShoppingEventKind } from './message.ts'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString()

let seq = 0
function event(kind: ShoppingEventKind, item: string, overrides: Partial<ShoppingEvent> = {}): ShoppingEvent {
  return {
    id: ++seq,
    list_id: 'l1',
    list_name: 'Courses du 25 oct.',
    actor_id: 'eric',
    actor_name: 'Eric',
    kind,
    item_name: item,
    created_at: minutesAgo(5),
    ...overrides,
  }
}

describe('regroupement', () => {
  it('attend 2 minutes sans modification pour chaque liste et chaque auteur', () => {
    const events = [
      event('ADDED', 'Farine', { created_at: minutesAgo(10) }),
      event('ADDED', 'Lait', { created_at: minutesAgo(1) }), // Eric écrit encore dans l1
      event('ADDED', 'Pain', { list_id: 'l2', list_name: 'Apéro' }),
      event('CHECKED', 'Pommes', { actor_id: 'lucile', actor_name: 'Lucile' }),
    ]
    const groups = readyGroups(events, NOW)
    expect(groups.map((g) => [g.list_id, g.actor_id, g.events.length])).toEqual([
      ['l2', 'eric', 1],
      ['l1', 'lucile', 1],
    ])
    expect(readyGroups(events, NOW + QUIET_MS)).toHaveLength(3)
  })
})

describe('message', () => {
  it('liste les noms quand il y en a peu, compte sinon', () => {
    expect(joinFr([])).toBe('')
    expect(joinFr(['a'])).toBe('a')
    expect(joinFr(['a', 'b', 'c'])).toBe('a, b et c')

    const [group] = readyGroups(
      [
        event('ADDED', 'Farine'),
        event('ADDED', 'Lait'),
        event('UPDATED', 'Lait'),
        ...['Pain', 'Œufs', 'Beurre', 'Sel'].map((name) => event('CHECKED', name)),
        event('REMOVED', 'Chips'),
      ],
      NOW,
    )
    expect(buildShoppingMessage(group!)).toEqual({
      title: 'Courses du 25 oct.',
      body: 'Eric a ajouté Farine et Lait, coché 4 articles, modifié Lait et retiré Chips',
      url: '/courses/l1',
      tag: 'shopping-l1',
    })
  })

  it('compte chaque article une fois par type de modification', () => {
    const [group] = readyGroups([event('CHECKED', 'Pain'), event('UNCHECKED', 'Pain'), event('CHECKED', 'Pain')], NOW)
    expect(buildShoppingMessage(group!).body).toBe('Eric a coché Pain et décoché Pain')
  })
})

function setup(events: ShoppingEvent[], subscriptions: Record<string, DeviceSubscription[]> = {}) {
  const deps = {
    secret: 'secret-cron',
    now: () => NOW,
    loadPendingEvents: vi.fn(async () => events),
    loadSubscriptions: vi.fn(async (exclude: string) => Object.entries(subscriptions).flatMap(([profile, list]) => (profile === exclude ? [] : list))),
    send: vi.fn<Deps['send']>(async () => 'sent'),
    deleteSubscriptions: vi.fn(async () => undefined),
    markNotified: vi.fn(async () => undefined),
    purgeOldEvents: vi.fn(async () => undefined),
    log: vi.fn(),
  }
  return deps
}

const device = (id: string): DeviceSubscription => ({ id, endpoint: `https://push.exemple/${id}`, p256dh: 'k', auth: 'a' })

describe('envoi', () => {
  it('prévient les appareils des autres, jamais ceux de l’auteur', async () => {
    const deps = setup([event('ADDED', 'Farine')], { eric: [device('tel-eric')], lucile: [device('tel-lucile'), device('pc-lucile')] })
    expect(await notifyPending(deps)).toEqual({ groups: 1, sent: 2, failed: 0, removed: 0 })
    expect(deps.loadSubscriptions).toHaveBeenCalledWith('eric')
    expect(deps.send.mock.calls.map(([sub]) => sub.id)).toEqual(['tel-lucile', 'pc-lucile'])
    expect(deps.send.mock.calls[0]![1]).toMatchObject({ body: 'Eric a ajouté Farine' })
    expect(deps.markNotified).toHaveBeenCalledWith([seq])
    expect(deps.purgeOldEvents).toHaveBeenCalled()
  })

  it('supprime les abonnements expirés et marque les événements même en cas d’échec', async () => {
    const deps = setup([event('ADDED', 'Farine')], { lucile: [device('a'), device('b'), device('c')] })
    deps.send.mockResolvedValueOnce('gone').mockResolvedValueOnce('failed').mockResolvedValueOnce('sent')
    expect(await notifyPending(deps)).toEqual({ groups: 1, sent: 1, failed: 1, removed: 1 })
    expect(deps.deleteSubscriptions).toHaveBeenCalledWith(['a'])
    expect(deps.markNotified).toHaveBeenCalled()
  })

  it('ne fait rien tant que l’autre est en train d’écrire', async () => {
    const deps = setup([event('ADDED', 'Farine', { created_at: minutesAgo(1) })], { lucile: [device('a')] })
    expect(await notifyPending(deps)).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.markNotified).not.toHaveBeenCalled()
    expect(deps.deleteSubscriptions).not.toHaveBeenCalled()
  })
})

describe('handler', () => {
  const post = (secret?: string) => new Request('https://fn.local/notify-shopping', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} })

  it('exige le secret partagé avec la tâche planifiée', async () => {
    const deps = setup([])
    const handle = createHandler(deps)
    expect((await handle(post())).status).toBe(401)
    expect((await handle(post('mauvais'))).status).toBe(401)
    expect((await createHandler({ ...deps, secret: undefined })(post('secret-cron'))).status).toBe(401)
    expect((await handle(new Request('https://fn.local/notify-shopping'))).status).toBe(405)
    expect(deps.loadPendingEvents).not.toHaveBeenCalled()
  })

  it('renvoie le compte rendu, et 500 en cas d’erreur', async () => {
    const deps = setup([event('ADDED', 'Farine')], { lucile: [device('a')] })
    const response = await createHandler(deps)(post('secret-cron'))
    expect(await response.json()).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(deps.log).toHaveBeenCalledWith('notifications envoyées', expect.objectContaining({ sent: 1 }))

    deps.loadPendingEvents.mockRejectedValueOnce(new Error('base indisponible'))
    const failed = await createHandler(deps)(post('secret-cron'))
    expect(failed.status).toBe(500)
    expect(deps.log).toHaveBeenCalledWith('notifications en erreur', expect.anything())
  })
})
