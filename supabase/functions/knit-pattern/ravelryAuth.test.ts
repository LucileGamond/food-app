import { createHandler } from './handler.ts'
import {
  accessTokenFor,
  codeChallenge,
  finishRavelry,
  parseRavelryFinish,
  parseRavelryStart,
  RAVELRY_TOKEN_URL,
  ravelryReady,
  startRavelry,
  STATE_TTL_MS,
  type RavelryOAuth,
  type RavelryStore,
  type RavelryTokens,
} from './ravelryAuth.ts'

const REDIRECT = 'http://localhost:5173/reglages/ravelry'
const NOW = 1_800_000_000_000

/** Stockage en mémoire, comme les tables ravelry_*. */
function memoryStore() {
  const states = new Map<string, { profileId: string; verifier: string; redirectUri: string; createdAt: number }>()
  const accounts = new Map<string, string>()
  const tokens = new Map<string, RavelryTokens>()
  const store: RavelryStore = {
    async saveState({ state, profileId, verifier, redirectUri }) {
      states.set(state, { profileId, verifier, redirectUri, createdAt: NOW })
    },
    async takeState(state, profileId) {
      const found = states.get(state)
      if (!found || found.profileId !== profileId) return null
      states.delete(state)
      return found
    },
    async saveAccount(profileId, username, t) {
      accounts.set(profileId, username)
      tokens.set(profileId, t)
    },
    async loadTokens(profileId) {
      return tokens.get(profileId) ?? null
    },
    async saveTokens(profileId, t) {
      tokens.set(profileId, t)
    },
  }
  return { store, states, accounts, tokens }
}

function config(fetchRavelry: typeof fetch, extra: Partial<RavelryOAuth> = {}) {
  const memory = memoryStore()
  const c: RavelryOAuth = { clientId: 'client', clientSecret: 'secret', redirectUris: [REDIRECT], fetch: fetchRavelry, store: memory.store, now: () => NOW, ...extra }
  return { c, ...memory }
}

/** Ravelry : jetons, puis compte. */
function ravelryServer(token: Record<string, unknown> = { access_token: 'acces', refresh_token: 'renouvellement', expires_in: 3600 }, tokenStatus = 200) {
  return vi.fn<typeof fetch>(async (input) => {
    if (String(input) === RAVELRY_TOKEN_URL) return Response.json(token, { status: tokenStatus })
    return Response.json({ user: { username: 'lucile_tricote' } })
  })
}

