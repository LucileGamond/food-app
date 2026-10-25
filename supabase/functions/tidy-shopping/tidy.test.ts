import { createHandler, type Deps } from './handler.ts'
import { AISLES, buildUserMessage, MAX_LINES, parseInput, sanitizeTidy, tidyLines, type TidyInputLine } from './tidy.ts'

const LINES: TidyInputLine[] = [
  { id: 'l1', name: 'oignons jaunes', quantity: 2, unit: null, aisle: 'FRUITS_LEGUMES' },
  { id: 'l2', name: 'oignon', quantity: 100, unit: 'g', aisle: 'FRUITS_LEGUMES' },
  { id: 'l3', name: 'sel fin', quantity: null, unit: null, aisle: 'EPICERIE_SALEE' },
]

const reply = (input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'ranger_courses', input }], usage: { input_tokens: 300, output_tokens: 120 } }), { status: 200 })

function fakeFetch(response: Response | Error) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
}

describe('parseInput', () => {
  it('valide et borne les lignes reçues', () => {
    expect(
      parseInput({
        lines: [
          { id: ' a ', name: '  Farine   T55 ', quantity: 500, unit: 'g', aisle: 'EPICERIE_SALEE' },
          { id: 'b', name: 'truc', quantity: -1, unit: '', aisle: 'RAYON_INCONNU' },
        ],
      }),
    ).toEqual([
      { id: 'a', name: 'Farine T55', quantity: 500, unit: 'g', aisle: 'EPICERIE_SALEE' },
      { id: 'b', name: 'truc', quantity: null, unit: null, aisle: 'AUTRE' },
    ])
  })

  it.each([
    [null, 'Liste vide.'],
    [{ lines: [] }, 'Liste vide.'],
    [{ lines: Array.from({ length: MAX_LINES + 1 }, (_, i) => ({ id: `${i}`, name: 'x' })) }, '150 articles au plus.'],
    [{ lines: [{ id: 'a', name: '  ' }] }, 'Article invalide.'],
    [{ lines: [null] }, 'Article invalide.'],
  ])('refuse une entrée invalide (%#)', (body, message) => {
    expect(() => parseInput(body)).toThrow(message)
  })
})

describe('buildUserMessage', () => {
  it('envoie une ligne compacte par article, avec les rayons possibles', () => {
    expect(buildUserMessage(LINES)).toBe(
      `Rayons possibles : ${AISLES.join(', ')}\n\nid | nom | quantité | rayon proposé\n` +
        'l1 | oignons jaunes | 2 | FRUITS_LEGUMES\nl2 | oignon | 100 g | FRUITS_LEGUMES\nl3 | sel fin |  | EPICERIE_SALEE',
    )
  })
})

describe('sanitizeTidy', () => {
  it('garde les réponses valides et retombe sur les valeurs d’origine sinon', () => {
    const output = {
      lines: [
        { id: 'l1', name: '  Oignon ', aisle: 'FRUITS_LEGUMES', pantry: false },
        { id: 'l1', name: 'doublon ignoré', aisle: 'AUTRE', pantry: true },
        { id: 'l3', name: '', aisle: 'PAS_UN_RAYON', pantry: true },
        { id: 'inconnu', name: 'x', aisle: 'AUTRE', pantry: false },
        'pas un objet',
      ],
    }
    expect(sanitizeTidy(output, LINES)).toEqual([
      { id: 'l1', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false },
      { id: 'l2', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false },
      { id: 'l3', name: 'sel fin', aisle: 'EPICERIE_SALEE', pantry: true },
    ])
    expect(sanitizeTidy(null, LINES.slice(0, 1))).toEqual([{ id: 'l1', name: 'oignons jaunes', aisle: 'FRUITS_LEGUMES', pantry: false }])
  })
})

describe('tidyLines', () => {
  it('impose l’outil et ne demande jamais de quantité au modèle', async () => {
    const doFetch = fakeFetch(reply({ lines: [{ id: 'l1', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false }] }))
    const result = await tidyLines(LINES, { apiKey: 'k', fetch: doFetch })
    expect(result.lines[0]).toEqual({ id: 'l1', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false })
    expect(result.usage).toEqual({ input_tokens: 300, output_tokens: 120 })
    const body = JSON.parse(String(doFetch.mock.calls[0]![1]!.body))
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'ranger_courses' })
    expect(body.tools[0].input_schema.properties.lines.items.required).toEqual(['id', 'name', 'aisle', 'pantry'])
    expect(body).not.toHaveProperty('temperature')
  })

  it('traduit une réponse sans outil', async () => {
    const response = new Response(JSON.stringify({ content: [], stop_reason: 'max_tokens' }), { status: 200 })
    await expect(tidyLines(LINES, { apiKey: 'k', fetch: fakeFetch(response) })).rejects.toMatchObject({
      status: 502,
      message: 'Le regroupement de la liste a échoué (réponse vide : max_tokens).',
    })
  })
})

describe('handler', () => {
  function setup(overrides: Partial<Deps> = {}) {
    const log = vi.fn()
    const deps: Deps = {
      apiKey: 'k',
      fetchModel: fakeFetch(reply({ lines: [{ id: 'l1', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false }] })),
      isSignedIn: vi.fn(async (authorization: string | null) => authorization === 'Bearer ok'),
      log,
      ...overrides,
    }
    return { handler: createHandler(deps), log }
  }
  const post = (body: unknown, authorization = 'Bearer ok') =>
    new Request('https://fn.test/tidy-shopping', { method: 'POST', headers: { authorization }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('renvoie les lignes rangées', async () => {
    const { handler, log } = setup()
    const response = await handler(post({ lines: LINES }))
    expect(response.status).toBe(200)
    expect((await response.json()).lines).toHaveLength(3)
    expect(log).toHaveBeenCalledWith('regroupement réussi', expect.objectContaining({ lines: 3, input_tokens: 300 }))
  })

  it('répond aux requêtes préalables et refuse les autres méthodes', async () => {
    const { handler } = setup()
    expect((await handler(new Request('https://fn.test', { method: 'OPTIONS' }))).headers.get('access-control-allow-origin')).toBe('*')
    expect((await handler(new Request('https://fn.test', { method: 'GET' }))).status).toBe(405)
  })

  it.each([
    ['non connecté', post({ lines: LINES }, 'Bearer anon'), {}, 401, 'Connexion requise.'],
    ['JSON invalide', post('{'), {}, 400, 'Requête invalide.'],
    ['liste vide', post({ lines: [] }), {}, 400, 'Liste vide.'],
    ['sans clé', post({ lines: LINES }), { apiKey: undefined }, 500, 'Le service d’analyse est mal configuré.'],
    ['service surchargé', post({ lines: LINES }), { fetchModel: fakeFetch(new Response('', { status: 529 })) }, 503, 'surchargé'],
    ['erreur inattendue', post({ lines: LINES }), { fetchModel: fakeFetch(new Response('pas du json', { status: 200 })) }, 500, 'Le regroupement a échoué.'],
  ])('%s', async (_name, request, overrides, status, message) => {
    const { handler } = setup(overrides as Partial<Deps>)
    const response = await handler(request)
    expect(response.status).toBe(status)
    expect((await response.json()).error).toContain(message)
  })
})
