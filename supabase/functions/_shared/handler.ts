// Handler commun des fonctions appelées par l'application qui interrogent le modèle (estimate-nutrition, knit-pattern,
// suggest-meals, tidy-shopping) : CORS, POST seulement, personne connectée, corps JSON, clé du modèle, journal et
// messages d'erreur lisibles. Chaque fonction ne donne que la lecture de la requête et le traitement.

import { CORS_HEADERS, HttpError, json, MISCONFIGURED, type ModelOptions } from './anthropic.ts'

/** Dépendances injectées (testables sans Deno ni réseau). */
export interface ModelDeps {
  apiKey: string | undefined
  model?: string
  fetchModel: typeof fetch
  log?: (message: string, data?: Record<string, unknown>) => void
  /** Le jeton appartient à une personne connectée (voir _shared/auth.ts) : la clé publique anonyme est refusée. */
  isSignedIn: (authorization: string | null) => Promise<boolean>
}

export interface ModelHandlerSpec<Deps extends ModelDeps, Input> {
  /** Lecture et vérification du corps (HttpError 400/413… si invalide). */
  parse: (body: unknown) => Input
  /** Traitement : réponse renvoyée et données du journal (consommation comprise ; la durée est ajoutée par le handler). */
  run: (input: Input, options: ModelOptions, deps: Deps) => Promise<{ body: unknown; log: Record<string, unknown> }>
  /** Messages du journal : succès, requête refusée, erreur inattendue. */
  logs: { done: string; refused: string; failed: string }
  /** Message renvoyé pour une erreur inattendue (« Le calcul des calories a échoué. »). */
  failure: string
}

export function createModelHandler<Deps extends ModelDeps, Input>(deps: Deps, spec: ModelHandlerSpec<Deps, Input>) {
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
      const input = spec.parse(body)
      if (!deps.apiKey) throw new HttpError(MISCONFIGURED, 500)
      const result = await spec.run(input, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel }, deps)
      deps.log?.(spec.logs.done, { ...result.log, ms: Date.now() - started })
      return json(result.body)
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log?.(spec.logs.refused, { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.(spec.logs.failed, { error: String(error) })
      return json({ error: spec.failure }, 500)
    }
  }
}
