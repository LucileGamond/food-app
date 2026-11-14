import { createHandler } from './handler.ts'
import { describeRequest, IDEAS_NO_SEARCH_TOOL, IDEAS_TOOL, parseIdeaPatternsInput, parseIdeasInput, sanitizeIdeas, sanitizePatterns } from './ideas.ts'

const BEANIE = 'https://www.ravelry.com/patterns/library/ribbed-beanie'
const COWL = 'https://www.garnstudio.com/pattern.php?id=123'

const IDEAS = {
  weight: 'worsted',
  ideas: [
    {
      title: 'Bonnet à côtes 2/2',
      why: 'Tient dans 150 m de laine moyenne.',
      size: 'adulte',
      meters: 150.4,
      needle_mm: 4,
      search: 'ribbed beanie',
      patterns: [
        { title: 'Ribbed Beanie', url: `${BEANIE}/`, free: true, language: 'EN' },
        { title: 'DROPS Bonnet', url: 'https://garnstudio.com/pattern.php?id=456', free: 'oui', language: 'français' },
        // Adresse inventée (pas dans les résultats) : retirée
        { title: 'Inventé', url: 'https://patrons.exemple/bonnet', free: true, language: 'fr' },
      ],
    },
    // Même patron proposé deux fois : gardé une fois ; titre manquant : celui du résultat
    { title: 'Snood', why: 'Doux en mérinos.', meters: null, needle_mm: 80, search: 'cowl', patterns: [{ title: '', url: COWL, free: false, language: 'fr' }, { title: 'Doublon', url: BEANIE }] },
    { title: '', why: 'sans titre', meters: 10, needle_mm: 3, search: '', patterns: [] },
  ],
}

/** Résultats de la recherche web, comme les renvoie l'API. */
const SEARCH = [
  { type: 'server_tool_use', name: 'web_search', input: { query: 'ribbed beanie worsted pattern' } },
  {
    type: 'web_search_tool_result',
    content: [
      { type: 'web_search_result', url: BEANIE, title: 'Ravelry: Ribbed Beanie' },
      { type: 'web_search_result', url: COWL, title: 'DROPS Snood' },
      // Même page DROPS, autre patron
      { type: 'web_search_result', url: 'https://www.garnstudio.com/pattern.php?id=456', title: 'DROPS Bonnet' },
    ],
  },
]

const MERINO = { yarn: 'Mérinos', meters: 750, needle_mm: 3.5 }
const ALPACA = { yarn: 'Alpaga gris', meters: 200, needle_mm: 4 }

function reply(content: unknown[], usage = { input_tokens: 300, output_tokens: 200 }) {
  return new Response(JSON.stringify({ content, stop_reason: 'tool_use', usage }))
}

function handlerWith(fetchModel: typeof fetch) {
  const log = vi.fn()
  return { handle: createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true }), log }
}

function post(body: unknown) {
  return new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })
}

