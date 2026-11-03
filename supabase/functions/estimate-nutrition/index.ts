// Edge Function Supabase : calories et macros d'une recette d'après la table Ciqual (ANSES), sur demande.
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut).

import { createSignedInCheck } from '../_shared/auth.ts'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    fetchModel: fetch,
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
  }),
)
