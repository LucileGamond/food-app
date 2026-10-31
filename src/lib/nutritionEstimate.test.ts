import { estimateInput, needsNutrition, parseEstimate } from './nutritionEstimate'

describe('calcul des calories (Ciqual)', () => {
  const ingredients = [{ name: 'oignons', quantity: 3, unit: null, note: 'émincés', section: 'Garniture', linkedRecipe: null }]

  it('envoie le titre, les portions et les ingrédients sans les sections ni les liens', () => {
    expect(estimateInput({ title: 'Tarte', servings: 4, ingredients })).toEqual({
      title: 'Tarte',
      servings: 4,
      ingredients: [{ name: 'oignons', quantity: 3, unit: null, note: 'émincés' }],
    })
  })

  it('propose le calcul seulement sans aucune valeur et avec des ingrédients', () => {
    const empty = { kcal: null, carbs_g: null, protein_g: null, fat_g: null, ingredients }
    expect(needsNutrition(empty)).toBe(true)
    expect(needsNutrition({ ingredients })).toBe(true)
    expect(needsNutrition({ ...empty, kcal: 450 })).toBe(false)
    expect(needsNutrition({ ...empty, fat_g: 0 })).toBe(false)
    expect(needsNutrition({ ...empty, ingredients: [] })).toBe(false)
  })

  it('vérifie la réponse de la fonction', () => {
    const ok = {
      per: 'portion',
      kcal: 249,
      protein: 5.4,
      carbs: 41.5,
      fat: 6,
      ingredients: [
        { name: 'oignons', food: { code: '20034', name: 'Oignon, cru' }, grams: 300, kcal: 117 },
        { name: 'sel', food: null, grams: null, kcal: null },
        { name: 'bizarre', food: { code: 1 }, grams: -3, kcal: 'x' },
        { food: null },
        null,
      ],
    }
    expect(parseEstimate(ok)).toEqual({
      ...ok,
      ingredients: [ok.ingredients[0], ok.ingredients[1], { name: 'bizarre', food: null, grams: null, kcal: null }],
    })
    expect(parseEstimate({ ...ok, ingredients: undefined })?.ingredients).toEqual([])
    expect(parseEstimate({ ...ok, per: '100 g' })).toBeNull()
    expect(parseEstimate({ ...ok, kcal: -1 })).toBeNull()
    expect(parseEstimate({ ...ok, fat: undefined })).toBeNull()
    expect(parseEstimate(null)).toBeNull()
  })
})
