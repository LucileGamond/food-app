// Edge Function Supabase (module Tricot) : lecture d'un patron PDF pour une taille, en étapes, et autres aides du
// module (étiquette de laine, questions, traduction, adaptation, idées, patron ajouté par un lien, compte Ravelry).
// Secrets : ANTHROPIC_API_KEY (obligatoire), ANTHROPIC_MODEL (facultatif, Haiku par défaut) ; RAVELRY_CLIENT_ID,
// RAVELRY_CLIENT_SECRET et RAVELRY_REDIRECT_URIS (facultatifs : connexion des comptes Ravelry, voir ravelryAuth.ts).

import { createClient } from '@supabase/supabase-js'
import { createSignedInCheck } from '../_shared/auth.ts'
import { createBudgetCheck } from '../_shared/budget.ts'
import { createUsageRecorder } from '../_shared/usage.ts'
import { createHandler } from './handler.ts'
import type { RavelryStore, RavelryTokens } from './ravelryAuth.ts'

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey ?? '', { auth: { persistSession: false } })

const tokenRow = (t: RavelryTokens) => ({
  access_token: t.accessToken,
  refresh_token: t.refreshToken,
  expires_at: new Date(t.expiresAt).toISOString(),
  updated_at: new Date().toISOString(),
})

/** Comptes et jetons Ravelry, avec la clé de service (tables fermées à l'application). */
const ravelryStore: RavelryStore = {
  async saveState({ state, profileId, verifier, redirectUri }) {
    // Une connexion en cours à la fois par personne.
    await db.from('ravelry_oauth_states').delete().eq('profile_id', profileId)
    const { error } = await db.from('ravelry_oauth_states').insert({ state, profile_id: profileId, code_verifier: verifier, redirect_uri: redirectUri })
    if (error) throw error
  },
  async takeState(state, profileId) {
    const { data, error } = await db
      .from('ravelry_oauth_states')
      .delete()
      .eq('state', state)
      .eq('profile_id', profileId)
      .select('code_verifier, redirect_uri, created_at')
      .maybeSingle()
    if (error) throw error
    return data ? { verifier: data.code_verifier as string, redirectUri: data.redirect_uri as string, createdAt: Date.parse(data.created_at as string) } : null
  },
  async saveAccount(profileId, username, tokens) {
    const { error } = await db.from('ravelry_accounts').upsert({ profile_id: profileId, username, updated_at: new Date().toISOString() })
    if (error) throw error
    const { error: tokenError } = await db.from('ravelry_tokens').upsert({ profile_id: profileId, ...tokenRow(tokens) })
    if (tokenError) throw tokenError
  },
  async loadTokens(profileId) {
    const { data, error } = await db.from('ravelry_tokens').select('access_token, refresh_token, expires_at').eq('profile_id', profileId).maybeSingle()
    if (error) throw error
    return data ? { accessToken: data.access_token as string, refreshToken: data.refresh_token as string | null, expiresAt: Date.parse(data.expires_at as string) } : null
  },
  async saveTokens(profileId, tokens) {
    const { error } = await db.from('ravelry_tokens').update(tokenRow(tokens)).eq('profile_id', profileId)
    if (error) throw error
  },
}

Deno.serve(
  createHandler({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    model: Deno.env.get('ANTHROPIC_MODEL') || undefined,
    fetchModel: fetch,
    fetchPage: fetch,
    resolveDns: (host, type) => Deno.resolveDns(host, type),
    ravelry: {
      clientId: Deno.env.get('RAVELRY_CLIENT_ID') || undefined,
      clientSecret: Deno.env.get('RAVELRY_CLIENT_SECRET') || undefined,
      redirectUris: (Deno.env.get('RAVELRY_REDIRECT_URIS') ?? '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
      fetch,
      store: serviceKey ? ravelryStore : undefined,
    },
    log: (message, data) => console.log(JSON.stringify({ message, ...data })),
    isSignedIn: createSignedInCheck(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!),
    recordUsage: createUsageRecorder(Deno.env.get('SUPABASE_URL')!, serviceKey, 'knit-pattern'),
    checkBudget: createBudgetCheck(Deno.env.get('SUPABASE_URL')!, serviceKey),
  }),
)
