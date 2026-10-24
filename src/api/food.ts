import type { IsoDate } from '@/lib/dates'
import type { Consumption, FoodPeriod, PeriodItem, PlanItem, PlanItemInput } from '@/lib/food'
import type { AppSupabaseClient } from '@/lib/supabase'
import { AppError, toAppError } from './errors'

const ITEM_COLUMNS = 'id, meal, category, name, quantity, unit, allowed_occurrences, position'

type RawItem = Omit<PlanItem, 'quantity'> & { quantity: number | string | null }

function toItem<T extends RawItem>(row: T): T & { quantity: number | null } {
  return { ...row, quantity: row.quantity === null ? null : Number(row.quantity) }
}

export function createFoodApi(db: AppSupabaseClient) {
  return {
    async listPlan(profileId: string): Promise<PlanItem[]> {
      const { data, error } = await db.from('food_plan_items').select(ITEM_COLUMNS).eq('profile_id', profileId).order('position').order('name')
      if (error) throw toAppError(error, 'Impossible de charger le plan.')
      return data.map(toItem)
    },

    /** Crée (sans `id`) ou modifie un élément du plan. */
    async savePlanItem(profileId: string, input: PlanItemInput & { position?: number }, id?: string): Promise<void> {
      const { error } = id
        ? await db.from('food_plan_items').update(input).eq('id', id)
        : await db.from('food_plan_items').insert({ ...input, profile_id: profileId })
      if (error?.code === '23505') throw new AppError('Cet aliment est déjà dans le plan pour ce moment.', error.code)
      if (error) throw toAppError(error, "Impossible d'enregistrer l'aliment.")
    },

    async deletePlanItem(id: string): Promise<void> {
      const { error } = await db.from('food_plan_items').delete().eq('id', id)
      if (error) throw toAppError(error, "Impossible de supprimer l'aliment.")
    },

    async listPeriods(profileId: string): Promise<FoodPeriod[]> {
      const { data, error } = await db
        .from('food_periods')
        .select('id, profile_id, start_date, end_date')
        .eq('profile_id', profileId)
        .order('start_date', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les périodes.')
      return data
    },

    async listPeriodItems(periodId: string): Promise<PeriodItem[]> {
      const { data, error } = await db
        .from('food_period_items')
        .select(`${ITEM_COLUMNS}, consumptions:food_consumptions(id, consumed_on, created_at)`)
        .eq('period_id', periodId)
        .order('position')
        .order('name')
      if (error) throw toAppError(error, 'Impossible de charger la période.')
      return data.map(toItem)
    },

    /** Crée une période en y copiant le plan actuel ; renvoie son id. */
    async createPeriod(profileId: string, start: IsoDate, end: IsoDate): Promise<string> {
      const { data, error } = await db.rpc('create_food_period', { p_profile_id: profileId, p_start: start, p_end: end })
      if (error?.code === '23P01') throw new AppError('Cette période chevauche une période existante.', error.code)
      if (error?.code === '22023') throw new AppError("Le plan est vide : ajoute d'abord des aliments.", error.code)
      if (error) throw toAppError(error, 'Impossible de créer la période.')
      return data
    },

    async deletePeriod(id: string): Promise<void> {
      const { error } = await db.from('food_periods').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer la période.')
    },

    async addConsumption(itemId: string, date: IsoDate): Promise<Consumption> {
      const { data, error } = await db
        .from('food_consumptions')
        .insert({ item_id: itemId, consumed_on: date })
        .select('id, consumed_on, created_at')
        .single()
      if (error?.code === '23514') throw new AppError('La date doit être comprise dans la période.', error.code)
      if (error) throw toAppError(error, "Impossible d'enregistrer la consommation.")
      return data
    },

    async removeConsumption(id: string): Promise<void> {
      const { error } = await db.from('food_consumptions').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de retirer la consommation.')
    },

    /** Prévient de tout changement du suivi (plan, périodes, consommations). */
    subscribe(onChange: () => void, onStatus?: (status: string) => void): () => void {
      const channel = db.channel(`food-${Math.random().toString(36).slice(2)}`)
      for (const table of ['food_plan_items', 'food_periods', 'food_period_items', 'food_consumptions']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      }
      channel.subscribe((status) => onStatus?.(status))
      return () => {
        void db.removeChannel(channel)
      }
    },
  }
}

export type FoodApi = ReturnType<typeof createFoodApi>
