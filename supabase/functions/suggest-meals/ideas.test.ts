import { createHandler, type Deps } from './handler.ts'
import {
  buildUserMessage,
  foodWords,
  MAX_CANDIDATES,
  MAX_RECENT,
  parseInput,
  pickVaried,
  sanitizeIdeas,
  searchResultUrls,
  suggestMeals,
  type Idea,
  type SuggestInput,
} from './ideas.ts'

const INPUT: SuggestInput = {
  today: '2026-10-27',
  candidates: [
    { id: 'r1', title: 'Curry de lentilles', ingredients: ['lentilles corail', 'lait de coco', 'riz'], tags: ['végé'] },
    { id: 'r2', title: 'Poulet basquaise', ingredients: ['poulet', 'poivrons', 'riz'], tags: [] },
  ],
  recent: ['Tartiflette'],
}

// Résultat de recherche web tel que renvoyé par l'API (outil serveur).
const SEARCH = [
  { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'recette courge pois chiches' } },
  {
    type: 'web_search_tool_result',
    tool_use_id: 's1',
    content: [
      { type: 'web_search_result', url: 'https://www.marmiton.org/recettes/curry-courge-pois-chiches.aspx', title: 'Curry de courge aux pois chiches' },
      { type: 'web_search_result', url: 'https://cuisine.journaldesfemmes.fr/recette/saumon-poireaux', title: 'Saumon aux poireaux' },
      { type: 'web_search_result', url: 'https://www.750g.com/gratin-de-chou-fleur.htm', title: 'Gratin de chou-fleur' },
    ],
  },
]

const idea = (overrides: Record<string, unknown>) => ({
  source: 'web',
  recipe_id: null,
  title: 'Plat',
  url: null,
  site: null,
  protein: 'œufs',
  vegetables: ['courge'],
  starch: 'riz',
  vegetarian: true,
  why: 'De saison',
  ...overrides,
})

const IDEAS = [
  idea({ source: 'saved', recipe_id: 'r1', title: 'Titre inventé', protein: 'lentilles', vegetables: ['carotte'], starch: 'riz' }),
  idea({ title: 'Curry de courge', url: 'https://marmiton.org/recettes/curry-courge-pois-chiches.aspx?utm=x#top', site: 'Marmiton', protein: 'pois chiches', starch: 'semoule' }),
  idea({ title: 'Saumon aux poireaux', url: 'https://cuisine.journaldesfemmes.fr/recette/saumon-poireaux/', site: '', protein: 'saumon', vegetables: ['poireau'], starch: 'pommes de terre', vegetarian: false }),
  idea({ source: 'saved', recipe_id: 'r2', protein: 'poulet', vegetables: ['poivron'], vegetarian: false }),
]

const response = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status })
const turn = (content: unknown[], stop_reason = 'tool_use') => response({ content, stop_reason, usage: { input_tokens: 1000, output_tokens: 200 } })
const final = (ideas: unknown[]) => turn([...SEARCH, { type: 'tool_use', id: 't1', name: 'proposer_repas', input: { idees: ideas } }])

function fakeFetch(...responses: (Response | Error)[]) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift()
    if (!next) throw new Error('appel en trop')
    if (next instanceof Error) throw next
    return next
  })
}

const sent = (doFetch: ReturnType<typeof fakeFetch>, call = 0) => JSON.parse(doFetch.mock.calls[call]![1]!.body as string)

