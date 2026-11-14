// Edge Function Supabase (module Tricot) : lecture d'un patron PDF pour une taille, en étapes, et autres aides du
// module (étiquette de laine, questions, traduction, adaptation, idées, patron ajouté par un lien).
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut).

import { createSignedInCheck } from '../_shared/auth.ts'
import { createBudgetCheck } from '../_shared/budget.ts'
import { createUsageRecorder } from '../_shared/usage.ts'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    fetchModel: fetch,
    fetchPage: fetch,
    resolveDns: (host, type) => Deno.resolveDns(host, type),
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
    recordUsage: createUsageRecorder(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'knit-pattern'),
    checkBudget: createBudgetCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
  }),
)
