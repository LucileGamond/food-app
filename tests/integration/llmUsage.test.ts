import { createAppClient } from '@/api/client'
import { createUsageRecorder } from '../../supabase/functions/_shared/usage'
import { ERIC, LOCAL_SERVICE_KEY, LOCAL_URL, LUCILE, signedInApi } from './helpers'

const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })
const ENTRY = { mode: 'ideas', ok: true, model: 'claude-haiku-5-5', requests: 2, input_tokens: 1000, output_tokens: 200, cache_creation_tokens: 0, cache_read_tokens: 30, web_searches: 3 }

beforeEach(async () => {
  const { error } = await admin.from('llm_usage').delete().gte('id', 0)
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
})
