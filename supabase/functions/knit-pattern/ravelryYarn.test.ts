import { createHandler } from './handler.ts'
import { compositionOf, getRavelryYarn, searchRavelryYarns, toRavelryYarn, toYarnHit } from './ravelry.ts'
import type { RavelryOAuth, RavelryStore } from './ravelryAuth.ts'

/** Laine de Ravelry, comme la renvoie /yarns/{id}.json (champs utilisés). */
const MERINO = {
  id: 25852,
  name: 'DROPS Merino Extra Fine  ',
  yarn_company: { name: 'Garnstudio' },
  yarn_company_name: 'Garnstudio',
  grams: 50,
  yardage: 115,
  yarn_weight: { name: 'DK' },
  min_needle_size: { metric: 3.5 },
  max_needle_size: { metric: 4 },
  yarn_fibers: [{ percentage: 100, fiber_type: { name: 'Merino' } }],
}

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

const post = (body: unknown) => new Request('https://fn.test/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

describe('laines de Ravelry : conversion', () => {
  it('composition en français, pourcentages arrondis ; fibres inconnues gardées', () => {
    expect(compositionOf(MERINO.yarn_fibers)).toBe('100 % mérinos')
    expect(
      compositionOf([
        { percentage: 70, fiber_type: { name: 'Alpaca' } },
        { percentage: 29.6, fiber_type: { name: 'Silk' } },
        { fiber_type: { name: 'Qiviut' } },
        { percentage: 5 },
      ]),
    ).toBe('70 % alpaga, 30 % soie, qiviut')
    expect(compositionOf([])).toBeNull()
    expect(compositionOf(null)).toBeNull()
  })

  it('aperçu de la recherche : nom nettoyé, métrage en mètres ; sans id ou sans nom : ignorée', () => {
    expect(toYarnHit(MERINO)).toEqual({ id: 25852, brand: 'Garnstudio', name: 'DROPS Merino Extra Fine', weightG: 50, lengthM: 105, category: 'DK' })
    expect(toYarnHit({ id: 1, name: 'X' })).toEqual({ id: 1, brand: null, name: 'X', weightG: null, lengthM: null, category: null })
    expect(toYarnHit({ name: 'X' })).toBeNull()
    expect(toYarnHit({ id: 1, name: ' ' })).toBeNull()
  })

  it('détails → champs d’une laine : aiguilles la plus grosse conseillée', () => {
    expect(toRavelryYarn(MERINO)).toEqual({ brand: 'Garnstudio', name: 'DROPS Merino Extra Fine', composition: '100 % mérinos', weight_g: 50, length_m: 105, needle_mm: 4 })
    expect(toRavelryYarn({ ...MERINO, yarn_company: null, max_needle_size: null })).toMatchObject({ brand: 'Garnstudio', needle_mm: 3.5 })
    expect(toRavelryYarn({})).toEqual({ brand: null, name: null, composition: null, weight_g: null, length_m: null, needle_mm: null })
  })
})

describe('laines de Ravelry : API', () => {
  it('recherche (6 au plus, les plus pertinentes), puis détails par id', async () => {
    const fetchRavelry = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('/yarns/search.json') ? Response.json({ yarns: [MERINO, { name: 'sans id' }] }) : Response.json({ yarn: MERINO }),
    )
    const deps = { fetchRavelry, accessToken: 'jeton' }
    expect(await searchRavelryYarns(' drops merino ', deps)).toHaveLength(1)
    expect(Object.fromEntries(new URL(String(fetchRavelry.mock.calls[0]![0])).searchParams)).toEqual({ query: 'drops merino', page_size: '6', sort: 'best' })
    expect(await getRavelryYarn(25852, deps)).toMatchObject({ name: 'DROPS Merino Extra Fine' })
    expect(String(fetchRavelry.mock.calls[1]![0])).toBe('https://api.ravelry.com/yarns/25852.json?')
    expect(await searchRavelryYarns('  ', deps)).toEqual([])
    await expect(getRavelryYarn(1, { fetchRavelry: vi.fn<typeof fetch>(async () => Response.json({})), accessToken: 'j' })).rejects.toThrow('Laine introuvable sur Ravelry.')
  })
})

describe('laines de Ravelry : fonction', () => {
  it('cherche et détaille une laine sans le modèle (ni clé ni budget)', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const checkBudget = vi.fn(async () => 'Budget atteint.')
    const fetchRavelry = vi.fn<typeof fetch>(async (input) => (String(input).includes('search') ? Response.json({ yarns: [MERINO] }) : Response.json({ yarn: MERINO })))
    const log = vi.fn()
    const handle = createHandler({ apiKey: undefined, fetchModel, checkBudget, log, isSignedIn: async () => 'u1', ravelry: oauth(fetchRavelry) })

    const search = await handle(post({ ravelry_yarns: { query: 'drops merino' } }))
    expect(search.status).toBe(200)
    expect((await search.json()).yarns[0]).toMatchObject({ id: 25852, lengthM: 105 })
    const detail = await handle(post({ ravelry_yarn: { id: 25852 } }))
    expect(await detail.json()).toEqual({ yarn: { brand: 'Garnstudio', name: 'DROPS Merino Extra Fine', composition: '100 % mérinos', weight_g: 50, length_m: 105, needle_mm: 4 } })
    expect(fetchModel).not.toHaveBeenCalled()
    expect(checkBudget).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ravelryYarns: 1 }))
  })

  it('demandes invalides : 400', async () => {
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1', ravelry: oauth(vi.fn()) })
    for (const [body, error] of [
      [{ ravelry_yarns: { query: ' ' } }, 'Tape le nom de la laine.'],
      [{ ravelry_yarns: { query: 'x'.repeat(101) } }, 'Tape le nom de la laine.'],
      [{ ravelry_yarn: { id: '12' } }, 'Laine inconnue.'],
      [{ ravelry_yarn: { id: 1.5 } }, 'Laine inconnue.'],
    ] as const) {
      const response = await handle(post(body))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error })
    }
  })

  it('compte non relié : 409 lisible ; Ravelry en erreur : 502 lisible', async () => {
    const unlinked = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1', ravelry: oauth(vi.fn(), false) })
    const response = await unlinked(post({ ravelry_yarns: { query: 'merino' } }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Relie ton compte Ravelry dans les Réglages pour chercher une laine.' })

    const down = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1', ravelry: oauth(vi.fn<typeof fetch>(async () => new Response('', { status: 500 }))) })
    const failed = await down(post({ ravelry_yarn: { id: 1 } }))
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({ error: 'Ravelry a répondu par une erreur (500).' })
  })
})
