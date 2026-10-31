import { createApi } from '@/api'
import { anonClient, signedInApi } from './helpers'

const RECIPE = { title: 'Soupe', servings: 2, ingredients: [{ name: 'poireaux', quantity: 2, unit: null, note: null, section: null }] }

// Exécute la vraie Edge Function dans le runtime local, sans clé API : jamais d'appel au modèle.
describe('calcul des calories (Edge Function estimate-nutrition)', () => {
  it('exige une connexion', async () => {
    const api = createApi(anonClient())
    await expect(api.recipes.estimateNutrition(RECIPE)).rejects.toMatchObject({ message: 'Ta session a expiré. Reconnecte-toi.', code: 'nutrition-401' })
  })

  it('refuse une recette sans ingrédient, et signale un service mal configuré', async () => {
    const { api } = await signedInApi()
    await expect(api.recipes.estimateNutrition({ ...RECIPE, ingredients: [] })).rejects.toMatchObject({ message: 'Aucun ingrédient.', code: 'nutrition-400' })
    await expect(api.recipes.estimateNutrition(RECIPE)).rejects.toMatchObject({ message: 'Le service d’analyse est mal configuré.', code: 'nutrition-500' })
  })
})

describe('enregistrement des calories calculées', () => {
  it('ne touche qu’aux valeurs nutritionnelles', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe({ id: null, title: `Soupe ${Date.now()}`, notes: 'Mixer.', url: null, servings: 2, tags: ['soupe'], ingredients: [{ name: 'poireaux', quantity: 2, unit: null, note: null }] })
    await api.recipes.saveNutrition(id, { per: 'portion', kcal: 180, carbs: 20.5, protein: 4, fat: 9.3 })
    const recipe = (await api.recipes.getRecipe(id))!
    expect(recipe).toMatchObject({ nutrition_per: 'portion', kcal: 180, carbs_g: 20.5, protein_g: 4, fat_g: 9.3, notes: 'Mixer.', tags: ['soupe'] })
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['poireaux'])
    // Valeur hors limites (contrainte de la base) : refusée avec un message.
    await expect(api.recipes.saveNutrition(id, { per: 'recette', kcal: 99_999, carbs: 0, protein: 0, fat: 0 })).rejects.toThrow()
  })
})