describe('parseInput', () => {
  it('valide et borne l’entrée', () => {
    expect(
      parseInput({
        today: '2026-10-27',
        candidates: [
          { id: ' r1 ', title: '  Curry   de lentilles ', ingredients: ['riz', 'riz', '', ...Array.from({ length: 20 }, (_, i) => `i${i}`)], tags: ['végé'] },
          { id: 'r1', title: 'doublon' },
        ],
        recent: ['  Tartiflette ', '', 'Tartiflette'],
      }),
    ).toEqual({
      today: '2026-10-27',
      candidates: [{ id: 'r1', title: 'Curry de lentilles', ingredients: ['riz', ...Array.from({ length: 14 }, (_, i) => `i${i}`)], tags: ['végé'] }],
      recent: ['Tartiflette'],
    })
    expect(parseInput({ today: '2026-10-27' })).toEqual({ today: '2026-10-27', candidates: [], recent: [] })
  })

  it.each([
    [null, 'Date invalide.'],
    [{ today: '27/10/2026' }, 'Date invalide.'],
    [{ today: '2026-13-45' }, 'Date invalide.'],
    [{ today: '2026-10-27', candidates: Array.from({ length: MAX_CANDIDATES + 1 }, (_, i) => ({ id: `${i}`, title: 'x' })) }, '80 recettes au plus.'],
    [{ today: '2026-10-27', candidates: [{ id: 'r1', title: ' ' }] }, 'Recette invalide.'],
    [{ today: '2026-10-27', recent: Array.from({ length: MAX_RECENT + 1 }, () => 'x') }, '40 repas récents au plus.'],
  ])('refuse une entrée invalide (%#)', (body, message) => {
    expect(() => parseInput(body)).toThrow(message)
  })
})

describe('buildUserMessage', () => {
  it('donne la saison, les recettes enregistrées et les plats récents', () => {
    expect(buildUserMessage(INPUT)).toBe(
      [
        'Date : 2026-10-27 (automne)',
        '',
        'Recettes enregistrées disponibles (id | titre | ingrédients | tags) :',
        'r1 | Curry de lentilles | lentilles corail, lait de coco, riz | végé',
        'r2 | Poulet basquaise | poulet, poivrons, riz | ',
        '',
        'Plats mangés ou prévus récemment, à éviter : Tartiflette',
      ].join('\n'),
    )
    expect(buildUserMessage({ today: '2026-01-05', candidates: [], recent: [] })).toContain('(hiver)')
    expect(buildUserMessage({ today: '2026-07-05', candidates: [], recent: [] })).toContain('(aucune)')
  })
})

describe('sanitizeIdeas', () => {
  it('garde les recettes connues et les adresses trouvées par la recherche', () => {
    expect(sanitizeIdeas({ idees: IDEAS }, INPUT, SEARCH)).toEqual([
      { source: 'saved', recipeId: 'r1', title: 'Curry de lentilles', protein: 'lentilles', vegetables: ['carotte'], starch: 'riz', vegetarian: true, why: 'De saison' },
      {
        source: 'web',
        url: 'https://www.marmiton.org/recettes/curry-courge-pois-chiches.aspx',
        site: 'Marmiton',
        title: 'Curry de courge',
        protein: 'pois chiches',
        vegetables: ['courge'],
        starch: 'semoule',
        vegetarian: true,
        why: 'De saison',
      },
      {
        source: 'web',
        url: 'https://cuisine.journaldesfemmes.fr/recette/saumon-poireaux',
        site: 'cuisine.journaldesfemmes.fr',
        title: 'Saumon aux poireaux',
        protein: 'saumon',
        vegetables: ['poireau'],
        starch: 'pommes de terre',
        vegetarian: false,
        why: 'De saison',
      },
      { source: 'saved', recipeId: 'r2', title: 'Poulet basquaise', protein: 'poulet', vegetables: ['poivron'], starch: 'riz', vegetarian: false, why: 'De saison' },
    ])
  })

  it('écarte les adresses inventées, les recettes inconnues et les doublons', () => {
    const ideas = sanitizeIdeas(
      {
        idees: [
          idea({ url: 'https://www.marmiton.org/recettes/inventee.aspx' }),
          idea({ url: 'javascript:alert(1)' }),
          idea({ url: null }),
          idea({ source: 'saved', recipe_id: 'inconnue' }),
          idea({ source: 'autre', url: 'https://www.750g.com/gratin-de-chou-fleur.htm' }),
          idea({ url: 'https://www.750g.com/gratin-de-chou-fleur.htm', title: '' }),
          idea({ url: 'http://750g.com/gratin-de-chou-fleur.htm/', title: 'Doublon' }),
          idea({ source: 'saved', recipe_id: 'r1' }),
          idea({ source: 'saved', recipe_id: 'r1' }),
          'pas un objet',
        ],
      },
      INPUT,
      SEARCH,
    )
    expect(ideas.map((i) => i.title)).toEqual(['Gratin de chou-fleur', 'Curry de lentilles'])
    expect(sanitizeIdeas(null, INPUT, SEARCH)).toEqual([])
  })

  it('ignore une recherche en erreur', () => {
    const failed = [{ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }]
    expect(searchResultUrls(failed).size).toBe(0)
    expect(sanitizeIdeas({ idees: [IDEAS[1]] }, INPUT, failed)).toEqual([])
  })

  it('borne le nombre d’idées et les textes', () => {
    const many = Array.from({ length: 12 }, (_, i) => idea({ source: 'saved', recipe_id: `c${i}`, why: 'x'.repeat(500), vegetables: ['a', 'b', 'c', 'd'] }))
    const input = { ...INPUT, candidates: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, title: `Plat ${i}`, ingredients: [], tags: [] })) }
    const ideas = sanitizeIdeas({ idees: many }, input, [])
    expect(ideas).toHaveLength(8)
    expect(ideas[0]!.why).toHaveLength(160)
    expect(ideas[0]!.vegetables).toEqual(['a', 'b', 'c'])
  })
})

