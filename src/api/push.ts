import type { AppSupabaseClient } from '@/lib/supabase'
import { toAppError } from './errors'

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

/** Appareils abonnés aux notifications (chacun ne voit que les siens). */
export function createPushApi(db: AppSupabaseClient) {
  return {
    async saveSubscription(input: PushSubscriptionInput): Promise<void> {
      const { error } = await db.rpc('save_push_subscription', {
        p_endpoint: input.endpoint,
        p_p256dh: input.p256dh,
        p_auth: input.auth,
        p_user_agent: input.userAgent,
      })
      if (error) throw toAppError(error, "Impossible d'activer les notifications.")
    },

    async isSubscribed(endpoint: string): Promise<boolean> {
      const { data, error } = await db.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de vérifier les notifications.')
      return data !== null
    },

    async deleteSubscription(endpoint: string): Promise<void> {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) throw toAppError(error, 'Impossible de désactiver les notifications.')
    },
  }
}

export type PushApi = ReturnType<typeof createPushApi>
