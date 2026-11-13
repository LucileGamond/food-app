import { budgetMessage, createBudgetCheck } from './budget.ts'

const status = (body: unknown, init?: ResponseInit) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), init))

describe('createBudgetCheck', () => {
  it('lit le budget du mois avec la clé de service', async () => {
    const doFetch = status([{ monthly_eur: 5, spent_usd: 1 }])
    expect(await createBudgetCheck('https://projet.supabase.co', 'cle-service', doFetch)()).toBeNull()
    expect(doFetch).toHaveBeenCalledWith('https://projet.supabase.co/rest/v1/rpc/llm_budget_status', {
      method: 'POST',
      headers: { apikey: 'cle-service', authorization: 'Bearer cle-service', 'content-type': 'application/json' },
      body: '{}',
    })
  })

  it('bloque quand la dépense du mois atteint le budget (en euros)', async () => {
    // 5 € = 5,81 $ au taux de 0,86
    expect(await createBudgetCheck('https://p', 'k', status([{ monthly_eur: 5, spent_usd: 5.82 }]))()).toBe(budgetMessage(5))
    expect(await createBudgetCheck('https://p', 'k', status([{ monthly_eur: 5, spent_usd: 5.8 }]))()).toBeNull()
  })

  it('sans budget, ou si la vérification échoue, laisse passer (incident signalé)', async () => {
    const log = vi.fn()
    expect(await createBudgetCheck('https://p', 'k', status([{ monthly_eur: null, spent_usd: 100 }]), log)()).toBeNull()
    expect(await createBudgetCheck('https://p', 'k', status([]), log)()).toBeNull()
    expect(await createBudgetCheck('https://p', 'k', status({}, { status: 500 }), log)()).toBeNull()
    expect(await createBudgetCheck('https://p', 'k', vi.fn<typeof fetch>().mockRejectedValue(new Error('réseau')), log)()).toBeNull()
    expect(await createBudgetCheck('https://p', undefined, vi.fn<typeof fetch>(), log)()).toBeNull()
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith('budget non vérifié', expect.objectContaining({ status: 500 }))
  })

  it('message lisible', () => {
    expect(budgetMessage(5)).toBe('Le budget IA du mois (5,00 €) est atteint. Augmente-le dans Réglages, ou attends le mois prochain.')
  })
})
