import type { WaterIntake } from '@/lib/hydration'
import type { AppSupabaseClient } from '@/lib/supabase'
import { toAppError } from './errors'
import { subscribeTables } from './realtime'

/** Verres bus par la personne connectée (chacun ne voit que les siens). */
export function createHydrationApi(db: AppSupabaseClient) {
  return {
    /** Verres bus depuis `since` (début de la journée), du plus ancien au plus récent. */
    async listIntakes(since: Date): Promise<WaterIntake[]> {
      const { data, error } = await db
        .from('water_intakes')
        .select('id, volume_ml, drunk_at')
        .gte('drunk_at', since.toISOString())
        .order('drunk_at')
      if (error) throw toAppError(error, 'Impossible de charger les verres du jour.')
      return data
    },

    async addIntake(volumeMl: number): Promise<WaterIntake> {
      const { data, error } = await db.from('water_intakes').insert({ volume_ml: volumeMl }).select('id, volume_ml, drunk_at').single()
      if (error) throw toAppError(error, 'Impossible d’enregistrer le verre.')
      return data
    },

    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'hydration', ['water_intakes'], onChange, onStatus),

    async deleteIntake(id: string): Promise<void> {
      const { error } = await db.from('water_intakes').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer le verre.')
    },
  }
}

export type HydrationApi = ReturnType<typeof createHydrationApi>
