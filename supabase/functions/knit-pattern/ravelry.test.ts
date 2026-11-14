import { createHandler } from './handler.ts'
import { ravelryConfigured, searchRavelry, toFoundPattern } from './ravelry.ts'

/** Patron de Ravelry (détails), comme les renvoie patterns.json. */
const detail = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Patron ${id}`,
  permalink: `patron-${id}`,
  free: false,
  yardage: 328,
  yardage_max: 656,
  languages: [{ code: 'en', name: 'English' }],
  pattern_author: { name: 'Jane' },
  ...extra,
})

function ravelryFetch(details: Record<string, unknown>[], status = 200) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (status !== 200) return new Response('{}', { status })
    if (url.includes('/patterns/search.json')) return Response.json({ patterns: details.map((d) => ({ id: d.id, name: d.name })), paginator: {} })
    return Response.json({ patterns: Object.fromEntries(details.map((d) => [String(d.id), d])) })
  })
}

const deps = (fetchRavelry: typeof fetch) => ({ fetchRavelry, username: 'read-abc', password: 'secret' })

describe('patrons de Ravelry', () => {
  it('configuré seulement avec les deux identifiants', () => {
    expect(ravelryConfigured({ fetchRavelry: fetch, username: 'u', password: 'p' })).toBe(true)
    expect(ravelryConfigured({ fetchRavelry: fetch, username: 'u' })).toBe(false)
    expect(ravelryConfigured({ fetchRavelry: fetch, username: '', password: 'p' })).toBe(false)
    expect(ravelryConfigured({})).toBe(false)
  })

  it('patron de Ravelry → patron trouvé : page, créatrice, métrage en mètres, langue française d’abord', () => {
    expect(toFoundPattern(detail(1, { languages: [{ code: 'en' }, { code: 'fr' }], free: true }))).toEqual({
      title: 'Patron 1 par Jane',
      url: 'https://www.ravelry.com/patterns/library/patron-1',
      free: true,
      language: 'fr',
      meters: 300,
      metersMax: 600,
    })
    // Créatrice inconnue, métrage unique, sans langue
    expect(toFoundPattern(detail(2, { pattern_author: null, yardage: '100', yardage_max: 100, languages: [] }))).toMatchObject({ title: 'Patron 2', meters: 91, metersMax: null, language: null })
    expect(toFoundPattern(detail(3, { yardage: null, free: 'oui' }))).toMatchObject({ meters: null, metersMax: null, free: null })
    // Sans page ou sans nom, ou adresse douteuse : ignoré
    expect(toFoundPattern(detail(4, { permalink: null }))).toBeNull()
    expect(toFoundPattern(detail(5, { permalink: '../admin' }))).toBeNull()
    expect(toFoundPattern(detail(6, { name: ' ' }))).toBeNull()
    expect(toFoundPattern(null)).toBeNull()
  })

  it('cherche avec les filtres du site, puis lit les détails ; gratuits et français d’abord', async () => {
    const fetchRavelry = ravelryFetch([
      detail(10),
      detail(11, { free: true }),
      detail(12, { languages: [{ code: 'fr' }] }),
      detail(13, { free: true, languages: [{ code: 'fr' }] }),
    ])
    const patterns = await searchRavelry({ search: ' ribbed beanie ', weight: 'worsted', meters: 840 }, deps(fetchRavelry))
    expect(patterns.map((p) => p.title)).toEqual(['Patron 13 par Jane', 'Patron 11 par Jane', 'Patron 12 par Jane'])

    const [searchUrl, init] = fetchRavelry.mock.calls[0]!
    const search = new URL(String(searchUrl))
    expect(search.origin + search.pathname).toBe('https://api.ravelry.com/patterns/search.json')
    expect(Object.fromEntries(search.searchParams)).toEqual({ query: 'ribbed beanie', craft: 'knitting', page_size: '8', sort: 'best', weight: 'worsted', yardage: '0|918' })
    expect((init!.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('read-abc:secret')}`)
    // Identifiants multiples séparés par « + », non encodé
    expect(String(fetchRavelry.mock.calls[1]![0])).toBe('https://api.ravelry.com/patterns.json?ids=10+11+12+13')
  })

  it('sans grosseur ni métrage : pas de filtre ; sans mots-clés ou sans résultat : rien', async () => {
    const fetchRavelry = ravelryFetch([detail(1)])
    expect(await searchRavelry({ search: 'cowl', weight: null, meters: null }, deps(fetchRavelry), 5)).toHaveLength(1)
    const params = new URL(String(fetchRavelry.mock.calls[0]![0])).searchParams
    expect(params.has('weight')).toBe(false)
    expect(params.has('yardage')).toBe(false)

    const none = ravelryFetch([])
    expect(await searchRavelry({ search: 'cowl', weight: null, meters: null }, deps(none))).toEqual([])
    expect(none).toHaveBeenCalledTimes(1)
    expect(await searchRavelry({ search: '  ', weight: null, meters: null }, deps(none))).toEqual([])
    expect(none).toHaveBeenCalledTimes(1)
  })

  it('erreurs lisibles : identifiants refusés, erreur, pas de réponse, réponse illisible', async () => {
    const query = { search: 'cowl', weight: null, meters: null }
    await expect(searchRavelry(query, deps(ravelryFetch([], 401)))).rejects.toThrow('Identifiants Ravelry refusés.')
    await expect(searchRavelry(query, deps(ravelryFetch([], 500)))).rejects.toThrow('Ravelry a répondu par une erreur (500).')
    await expect(searchRavelry(query, deps(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('réseau'))))).rejects.toThrow('Ravelry ne répond pas.')
    await expect(searchRavelry(query, deps(vi.fn<typeof fetch>(async () => new Response('pas du json'))))).rejects.toThrow('Réponse de Ravelry illisible.')
  })
})

