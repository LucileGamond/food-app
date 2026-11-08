import type { AppSupabaseClient } from '@/api/client'
import type { UsageRow } from '@/lib/llmUsage'
import { toAppError } from './errors'

/** Consommation du modèle (lecture seule : elle est écrite par les Edge Functions). */
export function createLlmUsageApi(db: AppSupabaseClient) {
  return {
    async summary(since: Date | null, until: Date | null): Promise<UsageRow[]> {
      const { data, error } = await db.rpc('llm_usage_summary', { ...(since ? { p_since: since.toISOString() } : {}), ...(until ? { p_until: until.toISOString() } : {}) })
      if (error) throw toAppError(error, 'Impossible de charger la consommation.')
      return (data ?? []).map((r) => ({
        userId: r.user_id,
        function: r.function,
        mode: r.mode,
        model: r.model,
        calls: r.calls,
        requests: r.requests,
        failures: r.failures,
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        cacheCreationTokens: Number(r.cache_creation_tokens),
        cacheReadTokens: Number(r.cache_read_tokens),
        webSearches: Number(r.web_searches),
      }))
    },
  }
}
