import { COST_REPORT_URL, createHandler, MAX_AGE_MS, type Deps } from './handler.ts'

const SUPABASE = 'https://projet.supabase.co'
const NOW = new Date('2026-11-13T10:00:00Z')
const CREDITS = `${SUPABASE}/rest/v1/llm_credits?select=added_on&order=added_on.asc&limit=1`
const CACHE = `${SUPABASE}/rest/v1/llm_cost_cache?select=since,cost_usd,fetched_at`
const SAVE = `${SUPABASE}/rest/v1/llm_cost_cache`
const report = (page?: string) => `${COST_REPORT_URL}?starting_at=2026-11-01T00%3A00%3A00Z&limit=31${page ? `&page=${page}` : ''}`
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

type Route = Response | Error

function setup(routes: Record<string, Route>, overrides: Partial<Deps> = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const doFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = init?.method === 'POST' && url === SAVE ? `POST ${url}` : url
    const route = routes[key]
    if (!route) throw new Error(`URL inattendue : ${key}`)
    if (route instanceof Error) throw route
    return route.clone()
  })
  const log = vi.fn()
  const deps: Deps = {
    adminKey: 'sk-ant-admin01-x',
    supabaseUrl: SUPABASE,
    serviceKey: 'cle-service',
    fetch: doFetch,
    isSignedIn: async (authorization) => authorization === 'Bearer ok',
    now: () => NOW,
    log,
    ...overrides,
  }
  return { handle: createHandler(deps), calls, doFetch, log }
}

const post = (authorization = 'Bearer ok') => new Request('https://fn.test/llm-cost', { method: 'POST', headers: { authorization } })

async function call(handle: (r: Request) => Promise<Response>, authorization?: string) {
  const response = await handle(post(authorization))
  return { status: response.status, body: await response.json() }
}

