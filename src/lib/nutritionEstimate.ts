// Calories et macros calculées d'après la table Ciqual (Edge Function estimate-nutrition), sur demande.

import type { Recipe } from './recipes'

export interface IngredientEstimate {
  name: string
  /** Aliment Ciqual retenu, ou null : ingrédient non compté. */
  food: { code: string; name: string } | null
  grams: number | null
  kcal: number | null
}

export interface NutritionEstimate {
  per: 'portion' | 'recette'
  kcal: number
  protein: number
  carbs: number
  fat: number
  ingredients: IngredientEstimate[]
}

/** Ce que reçoit la fonction : le titre, les portions et les ingrédients (sans les sections ni les liens). */
export function estimateInput(recipe: Pick<Recipe, 'title' | 'servings' | 'ingredients'>) {
  return {
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(({ name, quantity, unit, note }) => ({ name, quantity, unit, note })),
  }
}

/** La recette n'a encore aucune valeur nutritionnelle : le calcul est proposé. */
export function needsNutrition(recipe: Pick<Recipe, 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g' | 'ingredients'>): boolean {
  return recipe.ingredients.length > 0 && [recipe.kcal, recipe.carbs_g, recipe.protein_g, recipe.fat_g].every((v) => v == null)
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Réponse de la fonction, vérifiée ; null si elle n'a pas la forme attendue. */
export function parseEstimate(data: unknown): NutritionEstimate | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if ((d.per !== 'portion' && d.per !== 'recette') || ![d.kcal, d.protein, d.carbs, d.fat].every(isNumber)) return null
  const ingredients = (Array.isArray(d.ingredients) ? d.ingredients : []).flatMap((value): IngredientEstimate[] => {
    if (typeof value !== 'object' || value === null) return []
    const i = value as Record<string, unknown>
    if (typeof i.name !== 'string') return []
    const food = typeof i.food === 'object' && i.food !== null ? (i.food as Record<string, unknown>) : null
    return [
      {
        name: i.name,
        food: food && typeof food.code === 'string' && typeof food.name === 'string' ? { code: food.code, name: food.name } : null,
        grams: isNumber(i.grams) ? i.grams : null,
        kcal: isNumber(i.kcal) ? i.kcal : null,
      },
    ]
  })
  return { per: d.per, kcal: d.kcal as number, protein: d.protein as number, carbs: d.carbs as number, fat: d.fat as number, ingredients }
}
