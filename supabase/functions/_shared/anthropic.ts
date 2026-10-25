// Appel à l'API Messages d'Anthropic avec un outil imposé, commun aux fonctions qui utilisent un modèle.

export const DEFAULT_MODEL = 'claude-haiku-5-5'
export const API_URL = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 45_000

/** Erreur avec le statut HTTP à renvoyer et un message lisible. */
export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export interface ModelUsage {
  input_tokens: number
  output_tokens: number
}

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ModelOptions {
  apiKey: string
  model?: string
  fetch?: typeof fetch
}

export interface ToolCall {
  system: string
  tool: Tool
  message: string
  maxTokens: number
  /** Début du message d'erreur : « L’analyse de la page a échoué ». */
  failure: string
  /** Précision quand le modèle ne remplit pas l'outil : « réponse sans recette ». */
  missing: string
}

/** Appelle le modèle en lui imposant l'outil, et renvoie ce qu'il a passé à l'outil (non validé). */
export async function callTool(
  { system, tool, message, maxTokens, failure, missing }: ToolCall,
  { apiKey, model = DEFAULT_MODEL, fetch: doFetch = fetch }: ModelOptions,
): Promise<{ input: unknown; usage: ModelUsage | null }> {
  let response: Response
  try {
    response = await doFetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError('Le service d’analyse ne répond pas. Réessaie dans un instant.', 503)
  }

  if (response.status === 401 || response.status === 403) throw new HttpError('Le service d’analyse est mal configuré.', 500)
  if (response.status === 429 || response.status === 529 || response.status >= 500) {
    throw new HttpError('Le service d’analyse est surchargé. Réessaie dans un instant.', 503)
  }
  if (!response.ok) {
    // Le détail renvoyé par l'API (ex. « not_found_error: model: … ») aide à diagnostiquer ; il ne contient aucun secret.
    const error = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null
    const detail = [error?.error?.type, error?.error?.message].filter(Boolean).join(' : ').slice(0, 200)
    throw new HttpError(`${failure} (${response.status}${detail ? ` – ${detail}` : ''}).`, 502)
  }

  const body = (await response.json()) as {
    content?: { type: string; name?: string; input?: unknown }[]
    usage?: ModelUsage
    stop_reason?: string
  }
  // Réponse coupée : le résultat serait incomplet (recette amputée, articles manquants).
  if (body.stop_reason === 'max_tokens') throw new HttpError(`${failure} (réponse trop longue).`, 502)
  const call = body.content?.find((block) => block.type === 'tool_use' && block.name === tool.name)
  if (!call) throw new HttpError(`${failure} (${missing}${body.stop_reason ? ` : ${body.stop_reason}` : ''}).`, 502)
  return { input: call.input, usage: body.usage ?? null }
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' } })
}
