import { createHandler, MAX_PAGE_BYTES, type Deps } from './handler.ts'

const PAGE_URL = 'https://cuisine.exemple.fr/crepes'

const RECIPE_HTML = `<!doctype html><html><head><meta charset="utf-8">
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Crêpes',
  recipeIngredient: ['250 g de farine'],
  recipeInstructions: 'Mélanger.',
  image: 'https://cdn.exemple.fr/crepes.jpg',
})}</script></head><body><p>Bla</p></body></html>`

const MODEL_REPLY = {
  content: [
    {
      type: 'tool_use',
      name: 'enregistrer_recette',
      input: { is_recipe: true, title: 'Crêpes', servings: 4, ingredients: [{ name: 'farine', quantity: 250, unit: 'g' }], steps: '1. Mélanger.', tags: ['dessert'] },
    },
  ],
  usage: { input_tokens: 300, output_tokens: 120 },
}

type Route = Response | (() => Response) | Error

function routes(map: Record<string, Route>) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input)
    const route = map[url]
    if (!route) throw new Error(`URL inattendue : ${url}`)
    if (route instanceof Error) throw route
    return typeof route === 'function' ? route() : route.clone()
  })
}

const html = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } })

function setup(pages: Record<string, Route> = {}, model: Route = new Response(JSON.stringify(MODEL_REPLY))) {
  const deps = {
    apiKey: 'test-key',
    fetchPage: routes({ [PAGE_URL]: html(RECIPE_HTML), 'https://cdn.exemple.fr/crepes.jpg': new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }), ...pages }),
    fetchModel: routes({ 'https://api.anthropic.com/v1/messages': model }),
    log: vi.fn<NonNullable<Deps['log']>>(),
    isSignedIn: vi.fn<Deps['isSignedIn']>(async (authorization) => authorization === 'Bearer jeton-utilisateur'),
  }
  return { deps, handle: createHandler(deps) }
}

const post = (body: unknown, authorization = 'Bearer jeton-utilisateur') =>
  new Request('https://fn.local/import-recipe', { method: 'POST', headers: { authorization }, body: typeof body === 'string' ? body : JSON.stringify(body) })

async function call(handle: (r: Request) => Promise<Response>, body: unknown) {
  const response = await handle(post(body))
  return { status: response.status, body: await response.json(), headers: response.headers }
}

