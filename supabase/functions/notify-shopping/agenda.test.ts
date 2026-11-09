import { buildAgendaMessage, notifyAgenda, type AgendaEntry, type AgendaNotifyDeps, type AgendaRecipient } from './agenda.ts'
import { createHandler, type Deps, type DeviceSubscription } from './handler.ts'

const NOW = Date.parse('2026-11-10T06:30:00Z') // 7 h 30 à Paris
const DAY = '2026-11-10'

const entry = (title: string, ownerId: string, time: Partial<AgendaEntry> = {}): AgendaEntry =>
  ({ uid: title, title, location: null, description: null, ownerId, ownerName: ownerId === 'eric' ? 'Eric' : 'Lucile', allDay: false, startsAt: '2026-11-10T08:00:00Z', endsAt: '2026-11-10T09:00:00Z', ...time }) as AgendaEntry

const ENTRIES = [
  entry('Dentiste', 'lucile', { startsAt: '2026-11-10T13:00:00Z', endsAt: '2026-11-10T14:00:00Z' }),
  entry('Réunion', 'eric'),
  entry('Anniversaire de Léa', 'lucile', { allDay: true, startDate: DAY, endDate: '2026-11-11' } as Partial<AgendaEntry>),
  entry('Demain', 'lucile', { startsAt: '2026-11-11T08:00:00Z', endsAt: '2026-11-11T09:00:00Z' }),
]

describe('message du matin', () => {
  it('les rendez-vous du jour des agendas affichés, avec le prénom de l’autre', () => {
    expect(buildAgendaMessage(ENTRIES, DAY, { profileId: 'lucile', scope: 'all' })).toEqual({
      title: 'Aujourd’hui : 3 rendez-vous 📅',
      body: 'Journée Anniversaire de Léa\n9 h – 10 h Réunion (Eric)\n14 h – 15 h Dentiste',
      url: '/agenda',
      tag: 'agenda-2026-11-10',
    })
    expect(buildAgendaMessage(ENTRIES, DAY, { profileId: 'lucile', scope: 'other' })?.title).toBe('Aujourd’hui : 1 rendez-vous 📅')
    expect(buildAgendaMessage(ENTRIES, DAY, { profileId: 'eric', scope: 'mine' })?.body).toBe('9 h – 10 h Réunion')
  })

  it('rien à dire : pas de notification', () => {
    expect(buildAgendaMessage(ENTRIES, '2026-11-12', { profileId: 'lucile', scope: 'all' })).toBeNull()
  })

  it('au-delà de 4 rendez-vous, le nombre des suivants', () => {
    const many = Array.from({ length: 6 }, (_, i) => entry(`Rdv ${i}`, 'lucile', { startsAt: `2026-11-10T0${i}:00:00Z`, endsAt: `2026-11-10T0${i}:30:00Z` }))
    const body = buildAgendaMessage(many, DAY, { profileId: 'lucile', scope: 'mine' })!.body
    expect(body.split('\n')).toHaveLength(5)
    expect(body.endsWith('et 2 autres')).toBe(true)
    expect(buildAgendaMessage(many.slice(0, 5), DAY, { profileId: 'lucile', scope: 'mine' })!.body.endsWith('et 1 autre')).toBe(true)
  })
})

function setup(recipients: AgendaRecipient[], subscriptions: Record<string, DeviceSubscription[]>) {
  return {
    now: () => NOW,
    claimAgendaReminders: vi.fn(async () => recipients),
    loadAgendaDay: vi.fn(async () => ENTRIES),
    loadProfileSubscriptions: vi.fn(async (profile: string) => subscriptions[profile] ?? []),
    send: vi.fn<Deps['send']>(async () => 'sent'),
    deleteSubscriptions: vi.fn(async () => undefined),
  } satisfies AgendaNotifyDeps
}

const device = (id: string): DeviceSubscription => ({ id, endpoint: `https://push.test/${id}`, p256dh: 'k', auth: 'a' })

describe('envoi du résumé', () => {
  it('à chacun selon ses agendas affichés ; personne si rien de prévu', async () => {
    const deps = setup(
      [
        { profileId: 'lucile', scope: 'all' },
        { profileId: 'eric', scope: 'other' },
        { profileId: 'invite', scope: 'mine' },
      ],
      { lucile: [device('l1')], eric: [device('e1')], invite: [device('i1')] },
    )
    expect(await notifyAgenda(deps)).toEqual({ groups: 2, sent: 2, failed: 0, removed: 0 })
    expect(deps.loadAgendaDay).toHaveBeenCalledWith(DAY)
    expect(deps.send).toHaveBeenCalledWith(device('l1'), expect.objectContaining({ title: 'Aujourd’hui : 3 rendez-vous 📅' }))
    expect(deps.send).toHaveBeenCalledWith(device('e1'), expect.objectContaining({ body: 'Journée Anniversaire de Léa (Lucile)\n14 h – 15 h Dentiste (Lucile)' }))
  })

  it('personne à prévenir : rien n’est envoyé', async () => {
    const deps = setup([], {})
    expect(await notifyAgenda(deps)).toEqual({ groups: 0, sent: 0, failed: 0, removed: 0 })
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('lecture de l’agenda en échec : personne n’est réservé, le résumé repartira au passage suivant', async () => {
    const deps = setup([{ profileId: 'lucile', scope: 'all' }], { lucile: [device('l1')] })
    deps.loadAgendaDay.mockRejectedValueOnce(new Error('base indisponible'))
    await expect(notifyAgenda(deps)).rejects.toThrow('base indisponible')
    expect(deps.claimAgendaReminders).not.toHaveBeenCalled()
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('branché sur la tâche « agenda » du handler', async () => {
    const job = vi.fn(async () => ({ groups: 1, sent: 1, failed: 0, removed: 0 }))
    const handle = createHandler({ secret: 'secret-cron', log: vi.fn() } as unknown as Deps, { agenda: job })
    const response = await handle(new Request('https://fn.test', { method: 'POST', headers: { 'x-cron-secret': 'secret-cron' }, body: '{"job":"agenda"}' }))
    expect(await response.json()).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(job).toHaveBeenCalledTimes(1)
  })
})
