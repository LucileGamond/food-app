import { listItem, mealFixture } from '@/test/fakes'
import { buildIdeasInput, ideaKey, ideasPeriod, parseIdeas } from './mealIdeas'
import type { RecipeListItem } from './recipes'

const recipe = (id: string, title: string, ingredientNames: string[] = [], tags: string[] = []): RecipeListItem =>
  listItem({ id, title, tags, ingredientNames })

describe('idées de repas', () => {
  it('prend en compte les 15 derniers jours et les 7 prochains', () => {
    expect(ideasPeriod('2026-10-27')).toEqual({ from: '2026-10-12', to: '2026-11-03' })
  })

  it('écarte les recettes mangées ou prévues, et les donne comme plats récents', () => {
    const input = buildIdeasInput(
      '2026-10-27',
      [recipe('r1', 'Curry de lentilles', ['lentilles', 'riz'], ['végé']), recipe('r2', 'Tartiflette'), recipe('r3', 'Gratin')],
      [
        mealFixture({ id: 'm1', meal_date: '2026-10-20', recipe: { id: 'r2', is_saved: true, title: 'Tartiflette' } }),
        mealFixture({ id: 'm2', meal_date: '2026-10-29', recipe: { id: 'r3', is_saved: true, title: 'Gratin' } }),
        mealFixture({ id: 'm3', meal_date: '2026-10-30', recipe: { id: 'r3', is_saved: true, title: 'Gratin' } }),
        mealFixture({ id: 'm4', meal_date: '2026-10-25', recipe: { id: 'a1', title: ' Pizza ' } }),
      ],
    )
    expect(input).toEqual({
      today: '2026-10-27',
      candidates: [{ id: 'r1', title: 'Curry de lentilles', ingredients: ['lentilles', 'riz'], tags: ['végé'] }],
      recent: ['Tartiflette', 'Gratin', 'Pizza'],
    })
  })

  it('borne ce qui est envoyé', () => {
    const recipes = Array.from({ length: 100 }, (_, i) =>
      recipe(`r${i}`, `Plat ${i}`, Array.from({ length: 30 }, (_, j) => `i${j}`), ['a', 'b', 'c', 'd', 'e', 'f']),
    )
    const meals = Array.from({ length: 60 }, (_, i) => mealFixture({ id: `m${i}`, recipe: { id: `a${i}`, title: `Repas ${i}` } }))
    const input = buildIdeasInput('2026-10-27', recipes, meals)
    expect(input.candidates).toHaveLength(80)
    expect(input.candidates[0]!.ingredients).toHaveLength(15)
    expect(input.candidates[0]!.tags).toHaveLength(5)
    expect(input.recent).toHaveLength(40)
  })

  it('écarte les idées reçues qui n’ont pas la forme attendue', () => {
    expect(
      parseIdeas([
        { source: 'saved', recipeId: 'r1', title: 'Curry', protein: 'lentilles', vegetables: ['carotte', 3], starch: 'riz', vegetarian: true, why: 'Rapide' },
        { source: 'web', url: 'https://www.marmiton.org/x', site: '', title: 'Gratin' },
        { source: 'web', url: 'javascript:alert(1)', title: 'Piège' },
        { source: 'web', url: 'https://', title: 'Adresse cassée' },
        { source: 'saved', title: 'Sans id' },
        { source: 'autre', title: 'x' },
        { source: 'saved', recipeId: 'r2', title: '  ' },
        null,
      ]),
    ).toEqual([
      { source: 'saved', recipeId: 'r1', title: 'Curry', protein: 'lentilles', vegetables: ['carotte'], starch: 'riz', vegetarian: true, why: 'Rapide' },
      { source: 'web', url: 'https://www.marmiton.org/x', site: 'www.marmiton.org', title: 'Gratin', protein: '', vegetables: [], starch: '', vegetarian: false, why: '' },
    ])
    expect(parseIdeas(undefined)).toEqual([])
  })

  it('donne une clé stable à chaque idée', () => {
    const base = { title: 'x', protein: '', vegetables: [], starch: '', vegetarian: true, why: '' }
    expect(ideaKey({ ...base, source: 'saved', recipeId: 'r1' })).toBe('saved:r1')
    expect(ideaKey({ ...base, source: 'web', url: 'https://a.fr/x', site: 'a.fr' })).toBe('web:https://a.fr/x')
  })
})