describe('choix des plats les plus variés', () => {
  const dish = (title: string, protein: string, vegetables: string[], starch: string, vegetarian: boolean): Idea => ({
    source: 'saved',
    recipeId: title,
    title,
    protein,
    vegetables,
    starch,
    vegetarian,
    why: '',
  })

  it('compare les aliments sans accents, pluriel ni qualificatifs', () => {
    expect([...foodWords('Blanc de poulet rôti')]).toEqual(['poulet'])
    expect([...foodWords('Pommes de terre nouvelles')]).toEqual(['pomme', 'terre'])
    expect([...foodWords('Lentilles corail')]).toEqual(['lentille', 'corail'])
    expect([...foodWords('riz')]).toEqual(['riz'])
  })

  it('écarte les plats qui répètent une protéine, un féculent ou un légume', () => {
    const picked = pickVaried(
      [
        dish('Curry de courge', 'pois chiches', ['courge'], 'riz', true),
        dish('Velouté de courge', 'pois chiches grillés', ['courge', 'oignon'], 'pain', true),
        dish('Risotto à la courge', 'parmesan', ['courges butternut'], 'riz arborio', true),
        dish('Poulet basquaise', 'blanc de poulet', ['poivron'], 'riz', false),
        dish('Saumon aux poireaux', 'saumon', ['poireaux'], 'pommes de terre', false),
        dish('Omelette aux champignons', 'œufs', ['champignons'], 'pâtes', true),
        dish('Poulet rôti', 'poulet', ['carotte'], 'pomme de terre', false),
        dish('Dahl de lentilles', 'lentilles corail', ['épinards'], 'quinoa', true),
      ],
      5,
    )
    expect(picked.map((i) => i.title)).toEqual(['Curry de courge', 'Poulet basquaise', 'Saumon aux poireaux', 'Omelette aux champignons', 'Dahl de lentilles'])
    expect(picked.filter((i) => i.vegetarian)).toHaveLength(3)
  })

  it('garde 2 ou 3 plats végés quand c’est possible', () => {
    const veg = (n: number) => dish(`Végé ${n}`, `protéine ${n}`, [`légume${n}`], `féculent${n}`, true)
    const meat = (n: number) => dish(`Viande ${n}`, `viande${n}`, [`légumes${n}`], `céréale${n}`, false)
    expect(pickVaried([veg(1), veg(2), veg(3), veg(4), veg(5), meat(1), meat(2)]).filter((i) => i.vegetarian)).toHaveLength(3)
    expect(pickVaried([meat(1), meat(2), meat(3), meat(4), veg(1), veg(2)]).filter((i) => i.vegetarian)).toHaveLength(2)
    // Pas assez de plats végés, ou pas assez d'autres : on fait avec ce qu'il y a.
    expect(pickVaried([meat(1), meat(2), meat(3), meat(4), meat(5), veg(1)]).filter((i) => i.vegetarian)).toHaveLength(1)
    expect(pickVaried([veg(1), veg(2), veg(3), veg(4), veg(5), meat(1)]).filter((i) => i.vegetarian)).toHaveLength(4)
    expect(pickVaried([veg(1), veg(2)])).toHaveLength(2)
  })
})

