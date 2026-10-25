import type { AppSupabaseClient } from '@/lib/supabase'
import { createFoodApi } from './food'
import { createInboxApi } from './inbox'
import { createMealsApi } from './meals'
import { createPhotosApi } from './photos'
import { createRecipesApi } from './recipes'
import { createWeightsApi } from './weights'

export function createApi(db: AppSupabaseClient) {
  return {
    meals: createMealsApi(db),
    recipes: createRecipesApi(db),
    photos: createPhotosApi(db),
    weights: createWeightsApi(db),
    food: createFoodApi(db),
    inbox: createInboxApi(db),
  }
}

export type Api = ReturnType<typeof createApi>
export { AppError, DuplicateRecipeUrlError, RecipeInUseError, errorMessage, toAppError } from './errors'
