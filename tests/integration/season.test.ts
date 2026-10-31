import { buildIdeasInput } from '@/lib/mealIdeas'
import { applyListOptions, DEFAULT_LIST_OPTIONS } from '@/lib/recipeList'
import { recipeSeason } from '@/lib/season'
import { signedInApi } from './helpers'

// Saison calculée sur les recettes telles qu'enregistrées et relues en base (noms d'ingrédients).
describe('saisonnalité des recettes enregistrées', () => {
  it('reconnaît les fruits et légumes relus, filtre et ordonne les idées', async () => {
    const { api } = await signedInApi()
    const stamp = Date.now()
    const save = (title: string, names: string[]) =>
      api.recipes.saveRecipe({ id: null, title: `${title} ${stamp}`, notes: null, url: null, servings: 2, tags: [], ingredients: names.map((name) => ({ name, quantity: 1, unit: null, note: null })) })
    const soup = await save('Soupe de potiron', ['Potiron', 'Poireaux', 'crème fraîche'])
    const ratatouille = await save('Ratatouille', ['tomates', 'courgettes', 'aubergine'])

    const recipes = (await api.recipes.listSavedRecipes('2026-11-05')).filter((r) => r.title.endsWith(String(stamp)))
    const byId = new Map(recipes.map((r) => [r.id, r]))
    expect(recipeSeason(byId.get(soup)!.ingredientNames, 11).status).toBe('in')
    expect(recipeSeason(byId.get(ratatouille)!.ingredientNames, 11).outOfSeason.map((p) => p.slug)).toEqual(['tomate', 'courgette', 'aubergine'])

    const seasonal = applyListOptions(recipes, { ...DEFAULT_LIST_OPTIONS, filters: ['seasonal'] }, '2026-11-05')
    expect(seasonal.map((r) => r.id)).toEqual([soup])
    expect(applyListOptions(recipes, { ...DEFAULT_LIST_OPTIONS, filters: ['seasonal'] }, '2026-07-05').map((r) => r.id)).toEqual([ratatouille])

    const input = buildIdeasInput('2026-11-05', recipes, [])
    expect(input.candidates.map((c) => [c.id, c.season])).toEqual([
      [soup, 'in'],
      [ratatouille, 'out'],
    ])
  })
})
