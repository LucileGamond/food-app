// Edge Function Supabase : idées de repas pour les prochains jours (recettes enregistrées et recherche web).
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut),
// WEB_SEARCH_TOOL (facultatif : type de l'outil de recherche web, web_search_20250305 par défaut).

import { createHandler } from './handler.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/** Demande au service d'authentification si le jeton appartient à un utilisateur connecté. */
async function isSignedIn(authorization: string | null): Promise<boolean> {
  if (!authorization?.startsWith('Bearer ')) return false
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization, apikey: SUPABASE_ANON_KEY } }).catch(() => null)
  if (!response?.ok) return false
  const user = (await response.json().catch(() => null)) as { id?: string } | null
  return Boolean(user?.id)
}

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    webSearchTool: Deno.env.get('WEB_SEARCH_TOOL') || undefined,
    fetchModel: fetch,
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn,
  }),
)
