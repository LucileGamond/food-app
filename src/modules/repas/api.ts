// Planifier la semaine : règles de présence de chacun (lisibles par le foyer), plats « À planifier » détaillés,
// proposition de l'IA (Edge Function plan-week) et création des repas (RPC plan_week).

import { AppError, functionError, toAppError } from '@/api/errors'
import type { AppSupabaseClient } from '@/api/client'
import type { InboxItem } from '@/lib/inbox'
import { DEFAULT_RULE, type PresenceRule } from './lib/presence'
import type { Dish, PlanWeekRequest, toPlanWeekMeals } from './lib/weekPlan'

/** Sans recherche web, la réponse prend quelques secondes ; au-delà, la connexion est sans doute bloquée. */
const PLAN_TIMEOUT_MS = 70_000

const sum = (...values: (number | null)[]) => (values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null)

export function createWeekPlanApi(db: AppSupabaseClient) {
  return {
    /** Règles du foyer (une par personne qui en a enregistré une). */
    async listRules(): Promise<PresenceRule[]> {
      const { data, error } = await db.from('meal_presence_rules').select('profile_id, weekday_lunch_at_work, ignored_keywords')
      if (error) throw toAppError(error, 'Impossible de charger les règles des repas.')
      return data.map((r) => ({ profileId: r.profile_id, weekdayLunchAtWork: r.weekday_lunch_at_work, ignoredKeywords: r.ignored_keywords }))
    },

    /** Règle de la personne connectée (créée au premier enregistrement). */
    async getMyRule(userId: string): Promise<Omit<PresenceRule, 'profileId'>> {
      const { data, error } = await db.from('meal_presence_rules').select('weekday_lunch_at_work, ignored_keywords').eq('profile_id', userId).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger tes règles des repas.')
      return data ? { weekdayLunchAtWork: data.weekday_lunch_at_work, ignoredKeywords: data.ignored_keywords } : DEFAULT_RULE
    },

    async saveMyRule(rule: Omit<PresenceRule, 'profileId'>): Promise<void> {
      const { error } = await db.from('meal_presence_rules').upsert(
        { weekday_lunch_at_work: rule.weekdayLunchAtWork, ignored_keywords: rule.ignoredKeywords, updated_at: new Date().toISOString() },
        { onConflict: 'profile_id' },
      )
      if (error) throw toAppError(error, 'Impossible d’enregistrer tes règles des repas.')
    },

    /** Plats de la liste, avec temps, portions et ingrédients pour ceux qui sont des recettes enregistrées. */
    async listDishes(items: InboxItem[]): Promise<Dish[]> {
      const recipeIds = items.flatMap((i) => (i.recipe_id ? [i.recipe_id] : []))
      const recipes = new Map<string, { minutes: number | null; servings: number | null; ingredients: string[] }>()
      if (recipeIds.length > 0) {
        const { data, error } = await db
          .from('recipes')
          .select('id, servings, prep_minutes, cook_minutes, rest_minutes, recipe_ingredients(name, position)')
          .in('id', recipeIds)
        if (error) throw toAppError(error, 'Impossible de charger les recettes à planifier.')
        for (const r of data) {
          const ingredients = [...r.recipe_ingredients].sort((a, b) => a.position - b.position).map((i) => i.name)
          recipes.set(r.id, { minutes: sum(r.prep_minutes, r.cook_minutes, r.rest_minutes), servings: r.servings, ingredients })
        }
      }
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        recipeId: item.recipe_id,
        minutes: null,
        servings: null,
        ingredients: [],
        ...(item.recipe_id ? recipes.get(item.recipe_id) : undefined),
      }))
    },

    /** Proposition de l'IA, à relire avec `parsePlan`. */
    async proposePlan(request: PlanWeekRequest): Promise<unknown> {
      const { data, error } = await db.functions.invoke<unknown>('plan-week', { body: request, timeout: PLAN_TIMEOUT_MS })
      if (error) throw await functionError(error, 'La planification a échoué.', 'plan')
      return data
    },

    /** Crée les repas d'un coup et retire de la liste les plats planifiés ; renvoie le nombre de repas créés. */
    async saveWeek(meals: ReturnType<typeof toPlanWeekMeals>): Promise<number> {
      const { data, error } = await db.rpc('plan_week', { p_meals: meals })
      if (error?.code === 'P0002') throw new AppError('Un plat n’est plus dans la liste « À planifier » : recharge la page.', error.code)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la semaine.')
      return data
    },
  }
}

export type WeekPlanApi = ReturnType<typeof createWeekPlanApi>
