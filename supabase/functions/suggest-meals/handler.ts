// Logique de la fonction suggest-meals, indépendante de Deno pour pouvoir être testée.
//
// POST { today, candidates: [{ id, title, ingredients, tags }], recent: [titre] }
//   → 200 { ideas: [...] }
//   → 4xx/5xx { error: message lisible }
// Comme import-recipe : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { CORS_HEADERS, HttpError, json } from '../_shared/anthropic.ts'
import { parseInput, suggestMeals } from './ideas.ts'

export interface Deps {
  apiKey: string | undefined
  model?: string
  /** Type de l'outil de recherche web (variante selon le modèle). */
  webSearchTool?: string
  fetchModel: typeof fetch
  log?: (message: string, data?: Record<string, unknown>) => void
  isSignedIn: (authorization: string | null) => Promise<boolean>
}

export function createHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    if (!(await deps.isSignedIn(request.headers.get('authorization')))) return json({ error: 'Connexion requise.' }, 401)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Requête invalide.' }, 400)
    }
    const started = Date.now()
    try {
      const input = parseInput(body)
      if (!deps.apiKey) throw new HttpError('Le service d’analyse est mal configuré.', 500)
      const result = await suggestMeals(input, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel, webSearchTool: deps.webSearchTool })
      deps.log?.('idées trouvées', {
        candidates: input.candidates.length,
        ideas: result.ideas.length,
        vegetarian: result.vegetarian,
        searches: result.searches,
        ms: Date.now() - started,
        ...result.usage,
      })
      return json({ ideas: result.ideas })
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log?.('idées refusées', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('idées en erreur', { error: String(error) })
      return json({ error: 'La recherche d’idées a échoué.' }, 500)
    }
  }
}
