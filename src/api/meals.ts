import type { IsoDate } from '@/lib/dates'
import type { Meal, MealRecipeSource, MealSlot, Profile } from '@/lib/meals'
import type { AppSupabaseClient } from '@/lib/supabase'
import { toAppError } from './errors'

const MEAL_COLUMNS = 'id, meal_date, slot, people, created_at, recipe:recipes!inner(id, is_saved, title, notes, url, tags)'

function sourceParams(source: MealRecipeSource) {
  if (source.kind === 'saved') return { p_recipe_id: source.recipeId }
  return { p_adhoc_title: source.title, p_adhoc_notes: source.notes, p_adhoc_url: source.url }
}

export interface CreateMealInput {
  date: IsoDate
  slot: MealSlot
  people: string[]
  source: MealRecipeSource
}

export function createMealsApi(db: AppSupabaseClient) {
  return {
    async listProfiles(): Promise<Profile[]> {
      const { data, error } = await db.from('profiles').select('id, display_name').order('display_name')
      if (error) throw toAppError(error, 'Impossible de charger les profils.')
      return data
    },

    /** Repas entre deux dates incluses, dans l'ordre de création. */
    async listMeals(from: IsoDate, to: IsoDate): Promise<Meal[]> {
      const { data, error } = await db
        .from('meals')
        .select(MEAL_COLUMNS)
        .gte('meal_date', from)
        .lte('meal_date', to)
        .order('created_at')
        .order('id')
      if (error) throw toAppError(error, 'Impossible de charger le planning.')
      return data.map(({ created_at: _createdAt, ...meal }) => meal)
    },

    async createMeal(input: CreateMealInput): Promise<string> {
      const { data, error } = await db.rpc('create_meal', {
        p_meal_date: input.date,
        p_slot: input.slot,
        p_people: input.people,
        ...sourceParams(input.source),
      })
      if (error) throw toAppError(error, "Impossible d'ajouter le repas.")
      return data
    },

    async updateMeal(id: string, people: string[], source: MealRecipeSource): Promise<void> {
      const { error } = await db.rpc('update_meal', { p_meal_id: id, p_people: people, ...sourceParams(source) })
      if (error) throw toAppError(error, 'Impossible de modifier le repas.')
    },

    async moveMeal(id: string, date: IsoDate, slot: MealSlot): Promise<void> {
      const { data, error } = await db.from('meals').update({ meal_date: date, slot }).eq('id', id).select('id')
      if (error) throw toAppError(error, 'Impossible de déplacer le repas.')
      if (data.length === 0) throw toAppError({ code: 'P0002' })
    },

    async duplicateMeal(id: string, date: IsoDate, slot: MealSlot): Promise<string> {
      const { data, error } = await db.rpc('duplicate_meal', { p_meal_id: id, p_meal_date: date, p_slot: slot })
      if (error) throw toAppError(error, 'Impossible de dupliquer le repas.')
      return data
    },

    async deleteMeal(id: string): Promise<void> {
      const { error } = await db.from('meals').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer le repas.')
    },

    /** Prévient à chaque changement des repas ou des recettes (fait par n'importe quel utilisateur). */
    subscribe(onChange: () => void, onStatus?: (status: string) => void): () => void {
      const channel = db
        .channel(`planning-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, onChange)
        .subscribe((status) => onStatus?.(status))
      return () => {
        void db.removeChannel(channel)
      }
    },
  }
}

export type MealsApi = ReturnType<typeof createMealsApi>
