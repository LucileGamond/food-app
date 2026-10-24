import { AppError } from '@/api'
import { createMealsApi } from '@/api/meals'
import { ERIC, LUCILE, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

describe('meals api', () => {
  it('liste les deux profils', async () => {
    const { api } = await signedInApi()
    const profiles = await api.meals.listProfiles()
    expect(profiles.map((p) => p.display_name)).toEqual(['Eric', 'Lucile'])
  })

  it('crée, liste, modifie, déplace, duplique et supprime un repas', async () => {
    const { api } = await signedInApi()

    const id = await api.meals.createMeal({
      date: '2026-10-20',
      slot: 'LUNCH',
      people: [LUCILE.id, ERIC.id],
      source: { kind: 'adhoc', title: 'Pâtes tomate', notes: 'https://exemple.fr', url: '' },
    })
    await api.meals.createMeal({
      date: '2026-10-28',
      slot: 'DINNER',
      people: [LUCILE.id],
      source: { kind: 'adhoc', title: 'Hors fenêtre', notes: '', url: '' },
    })

    let meals = await api.meals.listMeals('2026-10-20', '2026-10-26')
    expect(meals).toHaveLength(1)
    expect(meals[0]).toMatchObject({
      id,
      meal_date: '2026-10-20',
      slot: 'LUNCH',
      recipe: { is_saved: false, title: 'Pâtes tomate', notes: 'https://exemple.fr', url: null },
    })
    expect([...meals[0]!.people].sort()).toEqual([LUCILE.id, ERIC.id].sort())

    await api.meals.updateMeal(id, [ERIC.id], { kind: 'adhoc', title: 'Pâtes pesto', notes: '', url: 'https://a.fr' })
    await api.meals.moveMeal(id, '2026-10-21', 'DINNER')
    const copyId = await api.meals.duplicateMeal(id, '2026-10-22', 'LUNCH')

    meals = await api.meals.listMeals('2026-10-20', '2026-10-26')
    expect(meals.map((m) => [m.id, m.meal_date, m.slot, m.recipe.title, m.people])).toEqual([
      [id, '2026-10-21', 'DINNER', 'Pâtes pesto', [ERIC.id]],
      [copyId, '2026-10-22', 'LUNCH', 'Pâtes pesto', [ERIC.id]],
    ])
    expect(meals[0]!.recipe.id).not.toBe(meals[1]!.recipe.id)

    await api.meals.deleteMeal(id)
    meals = await api.meals.listMeals('2026-10-20', '2026-10-26')
    expect(meals.map((m) => m.id)).toEqual([copyId])
  })

  it('crée un repas à partir d’une recette sauvegardée', async () => {
    const { api } = await signedInApi()
    const recipeId = await api.recipes.saveRecipe({
      id: null, title: 'Curry', notes: null, url: null, servings: 2, tags: ['végé'],
      ingredients: [{ name: 'Riz', quantity: 200, unit: 'g', note: null }],
    })
    await api.meals.createMeal({ date: '2026-10-20', slot: 'DINNER', people: [LUCILE.id], source: { kind: 'saved', recipeId } })
    const [meal] = await api.meals.listMeals('2026-10-20', '2026-10-20')
    expect(meal?.recipe).toMatchObject({ id: recipeId, is_saved: true, title: 'Curry', tags: ['végé'] })
  })

  it('remonte des erreurs claires', async () => {
    const { api } = await signedInApi()
    await expect(api.meals.createMeal({
      date: '2026-10-20', slot: 'LUNCH', people: [], source: { kind: 'adhoc', title: 'X', notes: '', url: '' },
    })).rejects.toThrow('Certaines valeurs sont invalides.')

    const missing = '99999999-9999-9999-9999-999999999999'
    await expect(api.meals.moveMeal(missing, '2026-10-20', 'LUNCH')).rejects.toBeInstanceOf(AppError)
    await expect(api.meals.duplicateMeal(missing, '2026-10-20', 'LUNCH')).rejects.toThrow(/introuvable/)
    await expect(api.meals.updateMeal(missing, [LUCILE.id], { kind: 'adhoc', title: 'X', notes: '', url: '' })).rejects.toThrow(/introuvable/)
    await expect(api.meals.createMeal({
      date: '2026-10-20', slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'saved', recipeId: missing },
    })).rejects.toThrow(/introuvable/)
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createMealsApi(anonClient())
    await expect(api.listMeals('2026-10-20', '2026-10-26')).rejects.toThrow(/accès|Reconnecte/)
    await expect(api.listProfiles()).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteMeal('99999999-9999-9999-9999-999999999999')).rejects.toBeInstanceOf(AppError)
  })

  it('prévient en temps réel des changements faits par l’autre personne', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    let events = 0
    let status = ''
    const unsubscribe = lucile.api.meals.subscribe(
      () => {
        events += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      // Juste après le démarrage de Supabase (en CI), le serveur temps réel peut mettre
      // plusieurs secondes à diffuser les changements : Eric modifie le planning
      // jusqu'à ce que Lucile reçoive une notification.
      const deadline = Date.now() + 30000
      while (events === 0 && Date.now() < deadline) {
        await eric.api.meals.createMeal({
          date: '2026-10-20', slot: 'LUNCH', people: [ERIC.id], source: { kind: 'adhoc', title: 'Soupe', notes: '', url: '' },
        })
        await waitFor(() => events > 0, 2000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)
})
