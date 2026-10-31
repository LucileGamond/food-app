import { CIQUAL } from './ciqual.ts'
import { createHandler, type Deps } from './handler.ts'
import { buildUserMessage, candidates, computeEstimate, estimateNutrition, knownGrams, MAX_INGREDIENTS, parseInput, words, type NutritionInput } from './nutrition.ts'

const food = (code: string) => CIQUAL.find((f) => f[0] === code)!
// Codes de la table Ciqual 2025.
const ONION = '20034' // Oignon, cru : 39 kcal, 1,1 g protéines, 6,25 g glucides, 0,62 g lipides
const FLOUR = '9436' // Farine de blé tendre T55 : 350 kcal, 9,03 / 73,7 / 1
const OIL = '17270' // Huile d'olive vierge extra : 899 kcal, 0,25 / 0 / 99,9

const INPUT: NutritionInput = {
  title: 'Tarte à l’oignon',
  servings: 4,
  ingredients: [
    { name: 'oignons', quantity: 3, unit: null, note: 'émincés' },
    { name: 'farine', quantity: 200, unit: 'g', note: null },
    { name: 'huile d’olive', quantity: 2, unit: 'c. à s.', note: null },
    { name: 'sel', quantity: null, unit: null, note: null },
  ],
}
const OPTIONS = [[food(ONION)], [food(FLOUR)], [food(OIL)], []]

const reply = (input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'estimer_ingredients', input }], usage: { input_tokens: 900, output_tokens: 150 } }), { status: 200 })

function fakeFetch(response: Response | Error) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
}

describe('table Ciqual', () => {
  it('contient les aliments de base avec leurs valeurs pour 100 g', () => {
    expect(CIQUAL.length).toBeGreaterThan(3000)
    expect(food(ONION)).toEqual([ONION, 'Oignon, cru', 39, 1.1, 6.25, 0.62])
    expect(new Set(CIQUAL.map((f) => f[0])).size).toBe(CIQUAL.length)
    for (const f of CIQUAL) expect(f[2]).toBeGreaterThanOrEqual(0)
  })
})

describe('parseInput', () => {
  it('valide et borne la recette reçue', () => {
    expect(
      parseInput({
        title: '  Tarte  ',
        servings: 4,
        ingredients: [
          { name: '  Oignons ', quantity: 3, unit: '', note: ' émincés ' },
          { name: 'sel', quantity: -1 },
        ],
      }),
    ).toEqual({
      title: 'Tarte',
      servings: 4,
      ingredients: [
        { name: 'Oignons', quantity: 3, unit: null, note: 'émincés' },
        { name: 'sel', quantity: null, unit: null, note: null },
      ],
    })
    expect(parseInput({ servings: 0, ingredients: [{ name: 'x' }] }).servings).toBeNull()
    expect(parseInput({ servings: 2.5, ingredients: [{ name: 'x' }] }).servings).toBeNull()
  })

  it.each([
    [null, 'Aucun ingrédient.'],
    [{ ingredients: [] }, 'Aucun ingrédient.'],
    [{ ingredients: Array.from({ length: MAX_INGREDIENTS + 1 }, () => ({ name: 'x' })) }, '60 ingrédients au plus.'],
    [{ ingredients: [{ name: ' ' }] }, 'Ingrédient invalide.'],
    [{ ingredients: [null] }, 'Ingrédient invalide.'],
  ])('refuse une entrée invalide (%#)', (body, message) => {
    expect(() => parseInput(body)).toThrow(message)
  })
})

describe('candidats Ciqual', () => {
  it('normalise les mots', () => {
    expect(words('Tomates cerises, crues')).toEqual(['tomate', 'cerise', 'crue'])
    expect(words('Œufs')).toEqual(['oeuf'])
  })

  it.each([
    ['oignons', 'Oignon, cru'],
    ['farine', 'Farine'],
    ['huile d’olive', "Huile d'olive"],
    ['lardons', 'Lardon'],
    ['lait entier', 'Lait entier'],
  ])('propose « %s » → %s…', (name, start) => {
    const found = candidates(name)
    expect(found.length).toBeGreaterThan(0)
    expect(found.length).toBeLessThanOrEqual(12)
    expect(found.some((f) => f[1].startsWith(start))).toBe(true)
  })

  it('ne propose rien sans mot utile', () => {
    expect(candidates('de la')).toEqual([])
    expect(candidates('zzzz')).toEqual([])
  })

  it('poids connu sans le modèle', () => {
    expect(knownGrams(200, 'g')).toBe(200)
    expect(knownGrams(1.5, 'kg')).toBe(1500)
    expect(knownGrams(20, 'cl')).toBe(200)
    expect(knownGrams(2, 'c. à s.')).toBeNull()
    expect(knownGrams(null, 'g')).toBeNull()
  })
})

