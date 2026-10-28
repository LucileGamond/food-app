import { createHandler, notifyPending, sameSecret, type Deps, type DeviceSubscription } from './handler.ts'
import { buildShoppingMessage, joinFr, QUIET_MS, readyGroups, shorten, type ShoppingEvent, type ShoppingEventKind } from './message.ts'

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

function setup(events: ShoppingEvent[], subscriptions: Record<string, DeviceSubscription[]> = {}, reserved = new Set<number>()) {
  const deps = {
    secret: 'secret-cron',
    now: () => NOW,
    loadPendingEvents: vi.fn(async () => events),
    loadSubscriptions: vi.fn(async (exclude: string) => Object.entries(subscriptions).flatMap(([profile, list]) => (profile === exclude ? [] : list))),
    send: vi.fn<Deps['send']>(async () => 'sent'),
    deleteSubscriptions: vi.fn(async () => undefined),
    // Base simulée : un événement n'est réservé qu'une fois, même par deux exécutions.
    reserveEvents: vi.fn(async (ids: number[]) => ids.filter((id) => !reserved.has(id) && Boolean(reserved.add(id)))),
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
    expect(deps.reserveEvents).toHaveBeenCalledWith([seq])
    expect(deps.purgeOldEvents).toHaveBeenCalled()
  })

  it('supprime les abonnements expirés et marque les événements même en cas d’échec', async () => {
    const deps = setup([event('ADDED', 'Farine')], { lucile: [device('a'), device('b'), device('c')] })
    deps.send.mockResolvedValueOnce('gone').mockResolvedValueOnce('failed').mockResolvedValueOnce('sent')
    expect(await notifyPending(deps)).toEqual({ groups: 1, sent: 1, failed: 1, removed: 1 })
    expect(deps.deleteSubscriptions).toHaveBeenCalledWith(['a'])
    expect(deps.reserveEvents).toHaveBeenCalled()
  })

  it('réserve les événements avant l’envoi : deux exécutions simultanées n’envoient qu’une fois', async () => {
    const events = [event('ADDED', 'Farine'), event('ADDED', 'Pain', { list_id: 'l2', list_name: 'Apéro' })]
    const reserved = new Set<number>()
    const first = setup(events, { lucile: [device('a')] }, reserved)
    const second = setup(events, { lucile: [device('a')] }, reserved)
    const [a, b] = await Promise.all([notifyPending(first), notifyPending(second)])
    expect(a.sent + b.sent).toBe(2)
    expect(first.send.mock.calls.length + second.send.mock.calls.length).toBe(2)
    expect(a.groups + b.groups).toBe(2)
  })

  it('n’annonce que les événements réservés par cette exécution', async () => {
    const farine = event('ADDED', 'Farine')
    const lait = event('ADDED', 'Lait')
    const deps = setup([farine, lait], { lucile: [device('a')] }, new Set([farine.id]))
    expect(await notifyPending(deps)).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(deps.send.mock.calls[0]![1]).toMatchObject({ body: 'Eric a ajouté Lait' })
  })

  it('n’essaie plus un appareil expiré, et le retire même si un groupe échoue ensuite', async () => {
    const events = [event('ADDED', 'Farine'), event('ADDED', 'Pain', { list_id: 'l2', list_name: 'Apéro' }), event('ADDED', 'Vin', { list_id: 'l3', list_name: 'Fête' })]
    const deps = setup(events, { lucile: [device('a')] })
    deps.send.mockResolvedValueOnce('gone')
    deps.reserveEvents.mockResolvedValueOnce([events[0]!.id]).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(notifyPending(deps)).rejects.toThrow('base indisponible')
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.deleteSubscriptions).toHaveBeenCalledWith(['a'])
  })

  it('ne fait rien tant que l’autre est en train d’écrire', async () => {
    const deps = setup([event('ADDED', 'Farine', { created_at: minutesAgo(1) })], { lucile: [device('a')] })
    expect(await notifyPending(deps)).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.reserveEvents).not.toHaveBeenCalled()
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

describe('robustesse', () => {
  it('compare le secret en entier', () => {
    expect(sameSecret('secret', 'secret')).toBe(true)
    expect(sameSecret('secreT', 'secret')).toBe(false)
    expect(sameSecret('secret-plus-long', 'secret')).toBe(false)
    expect(sameSecret(null, 'secret')).toBe(false)
  })

  it('borne la taille du message', () => {
    expect(shorten('abc', 5)).toBe('abc')
    expect(shorten('abcdefgh', 5)).toBe('abcd…')
    const long = 'x'.repeat(120)
    const message = buildShoppingMessage({
      list_id: 'l1',
      list_name: 'L'.repeat(100),
      actor_id: 'eric',
      actor_name: 'Eric',
      events: [event('ADDED', long), event('CHECKED', long), event('REMOVED', long), event('UPDATED', long), event('UNCHECKED', long)],
    })
    expect(message.title.length).toBeLessThanOrEqual(80)
    expect(message.body.length).toBeLessThanOrEqual(300)
  })
})
