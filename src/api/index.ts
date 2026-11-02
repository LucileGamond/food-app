import type { AppSupabaseClient } from '@/lib/supabase'
import { createFoodApi } from './food'
import { createHydrationApi } from './hydration'
import { createIdeasApi } from './ideas'
import { createInboxApi } from './inbox'
import { createMealsApi } from './meals'
import { createPhotosApi } from './photos'
import { createPushApi } from './push'
import { createRecipesApi } from './recipes'
import { createSettingsApi } from './settings'
import { createShoppingApi } from './shopping'
import { createWeightsApi } from './weights'
import { createKnittingApi } from '@/modules/tricot/api'

export function createApi(db: AppSupabaseClient) {
  return {
    meals: createMealsApi(db),
    recipes: createRecipesApi(db),
    photos: createPhotosApi(db),
    weights: createWeightsApi(db),
    food: createFoodApi(db),
    inbox: createInboxApi(db),
    shopping: createShoppingApi(db),
    push: createPushApi(db),
    ideas: createIdeasApi(db),
    settings: createSettingsApi(db),
    hydration: createHydrationApi(db),
    knitting: createKnittingApi(db),
  }
}

export type Api = ReturnType<typeof createApi>
export { AppError, DuplicateRecipeUrlError, RecipeInUseError, errorMessage, toAppError } from './errors'
