// Logique de la fonction tidy-shopping, indépendante de Deno pour pouvoir être testée.
//
// POST { lines: [{ id, name, quantity, unit, aisle }] } → 200 { lines: [{ id, name, aisle, pantry }] }
//   → 4xx/5xx { error: message lisible }
// Comme import-recipe : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { parseInput, tidyLines } from './tidy.ts'

export type Deps = ModelDeps

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse: parseInput,
    async run(lines, options) {
      const result = await tidyLines(lines, options)
      return { body: { lines: result.lines }, log: { lines: lines.length, ...result.usage } }
    },
    logs: { done: 'regroupement réussi', refused: 'regroupement refusé', failed: 'regroupement en erreur' },
    failure: 'Le regroupement a échoué.',
  })
}
