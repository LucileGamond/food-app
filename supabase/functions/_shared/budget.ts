// Budget IA mensuel du foyer (réglé dans l'application) : vérifié avant chaque appel au modèle. Une vérification
// impossible laisse passer l'appel (l'incident est signalé) plutôt que de bloquer toute l'application.

import { USD_TO_EUR } from './pricing.ts'

/** Message renvoyé (402) quand le budget est atteint, ou null pour laisser passer. */
export type BudgetCheck = () => Promise<string | null>

export function budgetMessage(monthlyEur: number): string {
  const amount = monthlyEur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `Le budget IA du mois (${amount} €) est atteint. Augmente-le dans Réglages, ou attends le mois prochain.`
}

export function createBudgetCheck(
  supabaseUrl: string,
  serviceKey: string | undefined,
  doFetch: typeof fetch = fetch,
  log: (message: string, data?: Record<string, unknown>) => void = (message, data) => console.log(JSON.stringify({ message, ...data })),
): BudgetCheck {
  return async () => {
    if (!serviceKey) return null
    try {
      const response = await doFetch(`${supabaseUrl}/rest/v1/rpc/llm_budget_status`, {
        method: 'POST',
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) {
        log('budget non vérifié', { status: response.status })
        return null
      }
      const [row] = (await response.json()) as { monthly_eur: number | null; spent_usd: number }[]
      if (!row || row.monthly_eur === null) return null
      return Number(row.spent_usd) * USD_TO_EUR >= Number(row.monthly_eur) ? budgetMessage(Number(row.monthly_eur)) : null
    } catch (error) {
      log('budget non vérifié', { error: String(error) })
      return null
    }
  }
}
