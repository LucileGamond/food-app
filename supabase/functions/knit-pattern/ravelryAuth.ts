// Connexion d'un compte Ravelry (OAuth 2.1 : code d'autorisation + PKCE), pour chercher des patrons avec l'API de
// Ravelry au nom de la personne connectée.
//
//   1. { ravelry_start: { redirect_uri } }  → { url }       adresse d'autorisation de Ravelry (état et vérificateur gardés)
//   2. Ravelry renvoie vers redirect_uri?code&state (page /reglages/ravelry de l'application)
//   3. { ravelry_finish: { code, state } }  → { username }  code échangé contre les jetons, gardés côté serveur
//
// Les jetons (table ravelry_tokens) ne sont jamais lisibles par l'application ; le jeton d'accès est renouvelé avec le
// jeton de renouvellement (portée « offline_access ») quand il expire (jetons d'accès valables 1 heure).
// Secrets : RAVELRY_CLIENT_ID, RAVELRY_CLIENT_SECRET (facultatif en OAuth 2.1), RAVELRY_REDIRECT_URIS (adresses de
// retour autorisées, séparées par des virgules).

import { HttpError } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

// Adresses des apps OAuth 2.1 de Ravelry (les adresses www.ravelry.com/oauth2/… sont celles des anciennes apps OAuth 2.0).
export const RAVELRY_AUTHORIZE_URL = 'https://auth.ravelry.com/oauth2/auth'
export const RAVELRY_TOKEN_URL = 'https://auth.ravelry.com/oauth2/token'
export const RAVELRY_CURRENT_USER_URL = 'https://api.ravelry.com/current_user.json'
/**
 * Portées : « offline_access » pour obtenir un jeton de renouvellement ; « library-pdf » pour télécharger les PDF de la
 * bibliothèque Ravelry (import). Ravelry prévient que ces jetons expirent plus vite : le renouvellement s'en charge, et
 * s'il est refusé, il suffit de relier le compte à nouveau.
 */
export const RAVELRY_SCOPE = 'offline_access library-pdf'
/** Délai pour revenir de Ravelry. */
export const STATE_TTL_MS = 10 * 60_000
/** Jeton renouvelé un peu avant son expiration. */
const REFRESH_MARGIN_MS = 60_000
const TIMEOUT_MS = 10_000

export interface RavelryTokens {
  accessToken: string
  refreshToken: string | null
  /** Expiration, en millisecondes depuis l'époque. */
  expiresAt: number
}

/** Stockage côté serveur (clé de service) : états en attente, compte et jetons. */
export interface RavelryStore {
  saveState(state: { state: string; profileId: string; verifier: string; redirectUri: string }): Promise<void>
  /** L'état de cette personne, retiré (usage unique) ; null s'il n'existe pas. */
  takeState(state: string, profileId: string): Promise<{ verifier: string; redirectUri: string; createdAt: number } | null>
  saveAccount(profileId: string, username: string, tokens: RavelryTokens): Promise<void>
  loadTokens(profileId: string): Promise<RavelryTokens | null>
  saveTokens(profileId: string, tokens: RavelryTokens): Promise<void>
}

export interface RavelryOAuth {
  clientId?: string
  clientSecret?: string
  redirectUris: string[]
  fetch: typeof fetch
  store?: RavelryStore
  now?: () => number
}

export type RavelryOAuthReady = RavelryOAuth & { clientId: string; store: RavelryStore }

