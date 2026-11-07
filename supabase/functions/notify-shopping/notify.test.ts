import { createHandler, notifyHydration, notifyPending, notifyPlants, parisHour, sameSecret, type Deps, type DeviceSubscription } from './handler.ts'
import { CLEANUP_MIN_AGE_MS, orphanFiles, type CleanedBucket, type StoredFile } from './cleanup.ts'
import { buildHydrationMessage, drinkButtons, liters, type HydrationReminder } from './hydration.ts'
import { buildPlantsMessage, duePlants, wateredButton, wateringsOf, type PlantData } from './plants.ts'
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

function setup(
  events: ShoppingEvent[],
  subscriptions: Record<string, DeviceSubscription[]> = {},
  reserved = new Set<number>(),
  reminders: HydrationReminder[] = [],
  plants: PlantData[] = [],
  plantRecipients: string[] = [],
) {
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
    loadProfileSubscriptions: vi.fn(async (profile: string) => subscriptions[profile] ?? []),
    claimHydrationReminders: vi.fn(async () => reminders),
    loadActivePlants: vi.fn(async () => plants),
    claimPlantReminders: vi.fn(async () => plantRecipients),
    createActionToken: vi.fn<Deps['createActionToken']>(async (profileId) => `jeton-${profileId}`),
    listFiles: vi.fn(async (_bucket: CleanedBucket): Promise<StoredFile[]> => []),
    referencedFiles: vi.fn(async (_bucket: CleanedBucket) => [] as string[]),
    removeFiles: vi.fn(async (_bucket: CleanedBucket, _paths: string[]) => undefined),
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

describe('rappels d’hydratation', () => {
  it('écrit le message selon ce qui a été bu', () => {
    expect(liters(1500)).toBe('1,5 L')
    expect(liters(200)).toBe('0,2 L')
    expect(buildHydrationMessage({ profile_id: 'lucile', drunk_ml: 0, goal_ml: 1500 })).toEqual({
      title: 'Pense à boire 💧',
      body: 'Rien bu depuis ce matin : un verre d’eau ? Objectif 1,5 L.',
      url: '/hydratation',
      tag: 'hydration',
    })
    expect(buildHydrationMessage({ profile_id: 'lucile', drunk_ml: 530, goal_ml: 2000 }).body).toBe('4 h sans boire. 0,53 L sur 2 L aujourd’hui.')
    expect(liters(1650)).toBe('1,65 L')
  })

  it('envoie aux appareils de la personne concernée seulement, et retire les expirés', async () => {
    const deps = setup([], { lucile: [device('tel'), device('pc')], eric: [device('tel-eric')] }, new Set(), [{ profile_id: 'lucile', drunk_ml: 200, goal_ml: 1500 }])
    deps.send.mockResolvedValueOnce('sent').mockResolvedValueOnce('gone')
    expect(await notifyHydration(deps)).toEqual({ groups: 1, sent: 1, failed: 0, removed: 1 })
    expect(deps.loadProfileSubscriptions).toHaveBeenCalledWith('lucile')
    expect(deps.send.mock.calls.map(([sub]) => sub.id)).toEqual(['tel', 'pc'])
    expect(deps.deleteSubscriptions).toHaveBeenCalledWith(['pc'])
    expect(deps.loadPendingEvents).not.toHaveBeenCalled()
  })

  it('propose les deux premiers contenants en boutons, avec un jeton', async () => {
    const reminder = {
      profile_id: 'lucile',
      drunk_ml: 0,
      goal_ml: 1500,
      containers: [
        { name: 'Gourde', ml: 750 },
        { name: 'Verre', ml: 750 },
        { name: 'Tasse', ml: 250 },
      ],
    }
    expect(drinkButtons(reminder)).toEqual([
      { action: 'drink:750', title: 'Gourde · 75 cl' },
      { action: 'drink:250', title: 'Tasse · 25 cl' },
    ])
    expect(drinkButtons({ profile_id: 'lucile', drunk_ml: 0, goal_ml: 1500 })).toEqual([])

    const deps = setup([], { lucile: [device('tel')] }, new Set(), [reminder])
    await notifyHydration(deps)
    expect(deps.createActionToken).toHaveBeenCalledWith('lucile', 'water', { volumes: [750, 250] })
    expect(deps.send.mock.calls[0]![1]).toMatchObject({ token: 'jeton-lucile', actions: drinkButtons(reminder) })
  })

  it('envoie la notification sans boutons si le jeton ne peut pas être créé', async () => {
    const deps = setup([], { lucile: [device('tel')] }, new Set(), [{ profile_id: 'lucile', drunk_ml: 0, goal_ml: 1500, containers: [{ name: 'Verre', ml: 200 }] }])
    deps.createActionToken.mockRejectedValueOnce(new Error('base indisponible'))
    expect(await notifyHydration(deps)).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(deps.send.mock.calls[0]![1].actions).toBeUndefined()
    expect(deps.log).toHaveBeenCalledWith('jeton de notification impossible', expect.anything())
  })

  it('compte les échecs et ne fait rien sans rappel dû', async () => {
    const deps = setup([], { lucile: [device('tel')] }, new Set(), [{ profile_id: 'lucile', drunk_ml: 0, goal_ml: 1500 }])
    deps.send.mockResolvedValueOnce('failed')
    expect(await notifyHydration(deps)).toEqual({ groups: 1, sent: 0, failed: 1, removed: 0 })
    expect(await notifyHydration(setup([]))).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
  })
})

// Samedi 24 octobre ; la règle hebdomadaire tombe les jeudis (22, 29 oct.).
const weekly = { id: 'r', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], firstWateringOn: '2026-10-01', intervalCount: 1, intervalUnit: 'week' as const, amountMl: 250 }
const PLANTS: PlantData[] = [
  { id: 'p-monstera', name: 'Monstera', rules: [weekly], events: [] }, // en retard depuis le 22
  { id: 'p-basilic', name: 'Basilic', rules: [{ ...weekly, id: 'r2', firstWateringOn: '2026-10-24', intervalUnit: 'day', amountMl: 1500 }], events: [] },
  { id: 'p-cactus', name: 'Cactus', rules: [weekly], events: [{ id: 'e', scheduledOn: '2026-10-22', wateredOn: '2026-10-22' }] },
]
const MORNING = Date.parse('2026-10-24T06:30:00Z') // 8 h 30 à Paris

