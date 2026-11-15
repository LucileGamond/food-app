import { createHandler } from './handler.ts'
import { getRavelryPattern, parseRavelrySizes, ravelryPermalink, toPatternInfo } from './ravelry.ts'
import type { RavelryOAuth, RavelryStore } from './ravelryAuth.ts'

/** Patron de Ravelry, comme le renvoie /patterns/{permalink}.json (champs utilisés). */
const BEANIE = {
  name: 'Ladder Rib Beanie',
  permalink: 'ladder-rib-beanie',
  yardage: 126,
  yardage_max: 144,
  sizes_available: '2 sizes: Adult (small - medium), Adult (Medium - Large)',
  pattern_needle_sizes: [{ metric: 4, name: 'US 6 - 4.0 mm' }, { metric: 4.5 }],
  yarn_weight: { name: 'Worsted' },
  packs: [{ yarn_name: 'Hamanaka Amerry' }, { yarn_name: 'Hamanaka Amerry' }, { yarn_name: null }],
}

const PAGE_URL = 'https://www.ravelry.com/patterns/library/ladder-rib-beanie'
const API_URL = 'https://api.ravelry.com/patterns/ladder-rib-beanie.json?'

function oauth(fetchRavelry: typeof fetch, linked = true): RavelryOAuth {
  const store: RavelryStore = {
    saveState: vi.fn(),
    takeState: vi.fn(),
    saveAccount: vi.fn(),
    loadTokens: vi.fn(async () => (linked ? { accessToken: 'jeton', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 } : null)),
    saveTokens: vi.fn(),
  }
  return { clientId: 'client', redirectUris: [], fetch: fetchRavelry, store }
}

describe('patron de Ravelry : adresse', () => {
  it('reconnaît une page de patron Ravelry, et rien d’autre', () => {
    expect(ravelryPermalink(PAGE_URL)).toBe('ladder-rib-beanie')
    expect(ravelryPermalink('https://ravelry.com/patterns/library/two-by-two-2/')).toBe('two-by-two-2')
    expect(ravelryPermalink('https://www.ravelry.com/patterns/library/ladder-rib-beanie/people')).toBeNull()
    expect(ravelryPermalink('https://www.ravelry.com/patterns/search#query=hat')).toBeNull()
    expect(ravelryPermalink('https://ravelry.com.pirate.exemple/patterns/library/x')).toBeNull()
    expect(ravelryPermalink('https://www.garnstudio.com/pattern.php?id=1')).toBeNull()
    expect(ravelryPermalink('pas une adresse')).toBeNull()
  })
})

