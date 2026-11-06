// Logique de la fonction estimate-nutrition, indépendante de Deno pour pouvoir être testée.
//
// POST { title, servings, ingredients: [{ name, quantity, unit, note }] }
//   → 200 { per, kcal, protein, carbs, fat, ingredients: [{ name, food, grams, kcal }] }
//   → 4xx/5xx { error: message lisible }
// Comme tidy-shopping : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { estimateNutrition, parseInput } from './nutrition.ts'

export type Deps = ModelDeps

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse: parseInput,
    async run(input, options) {
      const { estimate, usage } = await estimateNutrition(input, options)
      return { body: estimate, log: { ingredients: input.ingredients.length, counted: estimate.ingredients.filter((i) => i.kcal !== null).length, ...usage } }
    },
    logs: { done: 'calcul réussi', refused: 'calcul refusé', failed: 'calcul en erreur' },
    failure: 'Le calcul des calories a échoué.',
  })
}
