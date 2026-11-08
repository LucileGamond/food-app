// Edge Function Supabase : idées de repas pour les prochains jours (recettes enregistrées et recherche web).
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut),
// WEB_SEARCH_TOOL (facultatif : type de l'outil de recherche web, web_search_20250305 par défaut).

import { createSignedInCheck } from '../_shared/auth.ts'
import { createUsageRecorder } from '../_shared/usage.ts'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    webSearchTool: Deno.env.get('WEB_SEARCH_TOOL') || undefined,
    fetchModel: fetch,
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
    recordUsage: createUsageRecorder(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), 'suggest-meals'),
  }),
)
