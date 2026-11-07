import { createHandler } from './handler.ts'
import { parseIdeasInput, sanitizeIdeas } from './ideas.ts'

const BEANIE = 'https://www.ravelry.com/patterns/library/ribbed-beanie'
const COWL = 'https://www.garnstudio.com/pattern.php?id=123'

const IDEAS = {
  weight: 'worsted',
  ideas: [
    {
      title: 'Bonnet à côtes 2/2',
      why: 'Tient dans 150 m de laine moyenne.',
      meters: 150.4,
      needle_mm: 4,
      search: 'ribbed beanie',
      patterns: [
        { title: 'Ribbed Beanie', url: `${BEANIE}/` },
        { title: 'DROPS Bonnet', url: 'https://garnstudio.com/pattern.php?id=456' },
        // Adresse inventée (pas dans les résultats) : retirée
        { title: 'Inventé', url: 'https://patrons.exemple/bonnet' },
      ],
    },
    // Même patron proposé deux fois : gardé une fois ; titre manquant : celui du résultat
    { title: 'Snood', why: 'Doux en mérinos.', meters: null, needle_mm: 80, search: 'cowl', patterns: [{ title: '', url: COWL }, { title: 'Doublon', url: BEANIE }] },
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

describe('idées pour une laine', () => {
  it('lit la demande', () => {
    expect(parseIdeasInput({ pdf: 'x' })).toBeNull()
    expect(parseIdeasInput({ ideas: { yarn: ' Mérinos, 50 g / 125 m ', meters: 750, needle_mm: 3.5 } })).toEqual({ yarn: 'Mérinos, 50 g / 125 m', meters: 750, needleMm: 3.5 })
    expect(parseIdeasInput({ ideas: { yarn: 'Mérinos', meters: -2, needle_mm: 'gros' } })).toEqual({ yarn: 'Mérinos', meters: null, needleMm: null })
    expect(() => parseIdeasInput({ ideas: { yarn: '' } })).toThrow('Décris la laine.')
  })

  it('garde les idées valides, bornées, et seulement les patrons vraiment trouvés', () => {
    expect(sanitizeIdeas(IDEAS, SEARCH)).toEqual({
      weight: 'worsted',
      ideas: [
        { title: 'Bonnet à côtes 2/2', why: 'Tient dans 150 m de laine moyenne.', meters: 150, needleMm: 4, search: 'ribbed beanie', patterns: [{ title: 'Ribbed Beanie', url: BEANIE }, { title: 'DROPS Bonnet', url: 'https://www.garnstudio.com/pattern.php?id=456' }] },
        { title: 'Snood', why: 'Doux en mérinos.', meters: null, needleMm: null, search: 'cowl', patterns: [{ title: 'DROPS Snood', url: COWL }] },
      ],
    })
    // Sans recherche : aucun patron ; grosseur inconnue : null
    expect(sanitizeIdeas({ ...IDEAS, weight: 'énorme' }).weight).toBeNull()
    expect(sanitizeIdeas(IDEAS).ideas.every((i) => i.patterns.length === 0)).toBe(true)
    expect(() => sanitizeIdeas({ ideas: [] })).toThrow('Aucune idée trouvée pour cette laine.')
  })

  it('le handler propose des idées à une personne connectée', async () => {
    const fetchModel = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ content: [...SEARCH, { type: 'tool_use', name: 'proposer_modeles', input: IDEAS }], stop_reason: 'tool_use', usage: { input_tokens: 300, output_tokens: 200 } })),
    )
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true })
    const response = await handle(new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify({ ideas: { yarn: 'Mérinos', meters: 750, needle_mm: 3.5 } }) }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ideas).toHaveLength(2)
    expect(body.weight).toBe('worsted')
    expect(body.ideas[0].patterns.map((p: { title: string }) => p.title)).toEqual(['Ribbed Beanie', 'DROPS Bonnet'])
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    // Recherche web proposée au modèle, outil final non imposé d'emblée
    expect(sent.tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search', max_uses: 4 })
    expect(sent.tool_choice).toEqual({ type: 'auto' })
    expect(sent.messages[0].content[0].text).toBe('Laine : Mérinos\nQuantité disponible : 750 m\nAiguilles conseillées : 3.5 mm')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ideas: 2, patterns: 3, searches: 1 }))
  })
})
