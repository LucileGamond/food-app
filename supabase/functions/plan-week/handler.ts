// Logique de la fonction plan-week, indépendante de Deno pour pouvoir être testée.
//
// POST { start, people, slots, dishes } → 200 { meals: [{ slot, dishId, cookId, why }] }
//                                       → 4xx/5xx { error: message lisible }

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { parseInput, planWeek } from './plan.ts'

export type Deps = ModelDeps

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse: parseInput,
    async run(input, options) {
      const result = await planWeek(input, options)
      return {
        body: { meals: result.meals },
        log: { slots: input.slots.length, dishes: input.dishes.length, meals: result.meals.length, ...result.usage },
      }
    },
    logs: { done: 'semaine planifiée', refused: 'planification refusée', failed: 'planification en erreur' },
    failure: 'La planification a échoué.',
  })
}
