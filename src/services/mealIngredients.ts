// Ingrédients des repas à mettre dans une liste de courses : recettes enregistrées (une seule requête) et pages des
// liens (chacune lue une fois, quelques-unes à la fois). Les repas dont les ingrédients n'ont pas pu être repris sont à part.

import type { Api } from '@/api'
import { mapWithConcurrency } from '@/lib/async'
import type { Meal } from '@/lib/meals'
import type { Ingredient } from '@/lib/recipes'
import { fromMeal, mealSource, skippedMeal, type MealIngredients, type SkippedEntry } from '@/lib/shoppingFromPlan'

/** Pages de recettes lues en même temps. */
const IMPORT_CONCURRENCY = 3

/** Rejette si les recettes enregistrées ne peuvent pas être lues ; une page illisible ne fait que mettre son repas à part. */
export async function collectMealIngredients(api: Pick<Api, 'recipes'>, meals: Meal[]): Promise<{ found: MealIngredients[]; missing: SkippedEntry[] }> {
  const recipes = await api.recipes.getIngredients([...new Set(meals.filter((m) => mealSource(m) === 'recipe').map((m) => m.recipe.id))])

  // Une même page n'est lue qu'une fois, même si le repas est planifié plusieurs fois.
  const pages = new Map<string, Promise<{ servings: number | null; ingredients: Ingredient[] } | null>>()
  const readPage = (url: string) => {
    if (!pages.has(url)) {
      pages.set(
        url,
        api.recipes.importFromUrl(url).then(
          ({ recipe }) => (recipe.ingredients.length > 0 ? { servings: recipe.servings, ingredients: recipe.ingredients } : null),
          () => null,
        ),
      )
    }
    return pages.get(url)!
  }

  const results = await mapWithConcurrency(meals, IMPORT_CONCURRENCY, async (meal): Promise<MealIngredients | SkippedEntry> => {
    const source = mealSource(meal)
    if (source === 'recipe') {
      const recipe = recipes.find((r) => r.id === meal.recipe.id)
      if (!recipe || recipe.ingredients.length === 0) return skippedMeal(meal, 'no-ingredients')
      return fromMeal(meal, recipe.servings, recipe.ingredients)
    }
    if (source === 'link') {
      const page = await readPage(meal.recipe.url!)
      return page ? fromMeal(meal, page.servings, page.ingredients) : skippedMeal(meal, 'unreadable-page')
    }
    return skippedMeal(meal, 'no-ingredients')
  })
  const found: MealIngredients[] = []
  const missing: SkippedEntry[] = []
  for (const result of results) {
    if ('reason' in result) missing.push(result)
    else found.push(result)
  }
  return { found, missing }
}
