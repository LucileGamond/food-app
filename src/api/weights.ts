import type { IsoDate } from '@/lib/dates'
import type { AppSupabaseClient } from '@/api/client'
import type { WeighInValue, WeightEntry } from '@/lib/weights'
import { toAppError } from './errors'
import { subscribeTables } from './realtime'

export function createWeightsApi(db: AppSupabaseClient) {
  return {
    /** Toutes les mesures (quelques centaines au plus), triées par date. */
    async listEntries(): Promise<WeightEntry[]> {
      const { data, error } = await db
        .from('weight_entries')
        .select('id, profile_id, measured_on, weight_kg')
        .order('measured_on')
        .order('profile_id')
      if (error) throw toAppError(error, 'Impossible de charger les poids.')
      return data.map((e) => ({ ...e, weight_kg: Number(e.weight_kg) }))
    },

    /**
     * Enregistre un relevé (une date, un poids par personne), de façon atomique.
     * Un poids null efface la mesure ; `previousDate` déplace le relevé modifié.
     */
    async saveWeighIn(date: IsoDate, weights: WeighInValue[], previousDate?: IsoDate): Promise<void> {
      const { error } = await db.rpc('save_weigh_in', {
        p_measured_on: date,
        p_weights: weights.map((w) => ({ profile_id: w.profile_id, weight_kg: w.weight_kg })),
        p_previous_date: previousDate,
      })
      if (error) throw toAppError(error, "Impossible d'enregistrer le relevé.")
    },

    /** Supprime toutes les mesures d'une date. */
    async deleteWeighIn(date: IsoDate): Promise<void> {
      const { error } = await db.from('weight_entries').delete().eq('measured_on', date)
      if (error) throw toAppError(error, 'Impossible de supprimer le relevé.')
    },

    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'weights', ['weight_entries'], onChange, onStatus),
  }
}

export type WeightsApi = ReturnType<typeof createWeightsApi>
