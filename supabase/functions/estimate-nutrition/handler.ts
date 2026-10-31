// Logique de la fonction estimate-nutrition, indépendante de Deno pour pouvoir être testée.
//
// POST { title, servings, ingredients: [{ name, quantity, unit, note }] }
//   → 200 { per, kcal, protein, carbs, fat, ingredients: [{ name, food, grams, kcal }] }
//   → 4xx/5xx { error: message lisible }
// Comme tidy-shopping : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { CORS_HEADERS, HttpError, json } from '../_shared/anthropic.ts'
import { estimateNutrition, parseInput } from './nutrition.ts'

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
      const { estimate, usage } = await estimateNutrition(input, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel })
      deps.log?.('calcul réussi', { ingredients: input.ingredients.length, counted: estimate.ingredients.filter((i) => i.kcal !== null).length, ms: Date.now() - started, ...usage })
      return json(estimate)
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log?.('calcul refusé', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('calcul en erreur', { error: String(error) })
      return json({ error: 'Le calcul des calories a échoué.' }, 500)
    }
  }
}
