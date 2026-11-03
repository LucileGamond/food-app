import { createHandler, MAX_PASTED_CHARS, type Deps } from './handler.ts'
import { buildSearchMessage, descriptionLinks, fetchYoutubeVideo, isInstagram, NOT_WRITTEN, sanitizeFound, videoText, youtubeId, type YoutubeVideo } from './video.ts'

const ID = 'vJj1UNgH868'
const YOUTUBE = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ID}&key=yt-key`
const THUMB = 'https://i.ytimg.com/vi/x/maxresdefault.jpg'
const BLOG = 'https://www.sacreeplanche.fr/gaufres-brocolis/'
const MODEL = 'https://api.anthropic.com/v1/messages'

const video = (description: string) =>
  new Response(
    JSON.stringify({
      items: [{ snippet: { title: 'Gaufres de brocolis', channelTitle: 'Sacrée Planche', description, thumbnails: { high: { url: 'https://i.ytimg.com/vi/x/hq.jpg' }, maxres: { url: THUMB } } } }],
    }),
  )

const recipe = (input: Record<string, unknown>) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'enregistrer_recette', input }], usage: { input_tokens: 300, output_tokens: 100 } }))
const FULL = { is_recipe: true, title: 'Barres framboise', servings: 8, ingredients: [{ name: 'flocons d’avoine', quantity: 100, unit: 'g' }, { name: 'framboises', quantity: 200, unit: 'g' }], steps: '1. Mélanger.', tags: [] }
const NONE = { is_recipe: false, title: '', servings: null, ingredients: [], steps: '', tags: [] }
const search = (url: string | null, resultUrl = BLOG) =>
  new Response(
    JSON.stringify({
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'Sacrée Planche gaufres brocolis' } },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: resultUrl, title: 'Gaufres de brocolis' }] },
        { type: 'tool_use', name: 'page_recette', input: { url } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 2000, output_tokens: 50 },
    }),
  )
const BLOG_HTML = `<!doctype html><html><head><meta charset="utf-8"><script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Gaufres de brocolis',
  recipeIngredient: ['300 g de brocolis', '2 œufs'],
  recipeInstructions: 'Mixer, cuire.',
})}</script></head><body></body></html>`

/** Réponses du modèle dans l'ordre des appels. */
function sequence(...responses: Response[]) {
  let i = 0
  return () => responses[Math.min(i++, responses.length - 1)]!
}

function setup(pages: Record<string, Response | (() => Response)>, model: () => Response, overrides: Partial<Deps> = {}) {
  const route = (map: Record<string, Response | (() => Response)>) =>
    vi.fn(async (input: string | URL | Request) => {
      const r = map[String(input)]
      if (!r) throw new Error(`URL inattendue : ${String(input)}`)
      return typeof r === 'function' ? r() : r.clone()
    })
  const deps: Deps = {
    apiKey: 'k',
    youtubeApiKey: 'yt-key',
    fetchPage: route({ [THUMB]: new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } }), ...pages }),
    fetchModel: route({ [MODEL]: model }),
    log: vi.fn(),
    isSignedIn: vi.fn(async () => true),
    ...overrides,
  }
  const handle = createHandler(deps)
  const call = async (body: unknown) => {
    const response = await handle(new Request('https://fn.local/import-recipe', { method: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  }
  return { deps, call }
}

describe('adresses de vidéos', () => {
  it.each([
    ['https://www.youtube.com/shorts/vJj1UNgH868', ID],
    ['https://youtube.com/watch?v=vJj1UNgH868&t=12', ID],
    ['https://m.youtube.com/watch?v=vJj1UNgH868', ID],
    ['https://youtu.be/vJj1UNgH868?si=abc', ID],
    ['https://www.youtube.com/live/vJj1UNgH868', ID],
    ['https://www.youtube.com/embed/vJj1UNgH868', ID],
    ['https://www.youtube.com/@chaine', null],
    ['https://www.youtube.com/watch?v=court', null],
    ['https://www.marmiton.org/recettes/a.aspx', null],
  ])('%s → %s', (url, id) => {
    expect(youtubeId(new URL(url))).toBe(id)
  })

  it('reconnaît Instagram', () => {
    expect(isInstagram(new URL('https://www.instagram.com/reel/DfIBDEIIwic/?psln=x'))).toBe(true)
    expect(isInstagram(new URL('https://instagr.am/p/abc'))).toBe(true)
    expect(isInstagram(new URL('https://notinstagram.com/'))).toBe(false)
  })

  it('garde les liens utiles de la description', () => {
    expect(
      descriptionLinks('Recette sur https://www.sacreeplanche.fr/gaufres/. Insta : https://instagram.com/x — code https://amzn.to/abc et https://www.sacreeplanche.fr/gaufres/'),
    ).toEqual(['https://www.sacreeplanche.fr/gaufres/'])
  })
})

describe('lecture de la vidéo', () => {
  const v: YoutubeVideo = { id: ID, title: 'Gaufres', channel: 'Sacrée Planche', description: 'La recette est sur le blog', thumbnail: null }

  it('lit titre, chaîne, description et la plus grande miniature', async () => {
    const fetch = vi.fn(async () => video('Desc'))
    expect(await fetchYoutubeVideo(ID, 'yt-key', fetch)).toEqual({ id: ID, title: 'Gaufres de brocolis', channel: 'Sacrée Planche', description: 'Desc', thumbnail: THUMB })
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(YOUTUBE)
  })

  it.each([
    [new Response(JSON.stringify({ items: [] })), 'Vidéo introuvable'],
    [new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 }), 'YouTube a répondu par une erreur (403)'],
    [new Error('réseau'), 'Impossible de joindre YouTube'],
  ])('erreur YouTube (%#)', async (response, message) => {
    const fetch = vi.fn(async () => {
      if (response instanceof Error) throw response
      return response
    })
    await expect(fetchYoutubeVideo(ID, 'k', fetch)).rejects.toThrow(message)
  })

  it('décrit la vidéo au modèle', () => {
    expect(videoText(v)).toBe('Vidéo YouTube « Gaufres », chaîne « Sacrée Planche ».\n\nDescription de la vidéo :\nLa recette est sur le blog')
    expect(buildSearchMessage(v, [BLOG])).toContain(`Liens de la description : ${BLOG}`)
  })

  it('n’accepte qu’une adresse trouvée par la recherche ou donnée par la description', () => {
    const blocks = [{ type: 'web_search_tool_result', content: [{ url: BLOG, title: 't' }] }]
    expect(sanitizeFound({ url: 'https://sacreeplanche.fr/gaufres-brocolis' }, blocks, [])).toBe(BLOG)
    expect(sanitizeFound({ url: 'https://inventee.fr/recette' }, blocks, [])).toBeNull()
    expect(sanitizeFound({ url: 'https://blog.fr/a' }, [], ['https://blog.fr/a'])).toBe('https://blog.fr/a')
    expect(sanitizeFound({ url: null }, blocks, [])).toBeNull()
    expect(sanitizeFound(null, blocks, [])).toBeNull()
  })
})

describe('import d’une vidéo YouTube', () => {
  const url = `https://www.youtube.com/shorts/${ID}`

  it('recette dans la description : import direct, miniature en photo', async () => {
    const { call, deps } = setup({ [YOUTUBE]: video('LA RECETTE : 100 g de flocons…') }, sequence(recipe(FULL)))
    const result = await call({ url })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ source: 'video', recipe: { title: 'Barres framboise' }, image: { type: 'image/jpeg' } })
    expect(result.body.foundUrl).toBeUndefined()
    expect(deps.fetchModel).toHaveBeenCalledTimes(1)
  })

  it('recette sur le blog : trouvée par la recherche, importée depuis la page, source = site', async () => {
    const { call, deps } = setup({ [YOUTUBE]: video('La recette est sur le blog !'), [BLOG]: new Response(BLOG_HTML, { headers: { 'content-type': 'text/html' } }) }, sequence(recipe(NONE), search(BLOG), recipe({ ...FULL, title: 'Gaufres de brocolis' })))
    const result = await call({ url })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ source: 'video', foundUrl: BLOG, recipe: { title: 'Gaufres de brocolis', source: 'sacreeplanche.fr' }, image: { type: 'image/jpeg' } })
    expect(deps.fetchModel).toHaveBeenCalledTimes(3)
    expect(deps.log).toHaveBeenCalledWith('import réussi', expect.objectContaining({ source: 'video' }))
  })

  it('description trop pauvre (un seul ingrédient) : recherche aussi', async () => {
    const { call } = setup({ [YOUTUBE]: video('Avec du brocoli') }, sequence(recipe({ ...FULL, ingredients: [{ name: 'brocoli', quantity: null, unit: null }] }), search(null)))
    expect(await call({ url })).toEqual({ status: 422, body: { error: NOT_WRITTEN } })
  })

  it('adresse inventée ou page illisible : recette non trouvée', async () => {
    let { call } = setup({ [YOUTUBE]: video('') }, sequence(recipe(NONE), search('https://inventee.fr/x')))
    expect((await call({ url })).body).toEqual({ error: NOT_WRITTEN })
    ;({ call } = setup({ [YOUTUBE]: video(''), [BLOG]: new Response('', { status: 404 }) }, sequence(recipe(NONE), search(BLOG))))
    expect(await call({ url })).toEqual({ status: 422, body: { error: NOT_WRITTEN } })
  })

  it('sans clé YouTube, ou vidéo introuvable', async () => {
    let { call } = setup({}, sequence(recipe(FULL)), { youtubeApiKey: undefined })
    expect(await call({ url })).toEqual({ status: 500, body: { error: 'La lecture des vidéos YouTube n’est pas configurée.' } })
    ;({ call } = setup({ [YOUTUBE]: new Response(JSON.stringify({ items: [] })) }, sequence(recipe(FULL))))
    expect((await call({ url })).status).toBe(404)
  })

  it('appels lents : arrêt avec un message clair avant la coupure de la fonction', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const replies = sequence(recipe(NONE), search(BLOG), recipe(FULL))
      // Chaque réponse du modèle prend 70 s : après la recherche, plus le temps de lire la page trouvée.
      const slow = () => {
        vi.setSystemTime(Date.now() + 70_000)
        return replies()
      }
      const { call, deps } = setup({ [YOUTUBE]: video(''), [BLOG]: new Response(BLOG_HTML, { headers: { 'content-type': 'text/html' } }) }, slow)
      const { status, body } = await call({ url })
      expect(status).toBe(504)
      expect(body.error).toMatch(/prend trop de temps/)
      expect(deps.fetchPage).not.toHaveBeenCalledWith(BLOG, expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('erreur du modèle sur la description : remontée telle quelle', async () => {
    const { call } = setup({ [YOUTUBE]: video('x') }, sequence(new Response('', { status: 529 })))
    expect((await call({ url })).status).toBe(503)
  })
})

