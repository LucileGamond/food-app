// Consommation du modèle : relevée sur les réponses de l'API Messages (fetch enveloppé, sans toucher au code des
// fonctions), puis enregistrée dans `llm_usage` avec la clé de service (le client ne peut pas y écrire).

import { API_URL, DEFAULT_MODEL } from './anthropic.ts'

/** Consommation d'un appel de fonction (toutes ses requêtes au modèle). */
export interface UsageTotal {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  web_searches: number
}

/** Ligne de `llm_usage`, sans le nom de la fonction (ajouté par l'enregistreur). */
export interface UsageEntry extends UsageTotal {
  user_id: string | null
  mode: string | null
  ok: boolean
}

interface ResponseUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number } | null
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** Enveloppe le fetch du modèle pour totaliser l'usage des réponses reçues (réponse coupée comprise : elle est facturée). */
export function trackUsage(doFetch: typeof fetch, requestedModel: string = DEFAULT_MODEL) {
  let total: UsageTotal | null = null

  const tracked: typeof fetch = async (input, init) => {
    const response = await doFetch(input, init)
    if (urlOf(input) !== API_URL || !response.ok) return response
    // Relevé sans risque : une réponse illisible n'empêche jamais l'appel.
    const body = (await Promise.resolve()
      .then(() => response.clone().json())
      .catch(() => null)) as { model?: string; usage?: ResponseUsage } | null
    const usage = body?.usage
    if (!usage) return response
    total ??= { model: body.model ?? requestedModel, requests: 0, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, web_searches: 0 }
    total.requests += 1
    total.input_tokens += usage.input_tokens ?? 0
    total.output_tokens += usage.output_tokens ?? 0
    total.cache_creation_tokens += usage.cache_creation_input_tokens ?? 0
    total.cache_read_tokens += usage.cache_read_input_tokens ?? 0
    total.web_searches += usage.server_tool_use?.web_search_requests ?? 0
    return response
  }

  return { fetch: tracked, total: () => (total ? { ...total } : null) }
}

export type RecordUsage = (entry: UsageEntry) => Promise<void>

/** Écrit la consommation d'un appel ; une erreur est signalée dans le journal mais ne fait jamais échouer l'appel. */
export function createUsageRecorder(
  supabaseUrl: string,
  serviceKey: string | undefined,
  functionName: string,
  doFetch: typeof fetch = fetch,
  log: (message: string, data?: Record<string, unknown>) => void = (message, data) => console.log(JSON.stringify({ message, ...data })),
): RecordUsage {
  return async (entry) => {
    if (!serviceKey) return
    try {
      const response = await doFetch(`${supabaseUrl}/rest/v1/llm_usage`, {
        method: 'POST',
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ function: functionName, ...entry }),
      })
      if (!response.ok) log('consommation non enregistrée', { status: response.status })
    } catch (error) {
      log('consommation non enregistrée', { error: String(error) })
    }
  }
}
