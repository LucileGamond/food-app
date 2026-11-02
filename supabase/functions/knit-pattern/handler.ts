// Logique de la fonction knit-pattern (module Tricot), indépendante de Deno pour pouvoir être testée.
//
// POST { pdf: base64, size }
//   → 200 { title, sizes, steps: [{ title, instructions, totalRows, stitches, sections }] }
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { CORS_HEADERS, HttpError, json } from '../_shared/anthropic.ts'
import { parseInput, readPattern } from './pattern.ts'

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
      const input = parseInput(body)
      if (!deps.apiKey) throw new HttpError('Le service d’analyse est mal configuré.', 500)
      const { pattern, usage } = await readPattern(input, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel })
      deps.log?.('patron lu', { steps: pattern.steps.length, kb: Math.round(input.pdf.length / 1365), ms: Date.now() - started, ...usage })
      return json(pattern)
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log?.('patron refusé', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('patron en erreur', { error: String(error) })
      return json({ error: 'La lecture du patron a échoué.' }, 500)
    }
  }
}
