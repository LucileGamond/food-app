// Logique de la fonction tidy-shopping, indépendante de Deno pour pouvoir être testée.
//
// POST { lines: [{ id, name, quantity, unit, aisle }] } → 200 { lines: [{ id, name, aisle, pantry }] }
//   → 4xx/5xx { error: message lisible }
// Comme import-recipe : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { CORS_HEADERS, HttpError, json } from '../_shared/anthropic.ts'
import { parseInput, tidyLines } from './tidy.ts'

export interface Deps {
  apiKey: string | undefined
  model?: string
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
      const lines = parseInput(body)
      if (!deps.apiKey) throw new HttpError('Le service d’analyse est mal configuré.', 500)
      const result = await tidyLines(lines, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel })
      deps.log?.('regroupement réussi', { lines: lines.length, ms: Date.now() - started, ...result.usage })
      return json({ lines: result.lines })
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log?.('regroupement refusé', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('regroupement en erreur', { error: String(error) })
      return json({ error: 'Le regroupement a échoué.' }, 500)
    }
  }
}
