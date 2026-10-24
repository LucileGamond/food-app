import { AppError } from '@/api'
import { createFoodApi } from '@/api/food'
import { itemUsage, type PlanItemInput } from '@/lib/food'
import { ERIC, LUCILE, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

const yaourt: PlanItemInput = { meal: 'LUNCH', category: 'Produit laitier', name: 'Yaourt', quantity: 125, unit: 'g', allowed_occurrences: 1 }
const soja: PlanItemInput = { meal: 'DINNER', category: 'Autres', name: 'Sauce soja', quantity: null, unit: null, allowed_occurrences: 2 }

describe('food api', () => {
  it('gère le plan : ajout, modification, doublon, suppression', async () => {
    const { api } = await signedInApi()
    await api.food.savePlanItem(LUCILE.id, { ...yaourt, position: 20 })
    await api.food.savePlanItem(LUCILE.id, { ...soja, position: 10 })
    let plan = await api.food.listPlan(LUCILE.id)
    expect(plan.map((i) => i.name)).toEqual(['Sauce soja', 'Yaourt'])
    expect(plan[1]).toMatchObject({ quantity: 125, unit: 'g', allowed_occurrences: 1 })
    expect(plan[0]).toMatchObject({ quantity: null, unit: null })
    expect(await api.food.listPlan(ERIC.id)).toEqual([])

    await expect(api.food.savePlanItem(LUCILE.id, yaourt)).rejects.toThrow('déjà dans le plan')

    const id = plan[1]!.id
    await api.food.savePlanItem(LUCILE.id, { ...yaourt, quantity: 62.5, allowed_occurrences: 4 }, id)
    plan = await api.food.listPlan(LUCILE.id)
    expect(plan.find((i) => i.id === id)).toMatchObject({ quantity: 62.5, allowed_occurrences: 4 })

    await api.food.deletePlanItem(id)
    expect((await api.food.listPlan(LUCILE.id)).map((i) => i.name)).toEqual(['Sauce soja'])
  })

  it('crée une période figée et y note des consommations, hors plan compris', async () => {
    const { api } = await signedInApi()
    await expect(api.food.createPeriod(LUCILE.id, '2026-10-19', '2026-11-02')).rejects.toThrow('Le plan est vide')

    await api.food.savePlanItem(LUCILE.id, yaourt)
    const periodId = await api.food.createPeriod(LUCILE.id, '2026-10-19', '2026-11-02')
    expect(await api.food.listPeriods(LUCILE.id)).toEqual([{ id: periodId, profile_id: LUCILE.id, start_date: '2026-10-19', end_date: '2026-11-02' }])

    let [item] = await api.food.listPeriodItems(periodId)
    expect(item).toMatchObject({ name: 'Yaourt', quantity: 125, allowed_occurrences: 1, consumptions: [] })

    const first = await api.food.addConsumption(item!.id, '2026-10-20')
    expect(first.consumed_on).toBe('2026-10-20')
    await api.food.addConsumption(item!.id, '2026-10-20')
    ;[item] = await api.food.listPeriodItems(periodId)
    expect(itemUsage(item!)).toMatchObject({ used: 2, remaining: 0, over: 1 })

    await expect(api.food.addConsumption(item!.id, '2026-11-03')).rejects.toThrow('comprise dans la période')

    await api.food.removeConsumption(first.id)
    ;[item] = await api.food.listPeriodItems(periodId)
    expect(item!.consumptions).toHaveLength(1)

    // Le plan modifié ensuite ne change pas la période
    const [planItem] = await api.food.listPlan(LUCILE.id)
    await api.food.savePlanItem(LUCILE.id, { ...yaourt, allowed_occurrences: 5 }, planItem!.id)
    expect((await api.food.listPeriodItems(periodId))[0]!.allowed_occurrences).toBe(1)
  })

  it('refuse les chevauchements et supprime une période avec ses consommations', async () => {
    const { api } = await signedInApi()
    await api.food.savePlanItem(LUCILE.id, yaourt)
    const periodId = await api.food.createPeriod(LUCILE.id, '2026-10-19', '2026-11-02')
    await expect(api.food.createPeriod(LUCILE.id, '2026-11-01', '2026-11-14')).rejects.toThrow('chevauche')
    const next = await api.food.createPeriod(LUCILE.id, '2026-11-03', '2026-11-16')
    expect((await api.food.listPeriods(LUCILE.id)).map((p) => p.id)).toEqual([next, periodId])

    const [item] = await api.food.listPeriodItems(periodId)
    await api.food.addConsumption(item!.id, '2026-10-19')
    await api.food.deletePeriod(periodId)
    expect((await api.food.listPeriods(LUCILE.id)).map((p) => p.id)).toEqual([next])
    expect(await api.food.listPeriodItems(periodId)).toEqual([])
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createFoodApi(anonClient())
    await expect(api.listPlan(LUCILE.id)).rejects.toThrow(/accès/)
    await expect(api.listPeriods(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.savePlanItem(LUCILE.id, yaourt)).rejects.toBeInstanceOf(AppError)
    await expect(api.createPeriod(LUCILE.id, '2026-10-19', '2026-11-02')).rejects.toBeInstanceOf(AppError)
    await expect(api.addConsumption('00000000-0000-0000-0000-000000000000', '2026-10-19')).rejects.toBeInstanceOf(AppError)
  })

  it('prévient en temps réel des consommations notées ailleurs', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    await lucile.api.food.savePlanItem(LUCILE.id, yaourt)
    const periodId = await lucile.api.food.createPeriod(LUCILE.id, '2026-10-19', '2026-11-02')
    const [item] = await lucile.api.food.listPeriodItems(periodId)
    let events = 0
    let status = ''
    const unsubscribe = lucile.api.food.subscribe(
      () => {
        events += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      // Même tolérance que pour les autres tests temps réel (diffusion parfois lente juste après le démarrage).
      const deadline = Date.now() + 30000
      while (events === 0 && Date.now() < deadline) {
        await eric.api.food.addConsumption(item!.id, '2026-10-20')
        await waitFor(() => events > 0, 2000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)
})