describe('calcul', () => {
  it('décrit les ingrédients et leurs candidats au modèle', () => {
    const message = buildUserMessage(INPUT, OPTIONS)
    expect(message).toContain('Recette : Tarte à l’oignon (4 portions)')
    expect(message).toContain(`0. oignons (émincés) — 3\n  - ${ONION} : Oignon, cru`)
    expect(message).toContain('1. farine — 200 g')
    expect(message).toContain('3. sel — quantité non indiquée\n  (aucun candidat)')
  })

  it('calcule les totaux par portion à partir de la table, le poids connu l’emporte', () => {
    const estimate = computeEstimate(INPUT, OPTIONS, {
      ingredients: [
        { index: 0, code: ONION, grams: 300 },
        { index: 1, code: FLOUR, grams: 999 }, // 200 g indiqués : le poids du modèle est ignoré
        { index: 2, code: OIL, grams: 20 },
        { index: 3, code: null, grams: null },
      ],
    })
    // Oignon 300 g : 117 kcal ; farine 200 g : 700 kcal ; huile 20 g : 179,8 kcal → 996,8 / 4
    expect(estimate).toEqual({
      per: 'portion',
      kcal: 249,
      protein: round1((3.3 + 18.06 + 0.05) / 4),
      carbs: round1((18.75 + 147.4) / 4),
      fat: round1((1.86 + 2 + 19.98) / 4),
      ingredients: [
        { name: 'oignons', food: { code: ONION, name: 'Oignon, cru' }, grams: 300, kcal: 117 },
        { name: 'farine', food: { code: FLOUR, name: 'Farine de blé tendre ou froment T55 (pour pains)' }, grams: 200, kcal: 700 },
        { name: 'huile d’olive', food: { code: OIL, name: "Huile d'olive vierge extra" }, grams: 20, kcal: 180 },
        { name: 'sel', food: null, grams: null, kcal: null },
      ],
    })
  })

  it('ignore les réponses douteuses : code hors candidats, poids absurde, doublon ; sans portions, pour la recette', () => {
    const estimate = computeEstimate({ ...INPUT, servings: null }, OPTIONS, {
      ingredients: [
        { index: 0, code: FLOUR, grams: 300 }, // la farine n'est pas un candidat de l'oignon
        { index: 0, code: ONION, grams: 300 },
        { index: 1, code: FLOUR, grams: null }, // 200 g indiqués : pas besoin du poids du modèle
        { index: 2, code: OIL, grams: 50_000 },
        'pas un objet',
      ],
    })
    expect(estimate.per).toBe('recette')
    expect(estimate.kcal).toBe(700)
    expect(estimate.ingredients[0]).toEqual({ name: 'oignons', food: null, grams: 300, kcal: null })
    expect(estimate.ingredients[2]).toEqual({ name: 'huile d’olive', food: { code: OIL, name: "Huile d'olive vierge extra" }, grams: null, kcal: null })
    expect(computeEstimate(INPUT, OPTIONS, null).kcal).toBe(0)
  })

  it('appelle le modèle avec les candidats, et refuse une recette dont rien n’est reconnu', async () => {
    const fetch = fakeFetch(reply({ ingredients: [{ index: 0, code: ONION, grams: 300 }] }))
    const { estimate, usage } = await estimateNutrition({ ...INPUT, ingredients: [INPUT.ingredients[0]!] }, { apiKey: 'k', fetch })
    expect(estimate.kcal).toBe(29)
    expect(usage).toMatchObject({ input_tokens: 900 })
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as { messages: { content: string }[] }
    expect(body.messages[0]!.content).toContain(`${ONION} : Oignon, cru`)

    await expect(estimateNutrition(INPUT, { apiKey: 'k', fetch: fakeFetch(reply({ ingredients: [] })) })).rejects.toThrow('Aucun ingrédient n’a pu être reconnu')
  })
})

describe('handler', () => {
  function setup(overrides: Partial<Deps> = {}) {
    const log = vi.fn()
    const deps: Deps = {
      apiKey: 'k',
      fetchModel: fakeFetch(reply({ ingredients: [{ index: 0, code: ONION, grams: 100 }] })),
      isSignedIn: vi.fn(async (authorization: string | null) => authorization === 'Bearer ok'),
      log,
      ...overrides,
    }
    return { handler: createHandler(deps), log }
  }
  const post = (body: unknown, authorization = 'Bearer ok') =>
    new Request('https://fn.test/estimate-nutrition', { method: 'POST', headers: { authorization }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const BODY = { title: 'Soupe', servings: 1, ingredients: [{ name: 'oignon', quantity: 100, unit: 'g' }] }

  it('renvoie l’estimation', async () => {
    const { handler, log } = setup()
    const response = await handler(post(BODY))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ per: 'portion', kcal: 39 })
    expect(log).toHaveBeenCalledWith('calcul réussi', expect.objectContaining({ ingredients: 1, counted: 1, input_tokens: 900 }))
  })

  it('répond aux requêtes préalables et refuse les autres méthodes', async () => {
    const { handler } = setup()
    expect((await handler(new Request('https://fn.test', { method: 'OPTIONS' }))).headers.get('access-control-allow-origin')).toBe('*')
    expect((await handler(new Request('https://fn.test', { method: 'GET' }))).status).toBe(405)
  })

  it.each([
    ['non connecté', post(BODY, 'Bearer anon'), {}, 401, 'Connexion requise.'],
    ['JSON invalide', post('{'), {}, 400, 'Requête invalide.'],
    ['sans ingrédient', post({ ingredients: [] }), {}, 400, 'Aucun ingrédient.'],
    ['sans clé', post(BODY), { apiKey: undefined }, 500, 'Le service d’analyse est mal configuré.'],
    ['rien de reconnu', post(BODY), { fetchModel: fakeFetch(reply({ ingredients: [] })) }, 422, 'Aucun ingrédient'],
    ['service surchargé', post(BODY), { fetchModel: fakeFetch(new Response('', { status: 529 })) }, 503, 'surchargé'],
    ['erreur inattendue', post(BODY), { fetchModel: fakeFetch(new Response('pas du json', { status: 200 })) }, 500, 'Le calcul des calories a échoué.'],
  ])('%s', async (_name, request, overrides, status, message) => {
    const { handler } = setup(overrides as Partial<Deps>)
    const response = await handler(request)
    expect(response.status).toBe(status)
    expect((await response.json()).error).toContain(message)
  })
})

function round1(n: number) {
  return Math.round(n * 10) / 10
}