describe('suggestMeals', () => {
  it('laisse le modèle chercher, puis renvoie les idées validées', async () => {
    const doFetch = fakeFetch(final(IDEAS))
    const result = await suggestMeals(INPUT, { apiKey: 'k', fetch: doFetch })
    expect(result.ideas).toHaveLength(4)
    expect(result.vegetarian).toBe(2)
    expect(result.searches).toBe(1)
    const body = sent(doFetch)
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.tool_choice).toEqual({ type: 'auto' })
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['web_search', 'proposer_repas'])
    expect(body.tools[0]).toMatchObject({ type: 'web_search_20250305', max_uses: 4, user_location: { country: 'FR' } })
    expect(body.messages[0].content).toContain('Curry de lentilles')
  })

  it('reprend après une pause, puis impose l’outil si le modèle répond sans', async () => {
    const doFetch = fakeFetch(
      turn(SEARCH, 'pause_turn'),
      turn([{ type: 'text', text: 'Voici mes idées…' }], 'end_turn'),
      turn([{ type: 'tool_use', id: 't1', name: 'proposer_repas', input: { idees: IDEAS } }]),
    )
    const result = await suggestMeals(INPUT, { apiKey: 'k', fetch: doFetch, webSearchTool: 'web_search_20260209' })
    // Les résultats de la recherche faite avant la pause comptent pour valider les adresses.
    expect(result.ideas).toHaveLength(4)
    expect(result.usage).toEqual({ input_tokens: 3000, output_tokens: 600 })
    expect(sent(doFetch, 1).messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant'])
    const last = sent(doFetch, 2)
    expect(last.tool_choice).toEqual({ type: 'tool', name: 'proposer_repas' })
    expect(last.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'assistant', 'user'])
    expect(sent(doFetch).tools[0].type).toBe('web_search_20260209')
  })

  it('échoue si le modèle ne répond toujours pas avec l’outil, ou s’arrête en pause', async () => {
    const text = turn([{ type: 'text', text: '…' }], 'end_turn')
    await expect(suggestMeals(INPUT, { apiKey: 'k', fetch: fakeFetch(text, turn([{ type: 'text', text: '…' }], 'end_turn')) })).rejects.toThrow(
      'La recherche d’idées a échoué (réponse sans idées : end_turn).',
    )
    const pause = () => turn(SEARCH, 'pause_turn')
    await expect(suggestMeals(INPUT, { apiKey: 'k', fetch: fakeFetch(pause(), pause(), pause()) })).rejects.toThrow('pause_turn')
  })

  it('demande peu de réflexion et laisse de la marge à la réponse', async () => {
    const doFetch = fakeFetch(final(IDEAS))
    await suggestMeals(INPUT, { apiKey: 'k', fetch: doFetch })
    expect(sent(doFetch)).toMatchObject({ max_tokens: 16_000, output_config: { effort: 'low' } })
  })

  it('après une réponse coupée, redemande avec les résultats déjà trouvés, sans nouvelle recherche', async () => {
    const truncated = turn([...SEARCH, { type: 'text', text: 'Je compare les recettes…' }], 'max_tokens')
    const doFetch = fakeFetch(truncated, turn([{ type: 'tool_use', id: 't1', name: 'proposer_repas', input: { idees: IDEAS } }]))
    const result = await suggestMeals(INPUT, { apiKey: 'k', fetch: doFetch })
    expect(result.ideas).toHaveLength(4)

    const retry = sent(doFetch, 1)
    expect(retry.tool_choice).toEqual({ type: 'tool', name: 'proposer_repas' })
    // La réponse coupée n'est pas renvoyée : une seule demande, qui liste les résultats trouvés.
    expect(retry.messages).toHaveLength(1)
    expect(retry.messages[0].content).toContain('Recettes enregistrées disponibles')
    expect(retry.messages[0].content).toContain(
      'Résultats de recherche déjà trouvés (titre | adresse), à utiliser sans nouvelle recherche :\n' +
        'Curry de courge aux pois chiches | https://www.marmiton.org/recettes/curry-courge-pois-chiches.aspx\n',
    )
  })

  it('après une réponse coupée sans résultat de recherche, se rabat sur les recettes enregistrées', async () => {
    const doFetch = fakeFetch(turn([{ type: 'text', text: '…' }], 'max_tokens'), final(IDEAS))
    await suggestMeals(INPUT, { apiKey: 'k', fetch: doFetch })
    expect(sent(doFetch, 1).messages[0].content).toContain('Aucun résultat de recherche disponible : propose des recettes enregistrées.')
  })

  it('échoue si la dernière demande est elle aussi coupée', async () => {
    const cut = () => turn([], 'max_tokens')
    await expect(suggestMeals(INPUT, { apiKey: 'k', fetch: fakeFetch(cut(), cut()) })).rejects.toMatchObject({
      message: 'La recherche d’idées a échoué (réponse trop longue).',
      status: 502,
    })
  })

  it('refuse moins de 3 idées valides', async () => {
    await expect(suggestMeals(INPUT, { apiKey: 'k', fetch: fakeFetch(final(IDEAS.slice(0, 2))) })).rejects.toMatchObject({
      message: 'Pas assez d’idées trouvées : réessaie.',
      status: 502,
    })
  })

  it.each([
    [response({}, 401), 'Le service d’analyse est mal configuré.', 500],
    [response({}, 429), 'Le service d’analyse est surchargé. Réessaie dans un instant.', 503],
    [response({}, 529), 'Le service d’analyse est surchargé. Réessaie dans un instant.', 503],
    [response({ error: { type: 'invalid_request_error', message: 'Web search is not enabled for this organization' } }, 400), 'La recherche web n’est pas activée pour le service d’analyse.', 503],
    [response({ error: { type: 'invalid_request_error', message: 'bad' } }, 400), 'La recherche d’idées a échoué (400 – invalid_request_error : bad).', 502],
    [new Error('réseau'), 'Le service d’analyse ne répond pas. Réessaie dans un instant.', 503],
  ])('traduit les erreurs de l’API (%#)', async (reply, message, status) => {
    await expect(suggestMeals(INPUT, { apiKey: 'k', fetch: fakeFetch(reply) })).rejects.toMatchObject({ message, status })
  })
})

