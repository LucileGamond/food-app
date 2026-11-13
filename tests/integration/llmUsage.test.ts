import { createAppClient } from '@/api/client'
import { createUsageRecorder } from '../../supabase/functions/_shared/usage'
import { ERIC, LOCAL_SERVICE_KEY, LOCAL_URL, LUCILE, signedInApi } from './helpers'

const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })
const ENTRY = { mode: 'ideas', ok: true, model: 'claude-haiku-5-5', requests: 2, input_tokens: 1000, output_tokens: 200, cache_creation_tokens: 0, cache_read_tokens: 30, web_searches: 3, cost_usd: 0.1 }

beforeEach(async () => {
  for (const [table, column] of [['llm_usage', 'id'], ['llm_credits', 'amount_usd']] as const) {
    const { error } = await admin.from(table).delete().gte(column, 0)
    if (error) throw error
  }
  const { error } = await admin.from('llm_budget').delete().eq('id', true)
  if (error) throw error
})

// Le budget est commun à toute la base locale : ne jamais le laisser actif pour les autres tests.
afterEach(async () => {
  const { error } = await admin.from('llm_budget').delete().eq('id', true)
  if (error) throw error
})

describe('llm usage', () => {
  it('le serveur enregistre la consommation, le foyer lit les totaux par période', async () => {
    const log = vi.fn()
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch, log)({ user_id: LUCILE.id, ...ENTRY })
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch, log)({ user_id: LUCILE.id, ...ENTRY, ok: false })
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'import-recipe', fetch, log)({ user_id: ERIC.id, ...ENTRY, mode: 'url' })
    expect(log).not.toHaveBeenCalled()

    const { api } = await signedInApi(ERIC.email)
    const rows = await api.llmUsage.summary(new Date(Date.now() - 60_000), null)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.function === 'knit-pattern')).toEqual({
      userId: LUCILE.id,
      function: 'knit-pattern',
      mode: 'ideas',
      model: 'claude-haiku-5-5',
      calls: 2,
      requests: 4,
      failures: 1,
      inputTokens: 2000,
      outputTokens: 400,
      cacheCreationTokens: 0,
      cacheReadTokens: 60,
      webSearches: 6,
    })
    expect(await api.llmUsage.summary(null, new Date(Date.now() - 60_000))).toEqual([])
  })

  it('le client ne peut pas écrire de consommation, ni la lire sans connexion', async () => {
    const { db } = await signedInApi()
    const { error } = await db.from('llm_usage').insert({ function: 'faux', model: 'm' })
    expect(error).not.toBeNull()

    const log = vi.fn()
    await createUsageRecorder(LOCAL_URL, 'cle-invalide', 'f', fetch, log)({ user_id: null, ...ENTRY })
    expect(log).toHaveBeenCalledWith('consommation non enregistrée', expect.objectContaining({ status: 401 }))

    const anon = createAppClient(LOCAL_URL, (await import('./helpers')).LOCAL_ANON_KEY, { persistSession: false })
    const { createLlmUsageApi } = await import('@/api/llmUsage')
    await expect(createLlmUsageApi(anon).summary(null, null)).rejects.toThrow()
  })

  it('budget du mois : réglé et retiré par le foyer, dépense du mois comptée', async () => {
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch)({ user_id: LUCILE.id, ...ENTRY, cost_usd: 1.25 })
    const { api } = await signedInApi()
    expect(await api.llmUsage.budgetStatus()).toEqual({ monthlyEur: null, spentUsd: 1.25 })
    await api.llmUsage.setBudget(5)
    const eric = await signedInApi(ERIC.email)
    expect(await eric.api.llmUsage.budgetStatus()).toEqual({ monthlyEur: 5, spentUsd: 1.25 })
    await expect(api.llmUsage.setBudget(0)).rejects.toThrow()
    await eric.api.llmUsage.setBudget(null)
    expect((await api.llmUsage.budgetStatus()).monthlyEur).toBeNull()
  })

  it('recharges : ajoutées, listées, crédit restant estimé, supprimées', async () => {
    const { api } = await signedInApi()
    await api.llmUsage.addCredit({ addedOn: '2026-01-01', amountUsd: 20, note: 'Première' })
    await api.llmUsage.addCredit({ addedOn: '2026-02-01', amountUsd: 5.5, note: null })
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch)({ user_id: LUCILE.id, ...ENTRY, cost_usd: 2 })
    const credits = await api.llmUsage.listCredits()
    expect(credits.map((c) => [c.addedOn, c.amountUsd, c.note, c.createdBy])).toEqual([
      ['2026-02-01', 5.5, null, LUCILE.id],
      ['2026-01-01', 20, 'Première', LUCILE.id],
    ])
    expect(await api.llmUsage.creditStatus()).toEqual({ creditsUsd: 25.5, since: '2026-01-01', spentUsd: 2 })
    await expect(api.llmUsage.addCredit({ addedOn: '2026-01-01', amountUsd: 0, note: null })).rejects.toThrow()
    await api.llmUsage.deleteCredit(credits[0]!.id)
    expect((await api.llmUsage.creditStatus()).creditsUsd).toBe(20)
  })

  it('coût réel : sans clé Admin en local, indisponible', async () => {
    const { api } = await signedInApi()
    expect(await api.llmUsage.realCost()).toEqual({ available: false })
  })

  it('budget atteint : les fonctions IA refusent l’appel avec un message clair', async () => {
    await createUsageRecorder(LOCAL_URL, LOCAL_SERVICE_KEY, 'knit-pattern', fetch)({ user_id: LUCILE.id, ...ENTRY, cost_usd: 5 })
    const { api } = await signedInApi()
    await api.llmUsage.setBudget(1)
    const recipe = { title: 'Soupe', servings: 2, ingredients: [{ name: 'oignon', quantity: 100, unit: 'g', note: null }] }
    await expect(api.recipes.estimateNutrition(recipe as never)).rejects.toMatchObject({
      message: 'Le budget IA du mois (1,00 €) est atteint. Augmente-le dans Réglages, ou attends le mois prochain.',
      code: 'nutrition-402',
    })
  })
})