describe('idées avec les patrons de Ravelry', () => {
  const IDEAS = {
    weight: 'dk',
    ideas: [
      { title: 'Bonnet', why: 'Rapide.', size: 'adulte', meters: 150, needle_mm: 4, search: 'ribbed beanie' },
      { title: 'Snood', why: 'Doux.', size: 'adulte', meters: 300, needle_mm: 4, search: '' },
    ],
  }
  const fetchModel = () =>
    vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'proposer_modeles', input: IDEAS }], stop_reason: 'tool_use', usage: { input_tokens: 300, output_tokens: 200 } })),
    )
  const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })
  const YARNS = [
    { yarn: 'Mérinos', meters: 500, needle_mm: 4 },
    { yarn: 'Alpaga', meters: 340, needle_mm: 4 },
  ]

  it('ajoute les patrons de Ravelry aux idées qui ont des mots-clés (métrage : somme des laines)', async () => {
    const fetchRavelry = ravelryFetch([detail(1, { free: true })])
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel: fetchModel(), log, isSignedIn: async () => true, ravelry: deps(fetchRavelry) })
    const response = await handle(post({ ideas: { yarns: YARNS, search: false } }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ideas[0].patterns).toEqual([{ title: 'Patron 1 par Jane', url: 'https://www.ravelry.com/patterns/library/patron-1', free: true, language: 'en', meters: 300, metersMax: 600 }])
    // Idée sans mots-clés : pas de recherche
    expect(body.ideas[1].patterns).toEqual([])
    expect(fetchRavelry).toHaveBeenCalledTimes(2)
    expect(new URL(String(fetchRavelry.mock.calls[0]![0])).searchParams.get('yardage')).toBe('0|918')
    expect(new URL(String(fetchRavelry.mock.calls[0]![0])).searchParams.get('weight')).toBe('dk')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ravelry: 'ok', patterns: 1 }))
  })

  it('métrage d’une laine inconnu : pas de filtre de métrage', async () => {
    const fetchRavelry = ravelryFetch([detail(1)])
    const handle = createHandler({ apiKey: 'cle', fetchModel: fetchModel(), isSignedIn: async () => true, ravelry: deps(fetchRavelry) })
    await handle(post({ ideas: { yarns: [YARNS[0], { yarn: 'Inconnue' }], search: false } }))
    expect(new URL(String(fetchRavelry.mock.calls[0]![0])).searchParams.has('yardage')).toBe(false)
  })

  it('sans identifiants Ravelry : idées sans patrons, Ravelry pas appelé', async () => {
    const fetchRavelry = ravelryFetch([detail(1)])
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel: fetchModel(), log, isSignedIn: async () => true, ravelry: { fetchRavelry } })
    const body = await (await handle(post({ ideas: { yarns: YARNS, search: false } }))).json()
    expect(body.ideas.every((i: { patterns: unknown[] }) => i.patterns.length === 0)).toBe(true)
    expect(fetchRavelry).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ravelry: 'absent' }))
  })

  it('Ravelry en erreur : les idées arrivent quand même, l’erreur est notée', async () => {
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel: fetchModel(), log, isSignedIn: async () => true, ravelry: deps(ravelryFetch([], 401)) })
    const response = await handle(post({ ideas: { yarns: YARNS, search: false } }))
    expect(response.status).toBe(200)
    expect((await response.json()).ideas).toHaveLength(2)
    expect(log).toHaveBeenCalledWith('ravelry en erreur', { error: 'Identifiants Ravelry refusés.' })
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ravelry: 'erreur', patterns: 0 }))
  })
})
