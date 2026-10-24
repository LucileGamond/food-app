import type { PageContent } from './extract.ts'
import { buildUserMessage, DEFAULT_MODEL, extractRecipe, ImportError, sanitizeRecipe } from './model.ts'

const STRUCTURED: PageContent = {
  structured: { name: 'Crêpes', yield: '4', ingredients: ['250 g de farine', '3 œufs'], instructions: ['Mélanger.'] },
  text: '',
  title: 'Crêpes',
  imageUrl: null,
}
const TEXT: PageContent = { structured: null, text: 'Crêpes\n- 250 g de farine', title: 'Crêpes | Site', imageUrl: null }

const GOOD = {
  is_recipe: true,
  title: '  Crêpes   légères ',
  servings: 4,
  ingredients: [
    { name: 'farine', quantity: 250, unit: 'g' },
    { name: 'œufs', quantity: 3, unit: null },
    { name: 'sel', quantity: null, unit: 'pincée' },
  ],
  steps: '1. Mélanger.\n\n  2. Cuire.  ',
  tags: ['Dessert', 'rapide', 'dessert'],
}

function fakeFetch(response: Response | Error) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
}

const reply = (input: unknown, extra: object = {}) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'enregistrer_recette', input }], usage: { input_tokens: 812, output_tokens: 240 }, ...extra }), {
    status: 200,
  })

describe('buildUserMessage', () => {
  it('envoie seulement les données structurées quand elles existent', () => {
    const message = buildUserMessage(STRUCTURED, 'https://exemple.fr/crepes', ['dessert', 'végé'])
    expect(message).toBe(
      'Page : https://exemple.fr/crepes\nTags existants : dessert, végé\n\nDonnées structurées de la recette (JSON) :\n' + JSON.stringify(STRUCTURED.structured),
    )
  })

  it('envoie le texte nettoyé sinon, et limite la liste des tags', () => {
    const tags = Array.from({ length: 60 }, (_, i) => `t${i}`)
    const message = buildUserMessage(TEXT, 'https://exemple.fr/crepes', tags)
    expect(message).toContain('Titre de la page : Crêpes | Site\n\nTexte de la page :\nCrêpes\n- 250 g de farine')
    expect(message).toContain('t39')
    expect(message).not.toContain('t40')
    expect(buildUserMessage({ ...TEXT, title: null }, 'https://e.fr', [])).toBe('Page : https://e.fr\n\nTexte de la page :\nCrêpes\n- 250 g de farine')
  })
})

describe('sanitizeRecipe', () => {
  it('normalise une réponse correcte', () => {
    expect(sanitizeRecipe(GOOD, null)).toEqual({
      title: 'Crêpes légères',
      servings: 4,
      ingredients: [
        { name: 'farine', quantity: 250, unit: 'g' },
        { name: 'œufs', quantity: 3, unit: null },
        { name: 'sel', quantity: null, unit: 'pincée' },
      ],
      steps: '1. Mélanger.\n2. Cuire.',
      tags: ['dessert', 'rapide'],
    })
  })

  it('borne et filtre les valeurs douteuses', () => {
    const recipe = sanitizeRecipe(
      {
        title: '',
        servings: 2.5,
        ingredients: [
          { name: '  ', quantity: 1, unit: 'g' },
          { name: 'sucre', quantity: -3, unit: 'x'.repeat(40) },
          { name: 'lait', quantity: 0.3333333, unit: 'l' },
          { name: 'eau', quantity: Number.POSITIVE_INFINITY, unit: 3 },
          'pas un objet',
          ...Array.from({ length: 70 }, (_, i) => ({ name: `ing ${i}`, quantity: 1, unit: null })),
        ],
        steps: 42,
        tags: ['a', 'b', 'c', 'd', 'e', 'f', 7],
      },
      'Titre de secours',
    )
    expect(recipe.title).toBe('Titre de secours')
    expect(recipe.servings).toBeNull()
    expect(recipe.ingredients[0]).toEqual({ name: 'sucre', quantity: null, unit: 'x'.repeat(20) })
    expect(recipe.ingredients[1]).toEqual({ name: 'lait', quantity: 0.333, unit: 'l' })
    expect(recipe.ingredients[2]).toEqual({ name: 'eau', quantity: null, unit: null })
    expect(recipe.ingredients.length).toBeLessThanOrEqual(60)
    expect(recipe.steps).toBe('')
    expect(recipe.tags).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(sanitizeRecipe({ ingredients: [{ name: 'x' }] }, null).title).toBe('Recette importée')
  })

  it('refuse une page qui n’est pas une recette', () => {
    expect(() => sanitizeRecipe({ ...GOOD, is_recipe: false }, null)).toThrow('Aucune recette trouvée sur cette page.')
    expect(() => sanitizeRecipe({ ...GOOD, ingredients: [] }, null)).toThrow(ImportError)
    expect(() => sanitizeRecipe(null, null)).toThrow(ImportError)
  })
})

describe('extractRecipe', () => {
  it('appelle l’API avec un outil imposé et renvoie la recette et la consommation', async () => {
    const doFetch = fakeFetch(reply(GOOD))
    const result = await extractRecipe(STRUCTURED, 'https://exemple.fr/crepes', ['dessert'], { apiKey: 'test-key', fetch: doFetch })
    expect(result.recipe.title).toBe('Crêpes légères')
    expect(result.usage).toEqual({ input_tokens: 812, output_tokens: 240 })

    const [url, init] = doFetch.mock.calls[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init!.headers).toMatchObject({ 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' })
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({ model: DEFAULT_MODEL, temperature: 0, tool_choice: { type: 'tool', name: 'enregistrer_recette' } })
    expect(body.tools[0].input_schema.required).toContain('ingredients')
    expect(body.messages).toEqual([{ role: 'user', content: expect.stringContaining('250 g de farine') }])
  })

  it('utilise le modèle configuré', async () => {
    const doFetch = fakeFetch(reply(GOOD, { usage: undefined }))
    const result = await extractRecipe(TEXT, 'https://e.fr', [], { apiKey: 'k', model: 'autre-modele', fetch: doFetch })
    expect(JSON.parse(String(doFetch.mock.calls[0]![1]!.body)).model).toBe('autre-modele')
    expect(result.usage).toBeNull()
  })

  it.each([
    [new Error('réseau'), 503, 'ne répond pas'],
    [new Response('', { status: 401 }), 500, 'mal configuré'],
    [new Response('', { status: 429 }), 503, 'surchargé'],
    [new Response('', { status: 529 }), 503, 'surchargé'],
    [new Response('', { status: 400 }), 502, 'a échoué'],
    [new Response(JSON.stringify({ content: [{ type: 'text', text: 'non' }] }), { status: 200 }), 502, 'a échoué'],
  ])('traduit les erreurs de l’API (%#)', async (response, status, message) => {
    const promise = extractRecipe(TEXT, 'https://e.fr', [], { apiKey: 'k', fetch: fakeFetch(response) })
    await expect(promise).rejects.toMatchObject({ status, message: expect.stringContaining(message) })
  })
})
