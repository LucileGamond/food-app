// Logique de la fonction knit-pattern (module Tricot), indépendante de Deno pour pouvoir être testée.
//
// POST { pdf: base64, size }
//   → 200 { title, sizes, steps: [{ title, instructions, totalRows, stitches, sections }] }
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { parseInput, readPattern } from './pattern.ts'

export type Deps = ModelDeps

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse: parseInput,
    async run(input, options) {
      const { pattern, usage } = await readPattern(input, options)
      return { body: pattern, log: { steps: pattern.steps.length, kb: Math.round(input.pdf.length / 1365), ...usage } }
    },
    logs: { done: 'patron lu', refused: 'patron refusé', failed: 'patron en erreur' },
    failure: 'La lecture du patron a échoué.',
  })
}
