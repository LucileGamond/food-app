import type { PageContent } from './extract.ts'
import { buildUserMessage, DEFAULT_MODEL, extractRecipe, ImportError, sanitizeNutrition, sanitizeRecipe } from './model.ts'

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
    { name: 'œufs', quantity: 3, unit: null, note: '  battus ' },
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
        { name: 'farine', quantity: 250, unit: 'g', note: null, section: null },
        { name: 'œufs', quantity: 3, unit: null, note: 'battus', section: null },
        { name: 'sel', quantity: null, unit: 'pincée', note: null, section: null },
      ],
      steps: '1. Mélanger.\n2. Cuire.',
      tags: ['dessert', 'rapide'],
      checks: [],
      source: null,
      page: null,
      nutrition: null,
      prep_minutes: null,
      rest_minutes: null,
      cook_minutes: null,
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
    expect(recipe.ingredients[0]).toEqual({ name: 'sucre', quantity: null, unit: 'x'.repeat(30), note: null, section: null })
    expect(recipe.ingredients[1]).toEqual({ name: 'lait', quantity: 0.333, unit: 'l', note: null, section: null })
    expect(recipe.ingredients[2]).toEqual({ name: 'eau', quantity: null, unit: null, note: null, section: null })
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

describe('détails : sous-parties, temps, source', () => {
  it('garde les sous-parties, les temps plausibles et la source', () => {
    const recipe = sanitizeRecipe(
      {
        ...GOOD,
        ingredients: [{ name: 'beurre', quantity: 50, unit: 'g', section: '  Pour le streusel ' }],
        prep_minutes: 10,
        rest_minutes: 120,
        cook_minutes: 40.5,
        source: ' Pâtisserie maison, p. 146 ',
      },
      null,
    )
    expect(recipe.ingredients[0]!.section).toBe('Pour le streusel')
    expect([recipe.prep_minutes, recipe.rest_minutes, recipe.cook_minutes, recipe.source]).toEqual([10, 120, null, 'Pâtisserie maison, p. 146'])
    expect(sanitizeRecipe({ ...GOOD, prep_minutes: -5, rest_minutes: 99_999 }, null)).toMatchObject({ prep_minutes: null, rest_minutes: null })
  })

  it('garde le livre et la page séparément', () => {
    expect(sanitizeRecipe({ ...GOOD, source: ' Pâtisserie maison ', page: ' p. 146 ' }, null)).toMatchObject({ source: 'Pâtisserie maison', page: '146' })
    expect(sanitizeRecipe({ ...GOOD, page: 'Page 12-13' }, null).page).toBe('12-13')
    expect(sanitizeRecipe({ ...GOOD, page: 'x'.repeat(40) }, null).page).toHaveLength(20)
    expect(sanitizeRecipe({ ...GOOD, page: 146 }, null).page).toBeNull()
  })

  it('garde les valeurs nutritionnelles plausibles', () => {
    expect(sanitizeRecipe({ ...GOOD, nutrition: { per: '100 g', kcal: 320.4, carbs: 42.56, protein: 4, fat: 15.2 } }, null).nutrition).toEqual({
      per: '100 g',
      kcal: 320,
      carbs: 42.6,
      protein: 4,
      fat: 15.2,
    })
    expect(sanitizeNutrition({ per: 'bol', kcal: 450, carbs: -3, protein: '20', fat: 99_999 })).toEqual({ per: 'portion', kcal: 450, carbs: null, protein: null, fat: null })
    expect(sanitizeNutrition({ per: 'portion', kcal: null, carbs: null, protein: null, fat: null })).toBeNull()
    expect(sanitizeNutrition(null)).toBeNull()
  })
})