describe('idées pour une laine', () => {
  it('lit la demande : une laine (ancienne forme) ou plusieurs, envie, recherche', () => {
    expect(parseIdeasInput({ pdf: 'x' })).toBeNull()
    expect(parseIdeasInput({ ideas: { yarn: ' Mérinos, 50 g / 125 m ', meters: 750, needle_mm: 3.5 } })).toEqual({
      yarns: [{ yarn: 'Mérinos, 50 g / 125 m', meters: 750, needleMm: 3.5 }],
      wish: '',
      search: true,
    })
    expect(parseIdeasInput({ ideas: { yarn: 'Mérinos', meters: -2, needle_mm: 'gros' } })?.yarns).toEqual([{ yarn: 'Mérinos', meters: null, needleMm: null }])
    expect(parseIdeasInput({ ideas: { yarns: [MERINO, ALPACA], wish: '  pour bébé ', search: false } })).toEqual({
      yarns: [
        { yarn: 'Mérinos', meters: 750, needleMm: 3.5 },
        { yarn: 'Alpaga gris', meters: 200, needleMm: 4 },
      ],
      wish: 'pour bébé',
      search: false,
    })
    // Envie bornée
    expect(parseIdeasInput({ ideas: { yarns: [MERINO], wish: 'x'.repeat(500) } })?.wish).toHaveLength(120)
    expect(() => parseIdeasInput({ ideas: { yarn: '' } })).toThrow('Décris la laine.')
    expect(() => parseIdeasInput({ ideas: { yarns: [] } })).toThrow('Décris la laine.')
    expect(() => parseIdeasInput({ ideas: { yarns: [MERINO, { yarn: ' ' }] } })).toThrow('Décris la laine.')
    expect(() => parseIdeasInput({ ideas: { yarns: [MERINO, MERINO, MERINO, MERINO, MERINO] } })).toThrow('4 laines au plus.')
  })

  it('lit la demande de patrons pour une idée', () => {
    expect(parseIdeaPatternsInput({ ideas: {} })).toBeNull()
    expect(parseIdeaPatternsInput({ idea_patterns: { idea: { title: 'Snood', search: 'cowl', size: 'adulte', meters: 300, needle_mm: 4 }, yarns: [MERINO], weight: 'dk' } })).toEqual({
      idea: { title: 'Snood', search: 'cowl', size: 'adulte', meters: 300, needleMm: 4 },
      yarns: [{ yarn: 'Mérinos', meters: 750, needleMm: 3.5 }],
      weight: 'dk',
    })
    expect(parseIdeaPatternsInput({ idea_patterns: { idea: { title: 'Snood' }, yarns: [MERINO], weight: 'énorme' } })).toMatchObject({
      idea: { search: '', size: '', meters: null, needleMm: null },
      weight: null,
    })
    expect(() => parseIdeaPatternsInput({ idea_patterns: { idea: { title: '' }, yarns: [MERINO] } })).toThrow('Choisis une idée.')
    expect(() => parseIdeaPatternsInput({ idea_patterns: { idea: { title: 'Snood' }, yarns: [] } })).toThrow('Décris la laine.')
  })

  it('décrit les laines et l’envie pour le modèle', () => {
    expect(describeRequest([{ yarn: 'Mérinos', meters: 750, needleMm: 3.5 }])).toBe('Laine : Mérinos\nQuantité disponible : 750 m\nAiguilles conseillées : 3.5 mm')
    expect(
      describeRequest(
        [
          { yarn: 'Mérinos', meters: null, needleMm: null },
          { yarn: 'Alpaga', meters: 200, needleMm: 4 },
        ],
        'un snood',
      ),
    ).toBe('Laine 1 : Mérinos\nQuantité disponible : inconnue\nLaine 2 : Alpaga\nQuantité disponible : 200 m\nAiguilles conseillées : 4 mm\nEnvie : un snood')
  })

  it('outils : patrons seulement avec la recherche ; taille demandée', () => {
    const item = (tool: typeof IDEAS_TOOL) => (tool.input_schema as { properties: { ideas: { items: { properties: object; required: string[] } } } }).properties.ideas.items
    expect(item(IDEAS_TOOL).required).toEqual(['title', 'why', 'size', 'meters', 'needle_mm', 'search', 'patterns'])
    expect(item(IDEAS_NO_SEARCH_TOOL).required).toEqual(['title', 'why', 'size', 'meters', 'needle_mm', 'search'])
    expect(item(IDEAS_NO_SEARCH_TOOL).properties).not.toHaveProperty('patterns')
  })

  it('garde les idées valides, bornées, et seulement les patrons vraiment trouvés', () => {
    expect(sanitizeIdeas(IDEAS, SEARCH)).toEqual({
      weight: 'worsted',
      ideas: [
        {
          title: 'Bonnet à côtes 2/2',
          why: 'Tient dans 150 m de laine moyenne.',
          size: 'adulte',
          meters: 150,
          needleMm: 4,
          search: 'ribbed beanie',
          patterns: [
            { title: 'Ribbed Beanie', url: BEANIE, free: true, language: 'en' },
            // Gratuit et langue illisibles : inconnus
            { title: 'DROPS Bonnet', url: 'https://www.garnstudio.com/pattern.php?id=456', free: null, language: null },
          ],
        },
        { title: 'Snood', why: 'Doux en mérinos.', size: '', meters: null, needleMm: null, search: 'cowl', patterns: [{ title: 'DROPS Snood', url: COWL, free: false, language: 'fr' }] },
      ],
    })
    // Sans recherche : aucun patron ; grosseur inconnue : null
    expect(sanitizeIdeas({ ...IDEAS, weight: 'énorme' }).weight).toBeNull()
    expect(sanitizeIdeas(IDEAS).ideas.every((i) => i.patterns.length === 0)).toBe(true)
    expect(() => sanitizeIdeas({ ideas: [] })).toThrow('Aucune idée trouvée pour cette laine.')
    expect(() => sanitizeIdeas(null)).toThrow('Aucune idée trouvée pour cette laine.')
  })

  it('bornes : 5 idées, 3 patrons par idée', () => {
    const many = { ideas: Array.from({ length: 8 }, (_, i) => ({ title: `Idée ${i}`, patterns: [] })) }
    expect(sanitizeIdeas(many).ideas).toHaveLength(5)
    const results = Array.from({ length: 5 }, (_, i) => ({ type: 'web_search_result', url: `https://p.exemple/${i}`, title: `P${i}` }))
    const blocks = [{ type: 'web_search_tool_result', content: results }]
    const patterns = results.map((r) => ({ title: r.title, url: r.url }))
    expect(sanitizePatterns({ patterns }, blocks)).toHaveLength(3)
    // Recherche en erreur (objet au lieu d'une liste) : rien n'est trouvé
    expect(sanitizePatterns({ patterns }, [{ type: 'web_search_tool_result', content: { error_code: 'max_uses_exceeded' } }])).toEqual([])
    // Adresse non web : ignorée
    expect(sanitizePatterns({ patterns: [{ title: 'x', url: 'ftp://p.exemple/0' }] }, blocks)).toEqual([])
  })

  it('le handler propose des idées avec recherche web (ancienne forme de demande)', async () => {
    const fetchModel = vi.fn<typeof fetch>(async () => reply([...SEARCH, { type: 'tool_use', name: 'proposer_modeles', input: IDEAS }]))
    const { handle, log } = handlerWith(fetchModel)
    const response = await handle(post({ ideas: { yarn: 'Mérinos', meters: 750, needle_mm: 3.5 } }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ideas).toHaveLength(2)
    expect(body.weight).toBe('worsted')
    expect(body.ideas[0].patterns.map((p: { title: string }) => p.title)).toEqual(['Ribbed Beanie', 'DROPS Bonnet'])
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    // Recherche web proposée au modèle, outil final non imposé d'emblée
    expect(sent.tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search', max_uses: 4 })
    expect(sent.tool_choice).toEqual({ type: 'auto' })
    expect(sent.messages[0].content).toBe('Laine : Mérinos\nQuantité disponible : 750 m\nAiguilles conseillées : 3.5 mm')
    expect(sent.system).toContain('gratuits')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ideas: 2, yarns: 1, wish: false, patterns: 3, searches: 1 }))
  })

  it('le handler propose des idées sans recherche web, pour plusieurs laines et une envie', async () => {
    const fetchModel = vi.fn<typeof fetch>(async () => reply([{ type: 'tool_use', name: 'proposer_modeles', input: IDEAS }]))
    const { handle, log } = handlerWith(fetchModel)
    const response = await handle(post({ ideas: { yarns: [MERINO, ALPACA], wish: 'un snood', search: false } }))
    expect(response.status).toBe(200)
    const body = await response.json()
    // Sans recherche, aucun patron, même si le modèle en invente
    expect(body.ideas.map((i: { patterns: unknown[] }) => i.patterns)).toEqual([[], []])
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.tools).toHaveLength(1)
    expect(sent.tools[0].name).toBe('proposer_modeles')
    expect(sent.tool_choice).toEqual({ type: 'tool', name: 'proposer_modeles' })
    expect(sent.system).toContain('associe au moins deux')
    expect(sent.system).not.toContain('Cherche sur internet')
    expect(sent.messages[0].content[0].text).toContain('Laine 2 : Alpaga gris')
    expect(sent.messages[0].content[0].text).toContain('Envie : un snood')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ideas: 2, yarns: 2, wish: true, patterns: 0, searches: 0 }))
  })

  it('le handler cherche des patrons pour une idée choisie', async () => {
    const fetchModel = vi.fn<typeof fetch>(async () =>
      reply([...SEARCH, { type: 'tool_use', name: 'donner_patrons', input: { patterns: [{ title: 'Ribbed Beanie', url: BEANIE, free: true, language: 'en' }, { title: 'Faux', url: 'https://faux.exemple' }] } }]),
    )
    const { handle, log } = handlerWith(fetchModel)
    const response = await handle(post({ idea_patterns: { idea: { title: 'Bonnet', search: 'ribbed beanie', size: 'adulte', meters: 150, needle_mm: 4 }, yarns: [MERINO], weight: 'worsted' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ patterns: [{ title: 'Ribbed Beanie', url: BEANIE, free: true, language: 'en' }] })
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.tools[0]).toMatchObject({ name: 'web_search', max_uses: 2 })
    expect(sent.messages[0].content).toBe(
      'Ouvrage : Bonnet (adulte)\nMots-clés : ribbed beanie\nGrosseur (Ravelry) : worsted\nMétrage nécessaire : 150 m\nAiguilles : 4 mm\nLaine : Mérinos\nQuantité disponible : 750 m\nAiguilles conseillées : 3.5 mm',
    )
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ideaPatterns: true, patterns: 1, searches: 1 }))
  })

  it('réponse coupée : la nouvelle demande garde la description des laines', async () => {
    const fetchModel = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: SEARCH, stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 10 } })))
      .mockResolvedValueOnce(reply([{ type: 'tool_use', name: 'proposer_modeles', input: IDEAS }]))
    const { handle } = handlerWith(fetchModel)
    const response = await handle(post({ ideas: { yarns: [MERINO] } }))
    expect(response.status).toBe(200)
    const retry = JSON.parse(fetchModel.mock.calls[1]![1]!.body as string)
    expect(retry.messages[0].content).toContain('Laine : Mérinos')
    expect(retry.messages[0].content).toContain(BEANIE)
    expect(retry.tool_choice).toEqual({ type: 'tool', name: 'proposer_modeles' })
  })

  it('demande invalide : 400', async () => {
    const { handle } = handlerWith(vi.fn<typeof fetch>())
    const response = await handle(post({ ideas: { yarns: [] } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Décris la laine.' })
  })
})
