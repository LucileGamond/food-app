import type { IsoDate } from '@/lib/dates'
import type { LogKind, LogSlot, MealLogEntry } from '@/lib/mealLog'
import type { AppSupabaseClient } from '@/api/client'
import { toAppError } from './errors'
import { subscribeTables } from './realtime'

export function createMealLogApi(db: AppSupabaseClient) {
  return {
    /** Réponses d'une personne entre deux dates incluses. */
    async list(profileId: string, from: IsoDate, to: IsoDate): Promise<MealLogEntry[]> {
      const { data, error } = await db
        .from('meal_log')
        .select('profile_id, eaten_on, slot, kind')
        .eq('profile_id', profileId)
        .gte('eaten_on', from)
        .lte('eaten_on', to)
        .order('eaten_on')
      if (error) throw toAppError(error, 'Impossible de charger le journal des repas.')
      return data as MealLogEntry[]
    },

    /** Enregistre (ou remplace) la réponse d'un moment. */
    async set(profileId: string, date: IsoDate, slot: LogSlot, kind: LogKind): Promise<void> {
      const { error } = await db
        .from('meal_log')
        .upsert({ profile_id: profileId, eaten_on: date, slot, kind, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,eaten_on,slot' })
      if (error) throw toAppError(error, 'Impossible d’enregistrer le repas.')
    },

    /** Efface la réponse d'un moment. */
    async clear(profileId: string, date: IsoDate, slot: LogSlot): Promise<void> {
      const { error } = await db.from('meal_log').delete().eq('profile_id', profileId).eq('eaten_on', date).eq('slot', slot)
      if (error) throw toAppError(error, 'Impossible d’effacer le repas.')
    },

    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'meal-log', ['meal_log'], onChange, onStatus),
  }
}

export type MealLogApi = ReturnType<typeof createMealLogApi>