describe('handler', () => {
  const deps = (overrides: Partial<Deps> = {}): Deps => ({
    apiKey: 'k',
    fetchModel: fakeFetch(final(IDEAS)),
    isSignedIn: async (authorization) => authorization === 'Bearer user',
    ...overrides,
  })
  const post = (body: unknown, authorization = 'Bearer user') =>
    new Request('https://fn.test/suggest-meals', { method: 'POST', headers: { authorization }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('renvoie les idées et journalise sans donnée personnelle', async () => {
    const log = vi.fn()
    const res = await createHandler(deps({ log }))(post(INPUT))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ideas: expect.any(Array) })
    expect(body.ideas).toHaveLength(4)
    expect(log).toHaveBeenCalledWith('idées trouvées', expect.objectContaining({ candidates: 2, ideas: 4, vegetarian: 2, searches: 1 }))
    expect(JSON.stringify(log.mock.calls)).not.toContain('Curry')
  })

  it('refuse un appel non connecté, une méthode ou un corps invalide, une clé absente', async () => {
    expect((await createHandler(deps())(post(INPUT, 'Bearer anon'))).status).toBe(401)
    expect((await createHandler(deps())(new Request('https://fn.test', { method: 'GET', headers: { authorization: 'Bearer user' } }))).status).toBe(405)
    expect((await createHandler(deps())(new Request('https://fn.test', { method: 'OPTIONS' }))).status).toBe(200)
    expect((await createHandler(deps())(post('{oups'))).status).toBe(400)
    expect(await (await createHandler(deps())(post({ today: 'x' }))).json()).toEqual({ error: 'Date invalide.' })
    const missing = await createHandler(deps({ apiKey: undefined }))(post(INPUT))
    expect(missing.status).toBe(500)
    expect(await missing.json()).toEqual({ error: 'Le service d’analyse est mal configuré.' })
  })

  it('masque une erreur inattendue', async () => {
    const res = await createHandler(deps({ fetchModel: vi.fn(async () => new Response('pas du json')) }))(post(INPUT))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'La recherche d’idées a échoué.' })
  })
})
