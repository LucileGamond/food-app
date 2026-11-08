import { createApi } from '@/api'
import { createAppClient } from '@/api/client'
import { ERIC, LOCAL_ANON_KEY, LUCILE, anonClient, resetData, signedInApi } from './helpers'

const offline = () => createApi(createAppClient('http://127.0.0.1:9', LOCAL_ANON_KEY, { persistSession: false }))

beforeEach(async () => {
  await resetData()
})

describe('planifier la semaine', () => {
  it('règles de présence : chacun la sienne, lisibles par le foyer', async () => {
    const lucile = (await signedInApi()).api
    const eric = (await signedInApi(ERIC.email)).api
    expect(await lucile.weekPlan.getMyRule(LUCILE.id)).toEqual({ weekdayLunchAtWork: false, ignoredKeywords: [] })

    await lucile.weekPlan.saveMyRule({ weekdayLunchAtWork: true, ignoredKeywords: ['escalade'] })
    await lucile.weekPlan.saveMyRule({ weekdayLunchAtWork: true, ignoredKeywords: ['escalade', 'yoga'] })
    expect(await eric.weekPlan.listRules()).toEqual([{ profileId: LUCILE.id, weekdayLunchAtWork: true, ignoredKeywords: ['escalade', 'yoga'] }])
    expect(await eric.weekPlan.getMyRule(ERIC.id)).toEqual({ weekdayLunchAtWork: false, ignoredKeywords: [] })
    await expect(createApi(anonClient()).weekPlan.listRules()).rejects.toThrow()
    // Plus de 20 mots-clés : refusé par la base.
    await expect(lucile.weekPlan.saveMyRule({ weekdayLunchAtWork: true, ignoredKeywords: Array.from({ length: 21 }, (_, i) => `k${i}`) })).rejects.toThrow(
      'Certaines valeurs sont invalides.',
    )
  })

  it('erreurs réseau : messages lisibles', async () => {
    const api = offline().weekPlan
    const network = { code: 'network' }
    // En parallèle : chaque appel hors ligne attend l'échec de la connexion.
    await Promise.all([
      expect(api.listRules()).rejects.toMatchObject(network),
      expect(api.getMyRule(LUCILE.id)).rejects.toMatchObject(network),
      expect(api.saveMyRule({ weekdayLunchAtWork: false, ignoredKeywords: [] })).rejects.toMatchObject(network),
      expect(api.listDishes([{ id: 'i', title: 'x', url: null, recipe_id: crypto.randomUUID(), created_at: '' }])).rejects.toMatchObject(network),
      expect(api.saveWeek([])).rejects.toMatchObject(network),
      expect(api.proposePlan({ start: '2026-11-09', people: [], slots: [], dishes: [] })).rejects.toMatchObject(network),
    ])
  })

  it('recette sans temps ni portions : inconnus', async () => {
    const { api } = await signedInApi()
    const recipeId = await api.recipes.saveRecipe({ id: null, title: 'Omelette', notes: null, url: null, servings: null, tags: [], ingredients: [{ name: 'œufs', quantity: null, unit: null, note: null }] })
    await api.inbox.addItem({ recipeId })
    const [dish] = await api.weekPlan.listDishes(await api.inbox.listItems('plan'))
    expect(dish).toMatchObject({ recipeId, minutes: null, servings: null, ingredients: ['œufs'] })
  })

  it('détaille les plats, crée les repas avec cuisinier et restes, et vide la liste', async () => {
    const { api } = await signedInApi()
    const recipeId = await api.recipes.saveRecipe({
      id: null, title: 'Lasagnes', notes: null, url: null, servings: 4, tags: [], prepMinutes: 30, cookMinutes: 45,
      ingredients: [
        { name: 'pâtes', quantity: null, unit: null, note: null },
        { name: 'bœuf haché', quantity: null, unit: null, note: null },
      ],
    })
    await api.inbox.addItem({ recipeId })
    await api.inbox.addItem({ title: 'Soupe' })
    const items = await api.inbox.listItems('plan')

    const dishes = await api.weekPlan.listDishes(items)
    expect(dishes.find((d) => d.title === 'Lasagnes')).toMatchObject({ recipeId, minutes: 75, servings: 4, ingredients: ['pâtes', 'bœuf haché'] })
    expect(dishes.find((d) => d.title === 'Soupe')).toMatchObject({ recipeId: null, minutes: null, servings: null, ingredients: [] })

    const lasagnes = items.find((i) => i.title === 'Lasagnes')!.id
    const soupe = items.find((i) => i.title === 'Soupe')!.id
    const count = await api.weekPlan.saveWeek([
      { item_id: lasagnes, meal_date: '2026-11-10', slot: 'DINNER', people: [LUCILE.id, ERIC.id], cook_id: ERIC.id },
      { item_id: lasagnes, meal_date: '2026-11-11', slot: 'LUNCH', people: [ERIC.id], cook_id: null },
      { item_id: soupe, meal_date: '2026-11-09', slot: 'DINNER', people: [LUCILE.id], cook_id: LUCILE.id },
    ])
    expect(count).toBe(3)
    const meals = await api.meals.listMeals('2026-11-09', '2026-11-15')
    const byDate = [...meals].sort((a, b) => a.meal_date.localeCompare(b.meal_date))
    expect(byDate.map((m) => [m.meal_date, m.slot, m.recipe.title, m.cook_id])).toEqual([
      ['2026-11-09', 'DINNER', 'Soupe', LUCILE.id],
      ['2026-11-10', 'DINNER', 'Lasagnes', ERIC.id],
      ['2026-11-11', 'LUNCH', 'Lasagnes', null],
    ])
    expect(await api.inbox.listItems('plan')).toEqual([])

    await api.meals.setCook(meals.find((m) => m.slot === 'LUNCH')!.id, LUCILE.id)
    expect((await api.meals.listMeals('2026-11-11', '2026-11-11'))[0]!.cook_id).toBe(LUCILE.id)
  })

  it('plat déjà planifié entre-temps : message clair, rien de créé', async () => {
    const { api } = await signedInApi()
    await expect(
      api.weekPlan.saveWeek([{ item_id: crypto.randomUUID(), meal_date: '2026-11-10', slot: 'DINNER', people: [LUCILE.id], cook_id: null }]),
    ).rejects.toMatchObject({ message: 'Un plat n’est plus dans la liste « À planifier » : recharge la page.' })
    expect(await api.meals.listMeals('2026-11-09', '2026-11-15')).toEqual([])
  })
})