describe('patron de Ravelry : infos', () => {
  it('tailles : liste après « N sizes: », virgules hors parenthèses ; une seule taille → aucune', () => {
    expect(parseRavelrySizes('2 sizes: Adult (small - medium), Adult (Medium - Large)')).toEqual(['Adult (small - medium)', 'Adult (Medium - Large)'])
    expect(parseRavelrySizes('XS, S, M (bust 90, 95), L')).toEqual(['XS', 'S', 'M (bust 90, 95)', 'L'])
    expect(parseRavelrySizes('One size')).toEqual([])
    expect(parseRavelrySizes('1 size: Adult')).toEqual([])
    expect(parseRavelrySizes(null)).toEqual([])
    expect(parseRavelrySizes(Array.from({ length: 20 }, (_, i) => `T${i}`).join(', '))).toHaveLength(12)
  })

  it('métrage en mètres (plus petite et plus grande taille), aiguilles du corps, laines conseillées sans doublon', () => {
    expect(toPatternInfo(BEANIE)).toEqual({ title: 'Ladder Rib Beanie', sizes: ['Adult (small - medium)', 'Adult (Medium - Large)'], meters: [115, 132], needleMm: 4.5, yarn: 'Hamanaka Amerry', kind: null })
    // Tailles intermédiaires : métrage inconnu
    expect(toPatternInfo({ ...BEANIE, sizes_available: 'S, M, L' }).meters).toEqual([115, null, 132])
    // Taille unique : le plus grand métrage ; sans laine conseillée : la grosseur
    expect(toPatternInfo({ ...BEANIE, sizes_available: 'One size', packs: [] })).toMatchObject({ sizes: [], meters: [132], yarn: 'Worsted' })
    // Sans maximum : le minimum partout
    expect(toPatternInfo({ ...BEANIE, sizes_available: 'S, L', yardage_max: null }).meters).toEqual([115, 115])
    // Rien d'exploitable
    expect(toPatternInfo({})).toEqual({ title: null, sizes: [], meters: [null], needleMm: null, yarn: null, kind: null })
    expect(toPatternInfo({ ...BEANIE, pattern_needle_sizes: [{ metric: 0 }, { metric: 99 }] }).needleMm).toBeNull()
  })

  it('lit le patron par son adresse, avec le jeton du compte', async () => {
    const fetchRavelry = vi.fn<typeof fetch>(async () => Response.json({ pattern: BEANIE }))
    expect(await getRavelryPattern('ladder-rib-beanie', { fetchRavelry, accessToken: 'jeton' })).toMatchObject({ title: 'Ladder Rib Beanie', needleMm: 4.5 })
    expect(String(fetchRavelry.mock.calls[0]![0])).toBe(API_URL)
    expect((fetchRavelry.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe('Bearer jeton')
    await expect(getRavelryPattern('x', { fetchRavelry: vi.fn<typeof fetch>(async () => Response.json({})), accessToken: 'j' })).rejects.toThrow('Patron introuvable sur Ravelry.')
  })
})

describe('patron de Ravelry : lecture du lien', () => {
  const page = () => new Response('<html><head><title>Ravelry: Ladder Rib Beanie</title></head></html>', { headers: { 'content-type': 'text/html' } })
  const post = (url: string) => new Request('https://fn.test/knit-pattern', { method: 'POST', body: JSON.stringify({ link: { url } }) })

  it('compte relié : la page et les infos de Ravelry, sans le modèle', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const fetchPage = vi.fn<typeof fetch>(async () => page())
    const fetchRavelry = vi.fn<typeof fetch>(async () => Response.json({ pattern: BEANIE }))
    const log = vi.fn()
    const handle = createHandler({ apiKey: undefined, fetchModel, fetchPage, log, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry) })
    const response = await handle(post(PAGE_URL))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.title).toBe('Ravelry: Ladder Rib Beanie')
    expect(body.ravelry).toEqual({ title: 'Ladder Rib Beanie', sizes: ['Adult (small - medium)', 'Adult (Medium - Large)'], meters: [115, 132], needleMm: 4.5, yarn: 'Hamanaka Amerry', kind: null })
    expect(fetchModel).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ link: true, ravelry: true }))
  })

  it('page illisible : les infos de Ravelry suffisent, avec leur nom', async () => {
    const fetchPage = vi.fn<typeof fetch>(async () => new Response('', { status: 403 }))
    const fetchRavelry = vi.fn<typeof fetch>(async () => Response.json({ pattern: BEANIE }))
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry) })
    const body = await (await handle(post(PAGE_URL))).json()
    expect(body).toMatchObject({ url: PAGE_URL, title: 'Ladder Rib Beanie', image: null, pdf: null, ravelry: { needleMm: 4.5 } })
  })

  it('compte non relié, autre site ou Ravelry en panne : lecture de la page seule', async () => {
    const fetchPage = vi.fn<typeof fetch>(async () => page())
    const fetchRavelry = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }))
    const log = vi.fn()

    const unlinked = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry, false) })
    expect((await (await unlinked(post(PAGE_URL))).json()).ravelry).toBeNull()
    expect(fetchRavelry).not.toHaveBeenCalled()

    const other = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry) })
    expect((await (await other(post('https://patrons.exemple/bonnet'))).json()).ravelry).toBeNull()
    expect(fetchRavelry).not.toHaveBeenCalled()

    const down = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, log, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry) })
    const response = await down(post(PAGE_URL))
    expect(response.status).toBe(200)
    expect((await response.json()).ravelry).toBeNull()
    expect(log).toHaveBeenCalledWith('ravelry en erreur', { error: 'Ravelry a répondu par une erreur (500).' })
  })

  it('page illisible et pas d’infos Ravelry : l’erreur de la page', async () => {
    const fetchPage = vi.fn<typeof fetch>(async () => new Response('', { status: 404 }))
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, isSignedIn: async () => 'u1', ravelry: oauth(vi.fn(), false) })
    const response = await handle(post(PAGE_URL))
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