describe('rappels d’arrosage', () => {
  it('plantes à arroser, les plus en retard d’abord', () => {
    expect(duePlants(PLANTS, '2026-10-24')).toEqual([
      { plantId: 'p-monstera', name: 'Monstera', ruleId: 'r', scheduledOn: '2026-10-22', amountMl: 250, overdueDays: 2 },
      { plantId: 'p-basilic', name: 'Basilic', ruleId: 'r2', scheduledOn: '2026-10-24', amountMl: 1500, overdueDays: 0 },
    ])
  })

  it('résume les plantes dans la notification', () => {
    expect(buildPlantsMessage(duePlants(PLANTS, '2026-10-24'), '2026-10-24')).toEqual({
      title: '2 plantes à arroser 🪴',
      body: 'Monstera (250 ml), Basilic (1,5 L)',
      url: '/plantes',
      tag: 'plants-2026-10-24',
    })
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ plantId: name, name, ruleId: 'r', scheduledOn: '2026-10-24', amountMl: 100, overdueDays: 0 }))
    expect(buildPlantsMessage(many, '2026-10-24').body).toBe('A (100 ml), B (100 ml), C (100 ml), D (100 ml) et 2 autres')
    expect(buildPlantsMessage(many.slice(0, 5), '2026-10-24').body).toMatch(/ et 1 autre$/)
    expect(buildPlantsMessage(many.slice(0, 1), '2026-10-24').title).toBe('1 plante à arroser 🪴')
  })

  it('envoie le même résumé aux personnes réservées, sur leurs appareils', async () => {
    const deps = { ...setup([], { lucile: [device('tel'), device('pc')], eric: [device('tel-eric')] }, new Set(), [], PLANTS, ['lucile', 'eric']), now: () => MORNING }
    expect(await notifyPlants(deps)).toEqual({ groups: 2, sent: 3, failed: 0, removed: 0 })
    expect(deps.send.mock.calls.map(([sub, payload]) => `${sub.id} ${payload.tag}`)).toEqual(['tel plants-2026-10-24', 'pc plants-2026-10-24', 'tel-eric plants-2026-10-24'])
  })

  it('ajoute à chaque personne le bouton « C’est arrosé » et son propre jeton', async () => {
    const due = duePlants(PLANTS, '2026-10-24')
    expect(wateredButton(due)).toEqual({ action: 'watered', title: 'Tout est arrosé' })
    expect(wateredButton(due.slice(0, 1)).title).toBe('C’est arrosé')
    const deps = { ...setup([], { lucile: [device('tel')], eric: [device('tel-eric')] }, new Set(), [], PLANTS, ['lucile', 'eric']), now: () => MORNING }
    await notifyPlants(deps)
    expect(deps.createActionToken).toHaveBeenCalledWith('lucile', 'plants', { waterings: wateringsOf(due) })
    expect(wateringsOf(due)[0]).toEqual({ plant_id: 'p-monstera', rule_id: 'r', scheduled_on: '2026-10-22', amount_ml: 250 })
    expect(deps.send.mock.calls.map(([, payload]) => payload.token)).toEqual(['jeton-lucile', 'jeton-eric'])
    expect(deps.send.mock.calls[0]![1].actions).toEqual([{ action: 'watered', title: 'Tout est arrosé' }])
  })

  it('rien à arroser : personne n’est réservé (une plante à arroser plus tard dans la journée sera rappelée)', async () => {
    const deps = { ...setup([], { lucile: [device('tel')] }, new Set(), [], [PLANTS[2]!], ['lucile']), now: () => MORNING }
    expect(await notifyPlants(deps)).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
    expect(deps.claimPlantReminders).not.toHaveBeenCalled()
  })

  it('tâche « plants » du handler', async () => {
    const deps = { ...setup([], { lucile: [device('tel')] }, new Set(), [], PLANTS, ['lucile']), now: () => MORNING }
    const request = new Request('https://fn.local/notify-shopping', { method: 'POST', headers: { 'x-cron-secret': 'secret-cron' }, body: JSON.stringify({ job: 'plants' }) })
    expect(await (await createHandler(deps)(request)).json()).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(deps.loadPendingEvents).not.toHaveBeenCalled()
  })
})

