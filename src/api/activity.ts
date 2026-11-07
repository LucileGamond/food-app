import type { AppSupabaseClient } from '@/api/client'
import { ACTIVITY_DAYS, type ActivityEvent, type ActivityKind } from '@/lib/activity'
import { toAppError } from './errors'
import { subscribeTables } from './realtime'

/** Tables dont un changement peut ajouter une ligne au fil « Ce que l'autre a fait ». */
const ACTIVITY_TABLES = ['watering_events', 'plants', 'meals', 'recipes', 'shopping_items'] as const

/** Gestes récents des autres (recent_activity : la personne connectée en est exclue). */
export function createActivityApi(db: AppSupabaseClient) {
  return {
    async listRecent(now: Date = new Date()): Promise<ActivityEvent[]> {
      const since = new Date(now.getTime() - ACTIVITY_DAYS * 86_400_000).toISOString()
      const { data, error } = await db.rpc('recent_activity', { p_since: since })
      if (error) throw toAppError(error, 'Impossible de charger les nouvelles de l’autre.')
      return data.map((row) => ({
        kind: row.kind as ActivityKind,
        actorId: row.actor_id,
        actorName: row.actor_name,
        at: row.at,
        title: row.title,
        detail: row.detail,
        targetId: row.target_id,
      }))
    },

    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'activity', ACTIVITY_TABLES, onChange, onStatus),
  }
}

export type ActivityApi = ReturnType<typeof createActivityApi>