const PAGE_1 = {
  data: [
    { starting_at: '2026-11-01T00:00:00Z', ending_at: '2026-11-02T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }] },
    { starting_at: '2026-11-02T00:00:00Z', ending_at: '2026-11-03T00:00:00Z', results: [] },
  ],
  has_more: true,
  next_page: 'page_2',
}
const PAGE_2 = { data: [{ starting_at: '2026-11-03T00:00:00Z', ending_at: '2026-11-04T00:00:00Z', results: [{ amount: '76.55', currency: 'USD' }] }], has_more: false, next_page: null }

describe('llm-cost', () => {
  it('exige une connexion et répond aux requêtes préalables', async () => {
    const { handle } = setup({})
    expect((await call(handle, 'Bearer anonyme')).status).toBe(401)
    expect((await handle(new Request('https://fn.test', { method: 'OPTIONS' }))).status).toBe(200)
    expect((await handle(new Request('https://fn.test', { method: 'GET' }))).status).toBe(405)
  })

  it('sans clé Admin : indisponible, sans rien appeler', async () => {
    const { handle, doFetch } = setup({}, { adminKey: undefined })
    expect(await call(handle)).toEqual({ status: 200, body: { available: false } })
    expect(doFetch).not.toHaveBeenCalled()
  })

  it('sans recharge : rien à calculer', async () => {
    const { handle } = setup({ [CREDITS]: json([]) })
    expect(await call(handle)).toEqual({ status: 200, body: { available: true, since: null } })
  })

  it('cache de moins de 48 h pour la même date de départ : renvoyé sans appeler Anthropic', async () => {
    const fetchedAt = new Date(NOW.getTime() - MAX_AGE_MS + 60_000).toISOString()
    const { handle, calls } = setup({ [CREDITS]: json([{ added_on: '2026-11-01' }]), [CACHE]: json([{ since: '2026-11-01', cost_usd: 1.5, fetched_at: fetchedAt }]) })
    expect(await call(handle)).toEqual({ status: 200, body: { available: true, since: '2026-11-01', costUsd: 1.5, fetchedAt } })
    expect(calls.some((c) => c.url.startsWith(COST_REPORT_URL))).toBe(false)
  })

  it('cache périmé ou autre date de départ : additionne toutes les pages du rapport de coût (centimes) et met le cache à jour', async () => {
    const old = new Date(NOW.getTime() - MAX_AGE_MS - 1).toISOString()
    const { handle, calls } = setup({
      [CREDITS]: json([{ added_on: '2026-11-01' }]),
      [CACHE]: json([{ since: '2026-11-01', cost_usd: 1, fetched_at: old }]),
      [report()]: json(PAGE_1),
      [report('page_2')]: json(PAGE_2),
      [`POST ${SAVE}`]: new Response(null, { status: 201 }),
    })
    expect(await call(handle)).toEqual({ status: 200, body: { available: true, since: '2026-11-01', costUsd: 2, fetchedAt: NOW.toISOString() } })

    const anthropic = calls.find((c) => c.url === report())!
    expect(anthropic.init?.headers).toEqual({ 'x-api-key': 'sk-ant-admin01-x', 'anthropic-version': '2026-10-21' })
    const save = calls.find((c) => c.init?.method === 'POST')!
    expect(save.init?.headers).toMatchObject({ apikey: 'cle-service', authorization: 'Bearer cle-service', prefer: 'resolution=merge-duplicates,return=minimal' })
    expect(JSON.parse(String(save.init?.body))).toEqual({ id: true, since: '2026-11-01', cost_usd: 2, fetched_at: NOW.toISOString() })
  })

  it('rapport indisponible : renvoie l’ancien cache signalé comme périmé, ou une erreur lisible', async () => {
    const old = '2026-11-01T00:00:00.000Z'
    const stale = setup({ [CREDITS]: json([{ added_on: '2026-11-01' }]), [CACHE]: json([{ since: '2026-11-01', cost_usd: 1, fetched_at: old }]), [report()]: json({}, 503) })
    expect(await call(stale.handle)).toEqual({
      status: 200,
      body: { available: true, since: '2026-11-01', costUsd: 1, fetchedAt: old, error: 'Le coût réel est indisponible pour l’instant.' },
    })
    expect(stale.log).toHaveBeenCalledWith('coût réel indisponible', expect.objectContaining({ status: 503 }))

    const refused = setup({ [CREDITS]: json([{ added_on: '2026-11-01' }]), [CACHE]: json([]), [report()]: json({}, 401) })
    expect(await call(refused.handle)).toEqual({ status: 200, body: { available: true, since: '2026-11-01', error: 'La clé Admin Anthropic est refusée.' } })

    const network = setup({ [CREDITS]: json([{ added_on: '2026-11-01' }]), [CACHE]: json([{ since: '2026-10-01', cost_usd: 9, fetched_at: old }]), [report()]: new Error('réseau') })
    expect((await call(network.handle)).body).toEqual({ available: true, since: '2026-11-01', error: 'Le coût réel est indisponible pour l’instant.' })
  })

  it('base inaccessible : erreur 500 lisible', async () => {
    const { handle } = setup({ [CREDITS]: json({}, 500) })
    expect(await call(handle)).toEqual({ status: 500, body: { error: 'Le coût réel est indisponible pour l’instant.' } })
    const noKey = setup({}, { serviceKey: undefined })
    expect((await call(noKey.handle)).status).toBe(500)
  })

  it('un échec d’écriture du cache n’empêche pas la réponse', async () => {
    const { handle, log } = setup({
      [CREDITS]: json([{ added_on: '2026-11-01' }]),
      [CACHE]: json([]),
      [report()]: json(PAGE_2),
      [`POST ${SAVE}`]: json({}, 400),
    })
    expect((await call(handle)).body).toMatchObject({ costUsd: 0.7655 })
    expect(log).toHaveBeenCalledWith('cache du coût non enregistré', expect.objectContaining({ status: 400 }))
  })
})
