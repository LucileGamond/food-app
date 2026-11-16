import { createHandler, type Deps, type DeviceSubscription } from './handler.ts'
import { buildMealsMessage, notifyMeals, type MealReminder, type MealsNotifyDeps } from './meals.ts'

const NOW = Date.parse('2026-11-16T20:15:00Z') // 21 h 15 à Paris
const DAY = '2026-11-16'

describe('message du soir', () => {
  it('rien noté : tous les repas et le plan', () => {
    expect(buildMealsMessage({ profileId: 'lucile', missing: 3, planEmpty: true }, DAY)).toEqual({
      title: 'Tes repas du jour 🥗',
      body: 'Végé ou non ? Note tes repas du jour.\nRien de noté dans ton plan alimentaire aujourd’hui.',
      url: '/plan?profil=lucile&jour=2026-11-16',
      tag: 'repas-2026-11-16',
    })
  })

  it('le nombre de repas restants, au singulier comme au pluriel', () => {
    expect(buildMealsMessage({ profileId: 'lucile', missing: 1, planEmpty: false }, DAY)?.body).toBe('Végé ou non ? Il reste 1 repas à noter.')
    expect(buildMealsMessage({ profileId: 'lucile', missing: 2, planEmpty: false }, DAY)?.body).toBe('Végé ou non ? Il reste 2 repas à noter.')
  })

  it('journal complet : seulement le plan ; tout rempli : pas de notification', () => {
    expect(buildMealsMessage({ profileId: 'eric', missing: 0, planEmpty: true }, DAY)?.body).toBe('Rien de noté dans ton plan alimentaire aujourd’hui.')
    expect(buildMealsMessage({ profileId: 'eric', missing: 0, planEmpty: false }, DAY)).toBeNull()
  })
})

const device = (id: string): DeviceSubscription => ({ id, endpoint: `https://push.test/${id}`, p256dh: 'k', auth: 'a' })

function setup(reminders: MealReminder[], subscriptions: Record<string, DeviceSubscription[]>) {
  return {
    now: () => NOW,
    claimMealReminders: vi.fn(async () => reminders),
    loadProfileSubscriptions: vi.fn(async (profile: string) => subscriptions[profile] ?? []),
    send: vi.fn<Deps['send']>(async () => 'sent'),
    deleteSubscriptions: vi.fn(async () => undefined),
  } satisfies MealsNotifyDeps
}

describe('envoi du rappel', () => {
  it('à chacune des personnes réservées, sur tous ses appareils, au jour de Paris', async () => {
    const deps = setup(
      [
        { profileId: 'lucile', missing: 2, planEmpty: false },
        { profileId: 'eric', missing: 0, planEmpty: false },
      ],
      { lucile: [device('l1'), device('l2')], eric: [device('e1')] },
    )
    expect(await notifyMeals(deps)).toEqual({ groups: 1, sent: 2, failed: 0, removed: 0 })
    expect(deps.send).toHaveBeenCalledWith(device('l1'), expect.objectContaining({ tag: 'repas-2026-11-16' }))
  })

  it('abonnement expiré : retiré', async () => {
    const deps = setup([{ profileId: 'lucile', missing: 3, planEmpty: true }], { lucile: [device('l1')] })
    deps.send.mockResolvedValueOnce('gone')
    expect(await notifyMeals(deps)).toEqual({ groups: 1, sent: 0, failed: 0, removed: 1 })
    expect(deps.deleteSubscriptions).toHaveBeenCalledWith(['l1'])
  })

  it('branché sur la tâche « meals » du handler', async () => {
    const job = vi.fn(async () => ({ groups: 1, sent: 1, failed: 0, removed: 0 }))
    const handle = createHandler({ secret: 'secret-cron', log: vi.fn() } as unknown as Deps, { meals: job })
    const response = await handle(new Request('https://fn.test', { method: 'POST', headers: { 'x-cron-secret': 'secret-cron' }, body: '{"job":"meals"}' }))
    expect(await response.json()).toEqual({ groups: 1, sent: 1, failed: 0, removed: 0 })
    expect(job).toHaveBeenCalledTimes(1)
  })
})
