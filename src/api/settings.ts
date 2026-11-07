import type { AppSupabaseClient } from '@/api/client'
import { isAgendaScope } from '@agenda/scope.ts'
import { containersFromJson, containersToJson } from '@/lib/hydration'
import { DEFAULT_SETTINGS, type NotificationTopic, type PageKey, type UserSettings } from '@/lib/settings'
import { toAppError } from './errors'

/** Réglages de la personne connectée (chacun ne voit que les siens). */
export function createSettingsApi(db: AppSupabaseClient) {
  return {
    async getSettings(): Promise<UserSettings> {
      const { data, error } = await db.from('user_settings').select('disabled_pages, muted_notifications, hydration_goal_ml, hydration_containers, agenda_scope').maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger les réglages.')
      if (!data) return DEFAULT_SETTINGS
      return {
        disabledPages: data.disabled_pages as PageKey[],
        mutedNotifications: data.muted_notifications as NotificationTopic[],
        hydrationGoalMl: data.hydration_goal_ml,
        hydrationContainers: containersFromJson(data.hydration_containers),
        agendaScope: isAgendaScope(data.agenda_scope) ? data.agenda_scope : DEFAULT_SETTINGS.agendaScope,
      }
    },

    async saveSettings(settings: UserSettings): Promise<void> {
      // Ligne de la personne connectée (profile_id par défaut : auth.uid()), créée au premier enregistrement.
      const { error } = await db.from('user_settings').upsert(
        {
          disabled_pages: settings.disabledPages,
          muted_notifications: settings.mutedNotifications,
          hydration_goal_ml: settings.hydrationGoalMl,
          hydration_containers: containersToJson(settings.hydrationContainers),
          agenda_scope: settings.agendaScope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' },
      )
      if (error) throw toAppError(error, 'Impossible d’enregistrer les réglages.')
    },
  }
}

export type SettingsApi = ReturnType<typeof createSettingsApi>
