import { API_URL } from './anthropic.ts'
import { createUsageRecorder, trackUsage, type UsageEntry } from './usage.ts'

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('trackUsage', () => {
  it('relève l’usage de chaque réponse du modèle (cache et recherches web compris) et la totalise', async () => {
    const doFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply({
          model: 'claude-haiku-5-5',
          usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 7, server_tool_use: { web_search_requests: 2 } },
        }),
      )
      .mockResolvedValueOnce(reply({ model: 'claude-haiku-5-5', usage: { input_tokens: 50, output_tokens: 10 } }))
    const tracked = trackUsage(doFetch)

    const first = await tracked.fetch(API_URL, { method: 'POST', body: '{}' })
    expect(await first.json()).toMatchObject({ usage: { input_tokens: 100 } })
    await tracked.fetch(API_URL, { method: 'POST', body: '{}' })

    expect(tracked.total()).toEqual({
      model: 'claude-haiku-5-5',
      requests: 2,
      input_tokens: 150,
      output_tokens: 30,
      cache_creation_tokens: 5,
      cache_read_tokens: 7,
      web_searches: 2,
      // 150 × 0,10 + 30 × 0,50 + 5 × 0,125 + 7 × 0,01 par million, plus 2 recherches à 0,01 $
      cost_usd: expect.closeTo((150 * 0.1 + 30 * 0.5 + 5 * 0.125 + 7 * 0.01) / 1_000_000 + 0.02, 10),
    })
  })

  it('ignore les autres adresses, les erreurs et les réponses sans usage', async () => {
    const doFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ usage: { input_tokens: 9, output_tokens: 9 } }))
      .mockResolvedValueOnce(reply({ error: {} }, 529))
      .mockResolvedValueOnce(new Response('pas du json'))
    const tracked = trackUsage(doFetch)
    await tracked.fetch('https://exemple.fr/recette')
    await tracked.fetch(API_URL)
    await tracked.fetch(new URL(API_URL))
    expect(tracked.total()).toBeNull()
  })

  it('prend le modèle demandé quand la réponse ne le donne pas', async () => {
    const tracked = trackUsage(vi.fn<typeof fetch>().mockResolvedValue(reply({ usage: { input_tokens: 1, output_tokens: 2 } })), 'claude-sonnet-5-5')
    // Modèle inconnu : coût inconnu
    const unknown = trackUsage(vi.fn<typeof fetch>().mockResolvedValue(reply({ model: 'gpt-9', usage: { input_tokens: 1, output_tokens: 2 } })))
    await unknown.fetch(API_URL)
    expect(unknown.total()).toMatchObject({ model: 'gpt-9', cost_usd: null })
    await tracked.fetch(API_URL)
    expect(tracked.total()).toMatchObject({ model: 'claude-sonnet-5-5', requests: 1, cost_usd: expect.closeTo(0.000022, 10) })
  })
})

describe('createUsageRecorder', () => {
  const ENTRY: UsageEntry = {
    user_id: 'u1',
    mode: 'ideas',
    ok: true,
    model: 'claude-haiku-5-5',
    requests: 1,
    input_tokens: 10,
    output_tokens: 2,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    web_searches: 0,
    cost_usd: 0.000002,
  }

  it('écrit la ligne avec la clé de service, nom de la fonction compris', async () => {
    const doFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }))
    await createUsageRecorder('https://projet.supabase.co', 'cle-service', 'knit-pattern', doFetch)(ENTRY)
    expect(doFetch).toHaveBeenCalledWith('https://projet.supabase.co/rest/v1/llm_usage', {
      method: 'POST',
      headers: { apikey: 'cle-service', authorization: 'Bearer cle-service', 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ function: 'knit-pattern', ...ENTRY }),
    })
  })

  it('n’échoue jamais : une erreur d’écriture est seulement signalée', async () => {
    const log = vi.fn()
    await createUsageRecorder('https://p', 'k', 'f', vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 400 })), log)(ENTRY)
    await createUsageRecorder('https://p', 'k', 'f', vi.fn<typeof fetch>().mockRejectedValue(new Error('réseau')), log)(ENTRY)
    expect(log).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith('consommation non enregistrée', expect.objectContaining({ status: 400 }))
  })

  it('sans clé de service, ne fait rien', async () => {
    const doFetch = vi.fn<typeof fetch>()
    await createUsageRecorder('https://p', undefined, 'f', doFetch)(ENTRY)
    expect(doFetch).not.toHaveBeenCalled()
  })
})