// Vraie Edge Function dans le runtime local, sans clé API : jamais d'appel au modèle.
describe('planifier la semaine (Edge Function)', () => {
  const REQUEST = {
    start: '2026-11-09',
    people: [{ id: LUCILE.id, name: 'Lucile' }],
    slots: [{ key: '2026-11-09|DINNER', day: 'Lundi 9 novembre', slot: 'DINNER' as const, people: [LUCILE.id], freeCooks: [LUCILE.id] }],
    dishes: [{ id: 'd1', title: 'Soupe', minutes: null, servings: null, ingredients: [], long: false, fragile: false }],
  }

  it('exige une connexion', async () => {
    await expect(createApi(anonClient()).weekPlan.proposePlan(REQUEST)).rejects.toMatchObject({ code: 'plan-401' })
  })

  it('refuse une demande invalide, puis signale le service mal configuré', async () => {
    const { api } = await signedInApi()
    await expect(api.weekPlan.proposePlan({ ...REQUEST, dishes: [] })).rejects.toMatchObject({ message: 'Aucun plat à planifier.', code: 'plan-400' })
    await expect(api.weekPlan.proposePlan(REQUEST)).rejects.toMatchObject({ message: 'Le service d’analyse est mal configuré.', code: 'plan-500' })
  })
})
