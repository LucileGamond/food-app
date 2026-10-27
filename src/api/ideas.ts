import { parseIdeas, type MealIdea, type MealIdeasInput } from '@/lib/mealIdeas'
import type { AppSupabaseClient } from '@/lib/supabase'
import { AppError, functionError } from './errors'

/** La recherche web peut prendre une minute ; au-delà, la connexion est sans doute bloquée. */
const IDEAS_TIMEOUT_MS = 110_000

export function createIdeasApi(db: AppSupabaseClient) {
  return {
    /** Idées de repas (Edge Function suggest-meals) : recettes enregistrées et recettes trouvées sur internet. */
    async suggestMeals(input: MealIdeasInput): Promise<MealIdea[]> {
      const { data, error } = await db.functions.invoke<{ ideas?: unknown }>('suggest-meals', { body: input, timeout: IDEAS_TIMEOUT_MS })
      if (error) throw await functionError(error, 'La recherche d’idées a échoué.', 'ideas')
      const ideas = parseIdeas(data?.ideas)
      if (ideas.length === 0) throw new AppError('La recherche d’idées a échoué.')
      return ideas
    },
  }
}
