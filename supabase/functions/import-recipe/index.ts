// Edge Function Supabase : préremplit une recette à partir d'une URL.
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut),
// YOUTUBE_API_KEY (vidéos YouTube : sans elle, l'import d'une vidéo est refusé).

import { createSignedInCheck } from '../_shared/auth.ts'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    youtubeApiKey: Deno.env.get('YOUTUBE_API_KEY') || undefined,
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    fetchPage: fetch,
    fetchModel: fetch,
    resolveDns: (host, type) => Deno.resolveDns(host, type),
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
  }),
)
