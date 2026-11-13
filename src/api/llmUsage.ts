import type { AppSupabaseClient } from '@/api/client'
import type { BudgetStatus, CreditStatus } from '@/lib/llmBudget'
import type { UsageRow } from '@/lib/llmUsage'
import { functionError, toAppError } from './errors'

export interface LlmCredit {
  id: string
  addedOn: string
  amountUsd: number
  note: string | null
  createdBy: string | null
}

/** Coût réel de la clé Anthropic (Edge Function llm-cost) : indisponible sans clé Admin. */
export type RealCost =
  | { available: false }
  | { available: true; since: string | null; costUsd?: number; fetchedAt?: string; error?: string }

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

    async budgetStatus(): Promise<BudgetStatus> {
      const { data, error } = await db.rpc('llm_budget_status')
      if (error) throw toAppError(error, 'Impossible de charger le budget IA.')
      const row = data?.[0]
      return { monthlyEur: row?.monthly_eur == null ? null : Number(row.monthly_eur), spentUsd: Number(row?.spent_usd ?? 0) }
    },

    async setBudget(monthlyEur: number | null): Promise<void> {
      // Le type généré ne connaît pas le null accepté par la fonction (budget retiré).
      const { error } = await db.rpc('set_llm_budget', { p_monthly_eur: monthlyEur as number })
      if (error) throw toAppError(error, 'Impossible d’enregistrer le budget IA.')
    },

    async creditStatus(): Promise<CreditStatus> {
      const { data, error } = await db.rpc('llm_credit_status')
      if (error) throw toAppError(error, 'Impossible de charger le crédit IA.')
      const row = data?.[0]
      return { creditsUsd: Number(row?.credits_usd ?? 0), since: row?.since ?? null, spentUsd: Number(row?.spent_usd ?? 0) }
    },

    async listCredits(): Promise<LlmCredit[]> {
      const { data, error } = await db.from('llm_credits').select('id, added_on, amount_usd, note, created_by').order('added_on', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les recharges.')
      return (data ?? []).map((c) => ({ id: c.id, addedOn: c.added_on, amountUsd: Number(c.amount_usd), note: c.note, createdBy: c.created_by }))
    },

    async addCredit(credit: { addedOn: string; amountUsd: number; note: string | null }): Promise<void> {
      const { error } = await db.from('llm_credits').insert({ added_on: credit.addedOn, amount_usd: credit.amountUsd, note: credit.note })
      if (error) throw toAppError(error, 'Impossible d’enregistrer la recharge.')
    },

    async deleteCredit(id: string): Promise<void> {
      const { error } = await db.from('llm_credits').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer la recharge.')
    },

    async realCost(): Promise<RealCost> {
      const { data, error } = await db.functions.invoke<RealCost>('llm-cost', { body: {} })
      if (error) throw await functionError(error, 'Le coût réel est indisponible pour l’instant.', 'cost')
      return data ?? { available: false }
    },
  }
}
