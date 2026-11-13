// Edge Function Supabase : coût réel de la clé Anthropic depuis la première recharge (Réglages → Consommation IA).
// Secrets : ANTHROPIC_ADMIN_KEY (facultatif : clé Admin sk-ant-admin…, sans elle le coût réel n'est pas proposé).

import { createSignedInCheck } from '../_shared/auth.ts'
import { createHandler } from './handler.ts'

Deno.serve(
  createHandler({
    adminKey: Deno.env.get('ANTHROPIC_ADMIN_KEY') || undefined,
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    fetch,
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
  }),
)