describe('Instagram et texte collé', () => {
  it('un lien Instagram demande de coller la légende', async () => {
    const { call, deps } = setup({}, sequence(recipe(FULL)))
    const result = await call({ url: 'https://www.instagram.com/reel/DfIBDEIIwic/' })
    expect(result).toEqual({ status: 422, body: { error: 'Instagram ne laisse pas lire ses publications : colle la légende du reel pour importer la recette.' } })
    expect(deps.fetchPage).not.toHaveBeenCalled()
  })

  it('importe la légende collée, avec le lien de la publication', async () => {
    const { call, deps } = setup({}, sequence(recipe(FULL)))
    const result = await call({ mode: 'text', text: 'Barres framboise 🍓 100 g de flocons, 200 g de framboises…', url: 'https://www.instagram.com/reel/abc/', knownTags: ['dessert'] })
    expect(result).toMatchObject({ status: 200, body: { source: 'text', image: null, recipe: { title: 'Barres framboise' } } })
    const [, init] = vi.mocked(deps.fetchModel).mock.calls[0]!
    const sent = JSON.parse(String(init?.body)) as { messages: { content: string }[] }
    expect(sent.messages[0]!.content).toContain('Page : https://www.instagram.com/reel/abc/')
    expect(sent.messages[0]!.content).toContain('200 g de framboises')
  })

  it.each([
    [{ mode: 'text', text: 'trop court' }, 400, 'Colle le texte de la recette'],
    [{ mode: 'text', text: 'x'.repeat(MAX_PASTED_CHARS + 1) }, 413, 'Texte trop long.'],
    [{ mode: 'text', text: 'une recette assez longue pour passer', url: 'http://localhost/x' }, 400, ''],
  ])('refuse un texte invalide (%#)', async (body, status, message) => {
    const { call } = setup({}, sequence(recipe(FULL)))
    const result = await call(body)
    expect(result.status).toBe(status)
    expect(result.body.error).toContain(message)
  })

  it('texte sans recette', async () => {
    const { call } = setup({}, sequence(recipe(NONE)))
    expect(await call({ mode: 'text', text: 'Trop bon ce week-end avec les copains !' })).toEqual({ status: 422, body: { error: 'Aucune recette trouvée dans ce texte.' } })
  })
})
