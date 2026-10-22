import type { AppSupabaseClient } from '@/lib/supabase'
import { createMealsApi } from './meals'
import { createPhotosApi } from './photos'
import { createRecipesApi } from './recipes'

export function createApi(db: AppSupabaseClient) {
  return {
    meals: createMealsApi(db),
    recipes: createRecipesApi(db),
    photos: createPhotosApi(db),
  }
}

export type Api = ReturnType<typeof createApi>
export { AppError, RecipeInUseError, errorMessage, toAppError } from './errors'