describe('import-recipe', () => {
  it('importe une recette structurée avec sa photo', async () => {
    const { deps, handle } = setup()
    const result = await call(handle, { url: PAGE_URL, knownTags: ['dessert', 42] })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      recipe: { title: 'Crêpes', servings: 4, ingredients: [{ name: 'farine', quantity: 250, unit: 'g', note: null }], steps: '1. Mélanger.', tags: ['dessert'] },
      source: 'structured',
      image: { data: 'AQID', type: 'image/jpeg' },
    })
    expect(result.headers.get('access-control-allow-origin')).toBe('*')
    // Seules les données utiles partent au modèle
    const sent = JSON.parse(String(deps.fetchModel.mock.calls[0]![1]!.body)).messages[0].content as string
    expect(sent).toContain('Tags existants : dessert')
    expect(sent).not.toContain('Bla')
    expect(deps.log).toHaveBeenCalledWith('import réussi', expect.objectContaining({ source: 'structured', input_tokens: 300 }))
  })

  it('suit les redirections publiques et décode le jeu de caractères', async () => {
    const text = `<html><body><main><h1>Gâteau</h1><p>${'Mélanger les ingrédients. '.repeat(15)}</p></main></body></html>`
    const latin1 = Uint8Array.from([...text].map((c) => c.charCodeAt(0)))
    const { deps, handle } = setup({
      'https://exemple.fr/court': new Response(null, { status: 301, headers: { location: '/gateau' } }),
      'https://exemple.fr/gateau': new Response(latin1, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }),
    })
    const result = await call(handle, { url: 'https://exemple.fr/court' })
    expect(result.status).toBe(200)
    expect(result.body.source).toBe('text')
    expect(result.body.image).toBeNull()
    const sent = JSON.parse(String(deps.fetchModel.mock.calls[0]![1]!.body)).messages[0].content as string
    expect(sent).toContain('Page : https://exemple.fr/gateau')
    expect(sent).toContain('Gâteau')
  })

  it('refuse une redirection vers le réseau local', async () => {
    const { handle } = setup({ 'https://exemple.fr/piege': new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }) })
    expect(await call(handle, { url: 'https://exemple.fr/piege' })).toMatchObject({ status: 400, body: { error: 'Adresse non autorisée.' } })
  })

  it('refuse un nom de domaine qui pointe vers le réseau local', async () => {
    const { deps } = setup()
    const resolveDns = vi.fn(async (host: string, type: 'A' | 'AAAA') => (type === 'A' && host === 'piege.exemple.fr' ? ['169.254.169.254'] : []))
    const handle = createHandler({ ...deps, resolveDns })
    expect(await call(handle, { url: 'https://piege.exemple.fr/recette' })).toMatchObject({ status: 400, body: { error: 'Adresse non autorisée.' } })
    expect(deps.fetchPage).not.toHaveBeenCalled()
    expect(await call(handle, { url: 'https://piege.exemple.fr/recette', mode: 'title' })).toMatchObject({ status: 400 })
  })

  it('limite le nombre de redirections', async () => {
    const loop = () => new Response(null, { status: 302, headers: { location: 'https://exemple.fr/boucle' } })
    const { handle } = setup({ 'https://exemple.fr/boucle': loop })
    expect(await call(handle, { url: 'https://exemple.fr/boucle' })).toMatchObject({ status: 502, body: { error: 'Trop de redirections.' } })
  })

  it.each([
    ['URL absente', {}, 400, 'Adresse manquante'],
    ['URL locale', { url: 'http://localhost:54321/rest' }, 400, 'Adresse non autorisée.'],
  ])('valide la demande : %s', async (_label, body, status, error) => {
    const { deps, handle } = setup()
    expect(await call(handle, body)).toMatchObject({ status, body: { error: expect.stringContaining(error) } })
    expect(deps.fetchPage).not.toHaveBeenCalled()
  })

  it('refuse un appel sans utilisateur connecté (clé anonyme)', async () => {
    const { deps, handle } = setup()
    const response = await handle(post({ url: PAGE_URL }, 'Bearer cle-anonyme'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Connexion requise.' })
    expect(deps.isSignedIn).toHaveBeenCalledWith('Bearer cle-anonyme')
    expect(deps.fetchPage).not.toHaveBeenCalled()
  })

  it('refuse un corps illisible et les autres méthodes ; répond au pré-vol CORS', async () => {
    const { handle } = setup()
    expect(await call(handle, '{oups')).toMatchObject({ status: 400, body: { error: 'Requête invalide.' } })
    const get = await handle(new Request('https://fn.local/import-recipe'))
    expect(get.status).toBe(405)
    const options = await handle(new Request('https://fn.local/import-recipe', { method: 'OPTIONS' }))
    expect(options.status).toBe(200)
    expect(options.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  it('signale une configuration incomplète sans télécharger la page', async () => {
    const { deps } = setup()
    const handle = createHandler({ ...deps, apiKey: undefined })
    expect(await call(handle, { url: PAGE_URL })).toMatchObject({ status: 500, body: { error: 'Le service d’analyse est mal configuré.' } })
    expect(deps.fetchPage).not.toHaveBeenCalled()
  })

  it.each([
    ['site injoignable', new Error('dns'), 502, 'Impossible de joindre ce site.'],
    ['erreur du site', new Response('', { status: 404 }), 502, 'erreur (404)'],
    ['pas du HTML', new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }), 415, 'ne mène pas à une page web'],
    ['page trop grosse (annoncée)', html('x', { 'content-length': String(MAX_PAGE_BYTES + 1) }), 413, 'trop volumineuse'],
    ['page trop grosse (réelle)', html('x'.repeat(MAX_PAGE_BYTES + 10)), 413, 'trop volumineuse'],
    ['page vide ou protégée', html('<html><body><p>Activez JavaScript</p></body></html>'), 422, 'Impossible de lire cette page'],
  ])('erreur claire : %s', async (_label, route, status, error) => {
    const { handle } = setup({ [PAGE_URL]: route })
    expect(await call(handle, { url: PAGE_URL })).toMatchObject({ status, body: { error: expect.stringContaining(error) } })
  })

  it('remonte les erreurs du modèle et une page sans recette', async () => {
    let { handle } = setup({}, new Response('', { status: 529 }))
    expect(await call(handle, { url: PAGE_URL })).toMatchObject({ status: 503 })
    ;({ handle } = setup({}, new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'enregistrer_recette', input: { is_recipe: false } }] }))))
    expect(await call(handle, { url: PAGE_URL })).toMatchObject({ status: 422, body: { error: 'Aucune recette trouvée sur cette page.' } })
  })

  it('ignore une photo inaccessible ou d’un type non géré', async () => {
    let { handle } = setup({ 'https://cdn.exemple.fr/crepes.jpg': new Error('timeout') })
    expect((await call(handle, { url: PAGE_URL })).body.image).toBeNull()
    ;({ handle } = setup({ 'https://cdn.exemple.fr/crepes.jpg': new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) }))
    expect((await call(handle, { url: PAGE_URL })).body.image).toBeNull()
  })

  it('répond 500 sans détail sur une erreur imprévue', async () => {
    const { deps } = setup()
    const handle = createHandler({ ...deps, fetchModel: vi.fn(async () => ({ status: 200, ok: true, json: async () => Promise.reject(new Error('boom')) }) as unknown as Response) })
    expect(await call(handle, { url: PAGE_URL })).toMatchObject({ status: 500, body: { error: 'L’import a échoué.' } })
    expect(deps.log).toHaveBeenCalledWith('import en erreur', expect.anything())
  })

  it('mode titre : renvoie le titre de la page sans appeler le modèle', async () => {
    const { deps, handle } = setup({
      'https://exemple.fr/blog': html('<html><head><meta property="og:title" content="  Tarte   tatin  "></head><body></body></html>'),
      'https://exemple.fr/doc.pdf': new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
    })
    expect(await call(handle, { url: 'https://exemple.fr/blog', mode: 'title' })).toMatchObject({ status: 200, body: { title: 'Tarte tatin' } })
    expect(await call(handle, { url: 'https://exemple.fr/doc.pdf', mode: 'title' })).toMatchObject({ status: 200, body: { title: null } })
    expect(await call(handle, { url: 'http://localhost/', mode: 'title' })).toMatchObject({ status: 400 })
    expect(deps.fetchModel).not.toHaveBeenCalled()
    // Fonctionne même sans clé API
    const noKey = createHandler({ ...deps, apiKey: undefined })
    expect(await call(noKey, { url: 'https://exemple.fr/blog', mode: 'title' })).toMatchObject({ status: 200, body: { title: 'Tarte tatin' } })
    const anonymous = await noKey(post({ url: 'https://exemple.fr/blog', mode: 'title' }, 'Bearer cle-anonyme'))
    expect(anonymous.status).toBe(401)
  })
})