describe('connexion Ravelry (OAuth 2.1 + PKCE)', () => {
  it('lit les demandes', () => {
    expect(parseRavelryStart({ ideas: {} })).toBeNull()
    expect(parseRavelryStart({ ravelry_start: { redirect_uri: REDIRECT } })).toEqual({ redirectUri: REDIRECT })
    expect(() => parseRavelryStart({ ravelry_start: {} })).toThrow('Adresse de retour manquante.')
    expect(parseRavelryFinish({})).toBeNull()
    expect(parseRavelryFinish({ ravelry_finish: { code: 'c', state: 's' } })).toEqual({ code: 'c', state: 's' })
    expect(() => parseRavelryFinish({ ravelry_finish: { code: '', state: 's' } })).toThrow('Réponse de Ravelry incomplète.')
    expect(() => parseRavelryFinish({ ravelry_finish: { code: 'c', state: 'x'.repeat(300) } })).toThrow('Réponse de Ravelry incomplète.')
  })

  it('prête seulement avec un identifiant client et un stockage', () => {
    expect(ravelryReady(undefined)).toBe(false)
    expect(ravelryReady({ redirectUris: [], fetch })).toBe(false)
    expect(ravelryReady({ clientId: 'c', redirectUris: [], fetch })).toBe(false)
    expect(ravelryReady({ clientId: 'c', redirectUris: [], fetch, store: memoryStore().store })).toBe(true)
  })

  it('défi PKCE S256 (exemple de la RFC 7636)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('début : adresse d’autorisation avec état et défi ; état gardé pour cette personne', async () => {
    const { c, states } = config(ravelryServer())
    const { url } = await startRavelry({ redirectUri: REDIRECT }, 'u1', c)
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://auth.ravelry.com/oauth2/auth')
    const params = Object.fromEntries(parsed.searchParams)
    expect(params).toMatchObject({ response_type: 'code', client_id: 'client', redirect_uri: REDIRECT, scope: 'offline_access', code_challenge_method: 'S256' })
    const saved = states.get(params.state!)!
    expect(saved).toMatchObject({ profileId: 'u1', redirectUri: REDIRECT })
    expect(params.code_challenge).toBe(await codeChallenge(saved.verifier))
    expect(saved.verifier.length).toBeGreaterThanOrEqual(43)
  })

  it('début refusé : adresse de retour non autorisée, ou connexion non configurée', async () => {
    const { c } = config(ravelryServer())
    await expect(startRavelry({ redirectUri: 'https://pirate.exemple/' }, 'u1', c)).rejects.toThrow('Adresse de retour non autorisée.')
    await expect(startRavelry({ redirectUri: REDIRECT }, 'u1', { ...c, clientId: undefined })).rejects.toThrow('La connexion à Ravelry n’est pas configurée.')
  })

  it('retour : code échangé (PKCE, secret client), compte et jetons gardés, état à usage unique', async () => {
    const fetchRavelry = ravelryServer()
    const { c, accounts, tokens, states } = config(fetchRavelry)
    const { url } = await startRavelry({ redirectUri: REDIRECT }, 'u1', c)
    const state = new URL(url).searchParams.get('state')!
    const verifier = states.get(state)!.verifier

    expect(await finishRavelry({ code: 'le-code', state }, 'u1', c)).toEqual({ username: 'lucile_tricote' })
    const [tokenUrl, init] = fetchRavelry.mock.calls[0]!
    expect(tokenUrl).toBe(RAVELRY_TOKEN_URL)
    expect(Object.fromEntries(new URLSearchParams(String(init!.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'le-code',
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      client_id: 'client',
    })
    expect((init!.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('client:secret')}`)
    expect((fetchRavelry.mock.calls[1]![1]!.headers as Record<string, string>).authorization).toBe('Bearer acces')
    expect(accounts.get('u1')).toBe('lucile_tricote')
    expect(tokens.get('u1')).toEqual({ accessToken: 'acces', refreshToken: 'renouvellement', expiresAt: NOW + 3_600_000 })
    // Rejouer le même retour : refusé
    await expect(finishRavelry({ code: 'le-code', state }, 'u1', c)).rejects.toThrow('Connexion à Ravelry expirée : recommence.')
  })

  it('retour refusé : état d’une autre personne, état expiré, code refusé par Ravelry', async () => {
    const { c } = config(ravelryServer())
    const state = new URL((await startRavelry({ redirectUri: REDIRECT }, 'u1', c)).url).searchParams.get('state')!
    await expect(finishRavelry({ code: 'c', state }, 'u2', c)).rejects.toThrow('Connexion à Ravelry expirée : recommence.')

    const late = config(ravelryServer(), { now: () => NOW + STATE_TTL_MS + 1 })
    const lateState = new URL((await startRavelry({ redirectUri: REDIRECT }, 'u1', late.c)).url).searchParams.get('state')!
    await expect(finishRavelry({ code: 'c', state: lateState }, 'u1', late.c)).rejects.toThrow('Connexion à Ravelry expirée : recommence.')

    const refused = config(ravelryServer({ error: 'invalid_grant' }, 400))
    const refusedState = new URL((await startRavelry({ redirectUri: REDIRECT }, 'u1', refused.c)).url).searchParams.get('state')!
    await expect(finishRavelry({ code: 'c', state: refusedState }, 'u1', refused.c)).rejects.toThrow('Ravelry a refusé la connexion.')
    expect(refused.accounts.size).toBe(0)
  })

  it('sans secret client (client public) : pas d’en-tête Basic ; nom inconnu : « Ravelry » ; durée par défaut', async () => {
    const fetchRavelry = vi.fn<typeof fetch>(async (input) => (String(input) === RAVELRY_TOKEN_URL ? Response.json({ access_token: 'a' }) : new Response('', { status: 500 })))
    const { c, tokens } = config(fetchRavelry, { clientSecret: undefined })
    const state = new URL((await startRavelry({ redirectUri: REDIRECT }, 'u1', c)).url).searchParams.get('state')!
    expect(await finishRavelry({ code: 'c', state }, 'u1', c)).toEqual({ username: 'Ravelry' })
    expect((fetchRavelry.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBeUndefined()
    expect(tokens.get('u1')).toEqual({ accessToken: 'a', refreshToken: null, expiresAt: NOW + 3_600_000 })
  })

  it('erreurs de Ravelry lisibles : pas de réponse, erreur, réponse illisible', async () => {
    for (const [fetchRavelry, message] of [
      [vi.fn<typeof fetch>().mockRejectedValue(new TypeError('réseau')), 'Ravelry ne répond pas.'],
      [vi.fn<typeof fetch>(async () => new Response('', { status: 503 })), 'Ravelry a répondu par une erreur (503).'],
      [vi.fn<typeof fetch>(async () => Response.json({ token: 'x' })), 'Réponse de Ravelry illisible.'],
    ] as const) {
      const { c } = config(fetchRavelry)
      const state = new URL((await startRavelry({ redirectUri: REDIRECT }, 'u1', c)).url).searchParams.get('state')!
      await expect(finishRavelry({ code: 'c', state }, 'u1', c)).rejects.toThrow(message)
    }
  })

  it('jeton d’accès : valide tel quel, renouvelé s’il expire, null si non relié ou accès retiré', async () => {
    const fetchRavelry = ravelryServer({ access_token: 'neuf', expires_in: 7200 })
    const { c, tokens } = config(fetchRavelry)
    expect(await accessTokenFor(null, c)).toBeNull()
    expect(await accessTokenFor('u1', c)).toBeNull()
    expect(await accessTokenFor('u1', undefined)).toBeNull()

    tokens.set('u1', { accessToken: 'valide', refreshToken: 'r', expiresAt: NOW + 3_600_000 })
    expect(await accessTokenFor('u1', c)).toBe('valide')
    expect(fetchRavelry).not.toHaveBeenCalled()

    // Expire dans moins d'une minute : renouvelé, l'ancien jeton de renouvellement est gardé si Ravelry n'en donne pas
    tokens.set('u1', { accessToken: 'vieux', refreshToken: 'r', expiresAt: NOW + 30_000 })
    expect(await accessTokenFor('u1', c)).toBe('neuf')
    expect(Object.fromEntries(new URLSearchParams(String(fetchRavelry.mock.calls[0]![1]!.body)))).toEqual({ grant_type: 'refresh_token', refresh_token: 'r', scope: 'offline_access', client_id: 'client' })
    expect(tokens.get('u1')).toEqual({ accessToken: 'neuf', refreshToken: 'r', expiresAt: NOW + 7_200_000 })

    // Sans jeton de renouvellement, ou renouvellement refusé : plus d'accès
    tokens.set('u1', { accessToken: 'vieux', refreshToken: null, expiresAt: NOW - 1 })
    expect(await accessTokenFor('u1', c)).toBeNull()
    const revoked = config(ravelryServer({ error: 'invalid_grant' }, 401))
    revoked.tokens.set('u1', { accessToken: 'vieux', refreshToken: 'r', expiresAt: NOW - 1 })
    expect(await accessTokenFor('u1', revoked.c)).toBeNull()
    // Ravelry en panne : l'erreur remonte
    const down = config(ravelryServer({}, 500))
    down.tokens.set('u1', { accessToken: 'vieux', refreshToken: 'r', expiresAt: NOW - 1 })
    await expect(accessTokenFor('u1', down.c)).rejects.toThrow('Ravelry a répondu par une erreur (500).')
  })

  it('le handler relie un compte sans le modèle (ni clé ni budget)', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const checkBudget = vi.fn(async () => 'Budget dépassé.')
    const { c, accounts } = config(ravelryServer())
    const handle = createHandler({ apiKey: undefined, fetchModel, checkBudget, isSignedIn: async () => 'u1', ravelry: c })
    const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

    const start = await handle(post({ ravelry_start: { redirect_uri: REDIRECT } }))
    expect(start.status).toBe(200)
    const state = new URL((await start.json()).url).searchParams.get('state')
    const finish = await handle(post({ ravelry_finish: { code: 'c', state } }))
    expect(finish.status).toBe(200)
    expect(await finish.json()).toEqual({ username: 'lucile_tricote' })
    expect(accounts.get('u1')).toBe('lucile_tricote')
    expect(fetchModel).not.toHaveBeenCalled()
    expect(checkBudget).not.toHaveBeenCalled()
  })

  it('le handler refuse sans identité de la personne, et sans configuration', async () => {
    const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })
    const anonymous = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => true, ravelry: config(ravelryServer()).c })
    expect((await anonymous(post({ ravelry_start: { redirect_uri: REDIRECT } }))).status).toBe(401)
    const unconfigured = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1' })
    const response = await unconfigured(post({ ravelry_start: { redirect_uri: REDIRECT } }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'La connexion à Ravelry n’est pas configurée.' })
  })
})
