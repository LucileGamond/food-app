import type { AppSupabaseClient } from '@/lib/supabase'

/**
 * Suit les modifications de tables (lignes visibles par la personne connectée) ; renvoie de quoi se désabonner.
 * `onStatus` : état de l'abonnement (« SUBSCRIBED »…), pour attendre qu'il soit actif.
 */
export function subscribeTables(
  db: AppSupabaseClient,
  name: string,
  tables: readonly string[],
  onChange: () => void,
  onStatus?: (status: string) => void,
): () => void {
  const channel = db.channel(`${name}-${crypto.randomUUID()}`)
  for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  channel.subscribe((status) => onStatus?.(status))
  return () => {
    void db.removeChannel(channel)
  }
}