export function ravelryReady(config: RavelryOAuth | undefined): config is RavelryOAuthReady {
  return !!config?.clientId && !!config.store
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** Défi PKCE (S256) du vérificateur. */
export async function codeChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

export function parseRavelryStart(body: unknown): { redirectUri: string } | null {
  const data = asRecord(body)
  if (!('ravelry_start' in data)) return null
  const redirectUri = asRecord(data.ravelry_start).redirect_uri
  if (typeof redirectUri !== 'string' || !redirectUri) throw new HttpError('Adresse de retour manquante.', 400)
  return { redirectUri }
}

export function parseRavelryFinish(body: unknown): { code: string; state: string } | null {
  const data = asRecord(body)
  if (!('ravelry_finish' in data)) return null
  const { code, state } = asRecord(data.ravelry_finish)
  if (typeof code !== 'string' || !code || code.length > 2000 || typeof state !== 'string' || !state || state.length > 200) {
    throw new HttpError('Réponse de Ravelry incomplète.', 400)
  }
  return { code, state }
}

function ready(config: RavelryOAuth | undefined): RavelryOAuthReady {
  if (!ravelryReady(config)) throw new HttpError('La connexion à Ravelry n’est pas configurée.', 503)
  return config
}

/** Adresse d'autorisation de Ravelry ; l'état et le vérificateur PKCE sont gardés pour le retour. */
export async function startRavelry(input: { redirectUri: string }, profileId: string, config: RavelryOAuth | undefined): Promise<{ url: string }> {
  const c = ready(config)
  if (!c.redirectUris.includes(input.redirectUri)) throw new HttpError('Adresse de retour non autorisée.', 400)
  const state = randomToken()
  const verifier = randomToken()
  await c.store.saveState({ state, profileId, verifier, redirectUri: input.redirectUri })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: input.redirectUri,
    scope: RAVELRY_SCOPE,
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256',
  })
  return { url: `${RAVELRY_AUTHORIZE_URL}?${params}` }
}

/** Demande de jetons à Ravelry (code ou renouvellement). */
async function requestTokens(params: Record<string, string>, c: RavelryOAuthReady): Promise<RavelryTokens> {
  const body = new URLSearchParams({ ...params, client_id: c.clientId })
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
  if (c.clientSecret) headers.authorization = `Basic ${btoa(`${c.clientId}:${c.clientSecret}`)}`
  let response: Response
  try {
    response = await c.fetch(RAVELRY_TOKEN_URL, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new HttpError('Ravelry ne répond pas.', 503)
  }
  if (response.status === 400 || response.status === 401) throw new HttpError('Ravelry a refusé la connexion.', 401)
  if (!response.ok) throw new HttpError(`Ravelry a répondu par une erreur (${response.status}).`, 502)
  const data = asRecord(await response.json().catch(() => null))
  if (typeof data.access_token !== 'string' || !data.access_token) throw new HttpError('Réponse de Ravelry illisible.', 502)
  const expiresIn = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : (params.refresh_token ?? null),
    expiresAt: (c.now ?? Date.now)() + expiresIn * 1000,
  }
}

/** Retour de Ravelry : le code devient des jetons, gardés avec le nom du compte. */
export async function finishRavelry(input: { code: string; state: string }, profileId: string, config: RavelryOAuth | undefined): Promise<{ username: string }> {
  const c = ready(config)
  const pending = await c.store.takeState(input.state, profileId)
  if (!pending || (c.now ?? Date.now)() - pending.createdAt > STATE_TTL_MS) throw new HttpError('Connexion à Ravelry expirée : recommence.', 400)
  const tokens = await requestTokens({ grant_type: 'authorization_code', code: input.code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier }, c)
  let response: Response
  try {
    response = await c.fetch(RAVELRY_CURRENT_USER_URL, { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new HttpError('Ravelry ne répond pas.', 503)
  }
  const user = asRecord(asRecord(response.ok ? await response.json().catch(() => null) : null).user)
  const username = typeof user.username === 'string' && user.username.trim() ? user.username.trim().slice(0, 100) : 'Ravelry'
  await c.store.saveAccount(profileId, username, tokens)
  return { username }
}

/**
 * Jeton d'accès de cette personne, renouvelé s'il expire ; null si son compte n'est pas relié, si le renouvellement est
 * refusé (accès retiré sur Ravelry) ou si la connexion n'est pas configurée.
 */
export async function accessTokenFor(profileId: string | null, config: RavelryOAuth | undefined): Promise<string | null> {
  if (!profileId || !ravelryReady(config)) return null
  const tokens = await config.store.loadTokens(profileId)
  if (!tokens) return null
  if (tokens.expiresAt - REFRESH_MARGIN_MS > (config.now ?? Date.now)()) return tokens.accessToken
  if (!tokens.refreshToken) return null
  try {
    const renewed = await requestTokens({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, scope: RAVELRY_SCOPE }, config)
    await config.store.saveTokens(profileId, renewed)
    return renewed.accessToken
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null
    throw error
  }
}