describe('nuit', () => {
  it('pas de notification de courses entre 22 h et 8 h (heure de Paris) : les modifications attendent', async () => {
    expect(parisHour(Date.parse('2026-11-10T21:30:00Z'))).toBe(22)
    expect(parisHour(Date.parse('2026-07-10T05:59:00Z'))).toBe(7)
    const night = { ...setup([event('ADDED', 'Farine')], { lucile: [device('a')] }), now: () => Date.parse('2026-11-10T22:00:00Z') }
    expect(await notifyPending(night)).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
    expect(night.loadPendingEvents).not.toHaveBeenCalled()
    expect(night.reserveEvents).not.toHaveBeenCalled()
  })
})

describe('ménage des fichiers inutilisés', () => {
  const post = (secret: string, body: unknown) =>
    new Request('https://fn.local/notify-shopping', { method: 'POST', headers: { 'x-cron-secret': secret }, body: JSON.stringify(body) })
  const file = (path: string, hoursAgo: number | null): StoredFile => ({ path, createdAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * 3600_000).toISOString() })

  it('ne supprime que les fichiers inutilisés depuis plus d’un jour', () => {
    const files = [file('pending/a.jpg', 30), file('pending/b.jpg', 30), file('pending/c.jpg', 2), file('pending/d.jpg', null)]
    expect(orphanFiles(files, ['pending/b.jpg'], NOW)).toEqual(['pending/a.jpg'])
    expect(orphanFiles([file('pending/e.jpg', 24)], [], NOW, CLEANUP_MIN_AGE_MS)).toEqual(['pending/e.jpg'])
  })

  it('supprime par paquets, photos et PDF, et rend compte, sur demande de la tâche de nuit', async () => {
    const deps = setup([])
    const files: Record<CleanedBucket, StoredFile[]> = {
      'recipe-photos': Array.from({ length: 150 }, (_, i) => file(i < 100 ? `pending/${i}.jpg` : `r1/${i}.jpg`, 48)),
      'knit-patterns': [file('u1/a.pdf', 48), file('u1/b.pdf', 48)],
      'knit-charts': [file('u1/c.jpg', 48), file('u1/d.jpg', 48)],
      'plant-photos': [file('p1/a.jpg', 48), file('p2/b.jpg', 48)],
    }
    const used: Record<CleanedBucket, string[]> = { 'recipe-photos': ['pending/0.jpg', 'r1/100.jpg'], 'knit-patterns': ['u1/a.pdf'], 'knit-charts': ['u1/c.jpg'], 'plant-photos': ['p1/a.jpg'] }
    deps.listFiles.mockImplementation(async (bucket) => files[bucket])
    deps.referencedFiles.mockImplementation(async (bucket) => used[bucket])
    const response = await createHandler(deps)(post('secret-cron', { job: 'cleanup' }))
    expect(await response.json()).toEqual({ removed: 151 })
    expect(deps.removeFiles.mock.calls.map(([bucket, paths]) => [bucket, paths.length])).toEqual([
      ['recipe-photos', 100],
      ['recipe-photos', 48],
      ['knit-patterns', 1],
      ['knit-charts', 1],
      ['plant-photos', 1],
    ])
    expect(deps.removeFiles).toHaveBeenCalledWith('knit-patterns', ['u1/b.pdf'])
    expect(deps.removeFiles).toHaveBeenCalledWith('knit-charts', ['u1/d.jpg'])
    expect(deps.removeFiles).toHaveBeenLastCalledWith('plant-photos', ['p2/b.jpg'])
    expect(deps.log).toHaveBeenCalledWith('fichiers inutilisés supprimés', { removed: 151 })
    expect(deps.loadPendingEvents).not.toHaveBeenCalled()

    const nothing = setup([])
    expect(await (await createHandler(nothing)(post('secret-cron', { job: 'cleanup' }))).json()).toEqual({ removed: 0 })
    expect(nothing.removeFiles).not.toHaveBeenCalled()
  })
})

describe('handler', () => {
  const post = (secret?: string, body?: unknown) =>
    new Request('https://fn.local/notify-shopping', {
      method: 'POST',
      headers: secret ? { 'x-cron-secret': secret } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  it('choisit la tâche d’après le corps de la requête', async () => {
    const deps = setup([event('ADDED', 'Farine')], { lucile: [device('a')] }, new Set(), [{ profile_id: 'lucile', drunk_ml: 0, goal_ml: 1500 }])
    const response = await createHandler(deps)(post('secret-cron', { job: 'hydration' }))
    expect(await response.json()).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(deps.claimHydrationReminders).toHaveBeenCalled()
    expect(deps.loadPendingEvents).not.toHaveBeenCalled()
    expect(deps.send.mock.calls[0]![1]).toMatchObject({ tag: 'hydration' })
  })

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
