// Logique de la fonction suggest-meals, indépendante de Deno pour pouvoir être testée.
//
// POST { today, candidates: [{ id, title, ingredients, tags }], recent: [titre] }
//   → 200 { ideas: [...] }
//   → 4xx/5xx { error: message lisible }
// Comme import-recipe : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { parseInput, suggestMeals } from './ideas.ts'

export interface Deps extends ModelDeps {
  /** Type de l'outil de recherche web (variante selon le modèle). */
  webSearchTool?: string
}

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse: parseInput,
    async run(input, options, { webSearchTool }) {
      const result = await suggestMeals(input, { ...options, webSearchTool })
      return {
        body: { ideas: result.ideas },
        log: { candidates: input.candidates.length, ideas: result.ideas.length, vegetarian: result.vegetarian, searches: result.searches, ...result.usage },
      }
    },
    logs: { done: 'idées trouvées', refused: 'idées refusées', failed: 'idées en erreur' },
    failure: 'La recherche d’idées a échoué.',
  })
}
