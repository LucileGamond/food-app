import type { AppSupabaseClient } from '@/api/client'
import { createActivityApi } from './activity'
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
import { createPlantsApi } from '@/modules/plantes/api'
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
    plants: createPlantsApi(db),
    activity: createActivityApi(db),
  }
}

export type Api = ReturnType<typeof createApi>
export { AppError, DuplicateRecipeUrlError, RecipeInUseError, errorMessage, toAppError } from './errors'
