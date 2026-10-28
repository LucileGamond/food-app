// Appel à l'API Messages d'Anthropic, commun aux fonctions qui utilisent un modèle : outil imposé, ou conversation
// avec des outils serveur (recherche web) terminée par un outil.

export const DEFAULT_MODEL = 'claude-haiku-5-5'
export const API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_TIMEOUT_MS = 45_000

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

/** Contenu d'un message : texte seul, ou blocs (images puis texte). */
export type MessageContent =
  | string
  | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[]

export interface ToolCall {
  system: string
  tool: Tool
  message: MessageContent
  maxTokens: number
  /** Début du message d'erreur : « L’analyse de la page a échoué ». */
  failure: string
  /** Précision quand le modèle ne remplit pas l'outil : « réponse sans recette ». */
  missing: string
  /** Délai maximal de la réponse (45 s par défaut). */
  timeoutMs?: number
}

/** Réponse de l'API Messages (champs utilisés). */
interface MessagesResponse {
  content?: ContentBlock[]
  usage?: ModelUsage
  stop_reason?: string
}

/** Bloc de réponse : outil appelé, texte, ou résultat d'un outil serveur (recherche web). */
export interface ContentBlock {
  type: string
  name?: string
  input?: unknown
  content?: unknown
  [key: string]: unknown
}

/** Envoie une requête à l'API Messages ; les erreurs deviennent des HttpError au message lisible. */
async function postMessages(
  body: Record<string, unknown>,
  { apiKey, model = DEFAULT_MODEL, fetch: doFetch = fetch }: ModelOptions,
  failure: string,
  timeoutMs: number,
  /** Accepter une réponse coupée (`max_tokens`) : l'appelant la traite. */
  acceptTruncated = false,
): Promise<MessagesResponse> {
  let response: Response
  try {
    response = await doFetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
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
    // Outil de recherche web non activé pour l'organisation (console Anthropic).
    if (/web.?search/i.test(detail)) throw new HttpError('La recherche web n’est pas activée pour le service d’analyse.', 503)
    throw new HttpError(`${failure} (${response.status}${detail ? ` – ${detail}` : ''}).`, 502)
  }

  const parsed = (await response.json()) as MessagesResponse
  // Réponse coupée : le résultat serait incomplet (recette amputée, articles manquants).
  if (parsed.stop_reason === 'max_tokens' && !acceptTruncated) throw new HttpError(`${failure} (réponse trop longue).`, 502)
  return parsed
}

/** Appelle le modèle en lui imposant l'outil, et renvoie ce qu'il a passé à l'outil (non validé). */
export async function callTool(
  { system, tool, message, maxTokens, failure, missing, timeoutMs = DEFAULT_TIMEOUT_MS }: ToolCall,
  options: ModelOptions,
): Promise<{ input: unknown; usage: ModelUsage | null }> {
  const body = await postMessages(
    {
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: message }],
    },
    options,
    failure,
    timeoutMs,
  )
  const call = body.content?.find((block) => block.type === 'tool_use' && block.name === tool.name)
  if (!call) throw new HttpError(`${failure} (${missing}${body.stop_reason ? ` : ${body.stop_reason}` : ''}).`, 502)
  return { input: call.input, usage: body.usage ?? null }
}

export interface ConversationCall extends Omit<ToolCall, 'timeoutMs'> {
  /** Outils exécutés par Anthropic (recherche web…), disponibles avant l'outil final. */
  serverTools: Record<string, unknown>[]
  /** Délai total de la conversation. */
  timeoutMs: number
  /** Reprises après une pause (recherche longue). */
  maxContinuations?: number
  /** Profondeur de réflexion du modèle (`output_config.effort`). */
  effort?: 'low' | 'medium' | 'high'
  /**
   * Réponse coupée (trop longue) avant l'outil final : texte ajouté au message de départ pour une dernière demande,
   * outil imposé, à partir des blocs déjà reçus (ex. la liste des résultats de recherche, pour ne pas chercher à nouveau).
   */
  retryAfterTruncation: (blocks: readonly ContentBlock[]) => string
}

/**
 * Laisse le modèle utiliser des outils serveur (recherche web) puis appeler l'outil final, sans l'imposer d'emblée
 * (un outil imposé empêcherait de chercher). Reprend après une pause ; s'il termine sans appeler l'outil, le lui
 * impose une dernière fois ; si sa réponse est coupée, repart d'une demande courte (outil imposé) qui reprend ce qu'il a
 * déjà trouvé. Renvoie l'entrée de l'outil (non validée) et tous les blocs reçus (résultats de recherche).
 */
export async function runConversation(
  { system, tool, serverTools, message, maxTokens, failure, missing, timeoutMs, maxContinuations = 2, effort, retryAfterTruncation }: ConversationCall,
  options: ModelOptions,
): Promise<{ input: unknown; blocks: ContentBlock[]; usage: ModelUsage }> {
  const deadline = Date.now() + timeoutMs
  const usage: ModelUsage = { input_tokens: 0, output_tokens: 0 }
  const blocks: ContentBlock[] = []
  let messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: message }]

  let continuations = 0
  let forced = false
  for (;;) {
    const body = await postMessages(
      {
        max_tokens: maxTokens,
        system,
        tools: [...serverTools, tool],
        tool_choice: forced ? { type: 'tool', name: tool.name } : { type: 'auto' },
        messages,
        ...(effort ? { output_config: { effort } } : {}),
      },
      options,
      failure,
      deadline - Date.now(),
      !forced,
    )
    usage.input_tokens += body.usage?.input_tokens ?? 0
    usage.output_tokens += body.usage?.output_tokens ?? 0
    const content = body.content ?? []
    blocks.push(...content)

    if (body.stop_reason === 'max_tokens') {
      // Réponse coupée (l'outil final, s'il y figure, est incomplet) : elle n'est pas renvoyée au modèle, une demande
      // courte la remplace.
      forced = true
      const text = typeof message === 'string' ? message : ''
      messages = [{ role: 'user', content: `${text}\n\n${retryAfterTruncation(blocks)}`.trim() }]
      continue
    }

    const call = content.find((block) => block.type === 'tool_use' && block.name === tool.name)
    if (call) return { input: call.input, blocks, usage }

    messages.push({ role: 'assistant', content })
    if (body.stop_reason === 'pause_turn' && continuations < maxContinuations) {
      continuations += 1
      continue
    }
    if (forced || body.stop_reason === 'pause_turn') {
      throw new HttpError(`${failure} (${missing}${body.stop_reason ? ` : ${body.stop_reason}` : ''}).`, 502)
    }
    forced = true
    messages.push({ role: 'user', content: `Appelle maintenant l’outil ${tool.name} avec ta réponse.` })
  }
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8' } })
}