describe('ordre des sous-parties', () => {
  it('regroupe chaque sous-partie d’un seul tenant, sans sous-partie d’abord, et suit les points à vérifier', () => {
    const recipe = sanitizeRecipe(
      {
        ...GOOD,
        ingredients: [
          { name: 'farine', quantity: 200, unit: 'g', section: 'Pour la pâte' },
          { name: 'bananes', quantity: 5, unit: null, section: null },
          { name: 'beurre', quantity: 50, unit: 'g', section: 'Pour le streusel' },
          { name: 'sucre', quantity: 50, unit: 'g', section: 'Pour la pâte' },
          { name: 'sel', quantity: null, unit: null, section: null },
        ],
        checks: [
          { ingredient: 1, message: 'Quantité approximative' },
          { ingredient: 3, message: 'Sucre roux ou blanc ?' },
        ],
      },
      null,
    )
    expect(recipe.ingredients.map((i) => [i.name, i.section])).toEqual([
      ['bananes', null],
      ['sel', null],
      ['farine', 'Pour la pâte'],
      ['sucre', 'Pour la pâte'],
      ['beurre', 'Pour le streusel'],
    ])
    expect(recipe.checks).toEqual([
      { ingredient: 0, message: 'Quantité approximative' },
      { ingredient: 3, message: 'Sucre roux ou blanc ?' },
    ])
  })
})

describe('points à vérifier', () => {
  it('garde les points signalés, rattachés au bon ingrédient', () => {
    const recipe = sanitizeRecipe(
      {
        ...GOOD,
        ingredients: [{ name: '' }, ...GOOD.ingredients],
        checks: [
          { ingredient: 2, message: '  Quantité approximative (4 ou 5)  ' },
          { ingredient: 0, message: 'Ligne illisible' },
          { ingredient: null, message: 'Renvoie à la pâte sucrée p. 208' },
          { ingredient: 1, message: '' },
          'pas un objet',
        ],
      },
      null,
    )
    expect(recipe.checks).toEqual([
      { ingredient: 1, message: 'Quantité approximative (4 ou 5)' },
      { ingredient: null, message: 'Ligne illisible' },
      { ingredient: null, message: 'Renvoie à la pâte sucrée p. 208' },
    ])
    expect(sanitizeRecipe({ ...GOOD, checks: Array.from({ length: 20 }, () => ({ ingredient: null, message: 'x' })) }, null).checks).toHaveLength(8)
  })

  it('se fie au nom de l’ingrédient plutôt qu’au numéro, parfois décalé', () => {
    const recipe = sanitizeRecipe(
      {
        ...GOOD,
        ingredients: [
          { name: 'beurre', quantity: 20, unit: 'g' },
          { name: 'sucre roux', quantity: 2, unit: 'c. à s.' },
          { name: 'jus de citron jaune', quantity: 0.5, unit: null },
          { name: 'citron vert', quantity: 1, unit: null },
        ],
        checks: [
          { ingredient: 1, ingredient_name: 'jus de citron jaune', message: '1/2 citron converti en 0,5' },
          { ingredient: 0, ingredient_name: 'Sucre Roux', message: 'Roux ou blanc ?' },
          { ingredient: 3, ingredient_name: 'citron', message: 'Ambigu : numéro gardé' },
          { ingredient: 0, ingredient_name: 'inconnu', message: 'Nom inconnu : numéro gardé' },
        ],
      },
      null,
    )
    expect(recipe.checks).toEqual([
      { ingredient: 2, message: '1/2 citron converti en 0,5' },
      { ingredient: 1, message: 'Roux ou blanc ?' },
      { ingredient: 3, message: 'Ambigu : numéro gardé' },
      { ingredient: 0, message: 'Nom inconnu : numéro gardé' },
    ])
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
    expect(body).toMatchObject({ model: DEFAULT_MODEL, tool_choice: { type: 'tool', name: 'enregistrer_recette' } })
    // Haiku 5.5 refuse temperature / top_p / top_k, et la réflexion adaptative ne doit pas être forcée.
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('thinking')
    expect(JSON.stringify(body.tools)).not.toMatch(/"type":\[/)
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
    [new Response('', { status: 400 }), 502, 'a échoué (400)'],
    [
      new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: inconnu' } }), { status: 404 }),
      502,
      'a échoué (404 – not_found_error : model: inconnu)',
    ],
    [new Response(JSON.stringify({ content: [{ type: 'text', text: 'non' }], stop_reason: 'max_tokens' }), { status: 200 }), 502, '(réponse trop longue)'],
    [new Response(JSON.stringify({ content: [] }), { status: 200 }), 502, '(réponse sans recette)'],
  ])('traduit les erreurs de l’API (%#)', async (response, status, message) => {
    const promise = extractRecipe(TEXT, 'https://e.fr', [], { apiKey: 'k', fetch: fakeFetch(response) })
    await expect(promise).rejects.toMatchObject({ status, message: expect.stringContaining(message) })
  })
})
