import { listItem } from '@/test/fakes'
import {
  toRecipeListItem,
  applyListOptions,
  averageRating,
  collectOrigins,
  DEFAULT_LIST_OPTIONS,
  formatHistory,
  formatKcal,
  formatRating,
  isForgotten,
  isVegetarian,
  isVegetarianTag,
  readListOptions,
  recipeOrigins,
  totalMinutes,
  writeListOptions,
} from './recipeList'

const TODAY = '2026-10-31'

describe('totalMinutes', () => {
  it('additionne les temps renseignés, null sans aucun', () => {
    expect(totalMinutes({ prep: 20, rest: null, cook: 40 })).toBe(60)
    expect(totalMinutes({ prep: 0, rest: null, cook: null })).toBe(0)
    expect(totalMinutes({ prep: null, rest: null, cook: null })).toBeNull()
  })
})

describe('isVegetarian', () => {
  it('suit un tag végé ou viande', () => {
    expect(isVegetarian({ tags: ['Végé'], ingredientNames: ['poulet'] })).toBe(true)
    expect(isVegetarian({ tags: ['végétarienne'], ingredientNames: [] })).toBe(true)
    expect(isVegetarian({ tags: ['Poisson'], ingredientNames: ['courgette'] })).toBe(false)
  })

  it('reconnaît les tags végé', () => {
    expect(['végé', 'Veggie', 'végétariens', 'vegan', 'VEGE'].every(isVegetarianTag)).toBe(true)
    expect(['végétal et gourmand', 'légumes'].some(isVegetarianTag)).toBe(false)
  })

  it('sans tag, regarde les ingrédients', () => {
    expect(isVegetarian({ tags: [], ingredientNames: ['lentilles corail', 'lait de coco', 'oignon'] })).toBe(true)
    expect(isVegetarian({ tags: [], ingredientNames: ['lentilles', 'lardons fumés'] })).toBe(false)
    expect(isVegetarian({ tags: [], ingredientNames: ['salade', 'thon en boîte'] })).toBe(false)
    expect(isVegetarian({ tags: [], ingredientNames: ['tomates', 'filets d’anchois'] })).toBe(false)
    expect(isVegetarian({ tags: [], ingredientNames: ['Blancs de poulet'] })).toBe(false)
  })

  it('sans ingrédient ni tag, on ne sait pas : non', () => {
    expect(isVegetarian({ tags: [], ingredientNames: [] })).toBe(false)
  })
})

describe('isForgotten', () => {
  it('jamais cuisinée ou pas depuis plus de 30 jours, sauf si elle est prévue', () => {
    expect(isForgotten({ lastCooked: null, nextPlanned: null }, TODAY)).toBe(true)
    expect(isForgotten({ lastCooked: '2026-09-30', nextPlanned: null }, TODAY)).toBe(true)
    expect(isForgotten({ lastCooked: '2026-10-01', nextPlanned: null }, TODAY)).toBe(false)
    expect(isForgotten({ lastCooked: null, nextPlanned: '2026-11-02' }, TODAY)).toBe(false)
  })
})

describe('applyListOptions', () => {
  const recipes = [
    listItem({ id: '1', title: 'B', source: 'Livre', sourcePage: '146-147', totalMinutes: null, rating: null, mainPhotoPath: '1/a.jpg' }),
    listItem({ id: '2', title: 'A', source: 'Livre', sourcePage: '30', totalMinutes: 30, rating: 2, vegetarian: true }),
    listItem({ id: '3', title: 'C', source: null, sourcePage: null, url: 'https://www.marmiton.org/c', totalMinutes: 31, rating: 5 }),
    listItem({ id: '5', title: 'E', totalMinutes: null }),
    listItem({ id: '4', title: 'D', source: 'Autre', sourcePage: null, totalMinutes: 10, rating: 4, lastCooked: '2026-10-30' }),
  ]
  const run = (patch: Partial<typeof DEFAULT_LIST_OPTIONS>) => applyListOptions(recipes, { ...DEFAULT_LIST_OPTIONS, ...patch }, TODAY).map((r) => r.title)

  it('trie, valeurs absentes en dernier', () => {
    expect(run({})).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(run({ sort: 'quick' })).toEqual(['D', 'A', 'C', 'B', 'E'])
    expect(run({ sort: 'rating' })).toEqual(['C', 'D', 'A', 'B', 'E'])
    expect(run({ sort: 'book' })).toEqual(['D', 'A', 'B', 'C', 'E'])
  })

  it('filtre par source (livre, site, mes recettes) et filtres rapides, cumulés', () => {
    expect(run({ origin: 'livre:Livre' })).toEqual(['A', 'B'])
    expect(run({ origin: 'site:marmiton.org' })).toEqual(['C'])
    expect(run({ origin: 'perso' })).toEqual(['E'])
    expect(run({ filters: ['quick'] })).toEqual(['A', 'D'])
    expect(run({ filters: ['quick', 'vegetarian'] })).toEqual(['A'])
    expect(run({ filters: ['forgotten'] })).toEqual(['A', 'B', 'C', 'E'])
    expect(run({ filters: ['noPhoto'] })).toEqual(['A', 'C', 'D', 'E'])
    expect(run({ filters: ['noPhoto', 'quick'] })).toEqual(['A', 'D'])
  })
})

describe('options dans l’adresse', () => {
  it('aller-retour, sans les valeurs par défaut', () => {
    const options = { query: 'tarte', tag: 'dessert', origin: 'livre:Pâtisserie maison', filters: ['quick', 'forgotten'] as const, sort: 'book' as const }
    const params = writeListOptions({ ...options, filters: [...options.filters] })
    expect(readListOptions(params)).toEqual({ ...options, filters: [...options.filters] })
    expect(writeListOptions(DEFAULT_LIST_OPTIONS).toString()).toBe('')
  })

  it('ignore les valeurs inconnues', () => {
    expect(readListOptions(new URLSearchParams('tri=nimporte&filtres=,quick,xx'))).toEqual({ ...DEFAULT_LIST_OPTIONS, filters: ['quick'] })
  })
})

describe('affichage', () => {
  it('collectOrigins : livres et sites distincts triés, et recettes sans source', () => {
    const recipes = [
      { source: 'b', url: null },
      { source: null, url: 'https://www.marmiton.org/x' },
      { source: 'A', url: 'https://cuisine.exemple.fr/y' },
      { source: 'b', url: 'https://marmiton.org/z' },
    ]
    expect(collectOrigins(recipes)).toEqual({ books: ['A', 'b'], sites: ['cuisine.exemple.fr', 'marmiton.org'], mine: false })
    expect(collectOrigins([...recipes, { source: null, url: null }]).mine).toBe(true)
    expect(recipeOrigins({ source: 'A', url: 'https://cuisine.exemple.fr/y' })).toEqual(['livre:A', 'site:cuisine.exemple.fr'])
    expect(recipeOrigins({ source: null, url: null })).toEqual(['perso'])
  })

  it('averageRating : moyenne au dixième', () => {
    expect(averageRating([4, 5, null])).toBe(4.5)
    expect(averageRating([4, 4, 5])).toBe(4.3)
    expect(averageRating([null])).toBeNull()
  })

  it('formatRating, formatKcal', () => {
    expect(formatRating(4.5)).toBe('4,5')
    expect(formatRating(4)).toBe('4')
    expect(formatKcal(320, null)).toBe('320 kcal / portion')
    expect(formatKcal(180, '100 g')).toBe('180 kcal / 100 g')
    expect(formatKcal(null, 'portion')).toBe('')
  })

  it('formatHistory', () => {
    expect(formatHistory({ timesCooked: 0, lastCooked: null, nextPlanned: null })).toBe('Jamais cuisinée')
    expect(formatHistory({ timesCooked: 1, lastCooked: '2026-10-12', nextPlanned: null })).toBe('Cuisinée le 12 octobre')
    expect(formatHistory({ timesCooked: 4, lastCooked: '2026-10-12', nextPlanned: '2026-11-05' })).toBe(
      'Cuisinée 4 fois, la dernière le 12 octobre · prévue le 5 novembre',
    )
  })
})

describe('recette de la liste', () => {
  const row = {
    id: 'r1',
    title: 'Curry',
    tags: ['rapide'],
    created_at: '2026-10-01T10:00:00Z',
    source: 'Cuisine du monde',
    source_page: '12',
    url: null,
    prep_minutes: 15,
    rest_minutes: null,
    cook_minutes: 20,
    kcal: 450,
    nutrition_per: 'portion',
    recipe_ingredients: [{ name: 'pois chiches' }, { name: 'lait de coco' }],
    recipe_photos: [
      { storage_path: 'r1/b.jpg', position: 1 },
      { storage_path: 'r1/a.jpg', position: 0 },
    ],
    recipe_reviews: [{ rating: 4 }, { rating: 5 }, { rating: null }],
  }

  it('calcule temps total, photo principale, note moyenne et historique', () => {
    expect(toRecipeListItem(row, { times_cooked: 3, last_cooked: '2026-10-20', next_planned: null })).toMatchObject({
      id: 'r1',
      ingredientNames: ['pois chiches', 'lait de coco'],
      mainPhotoPath: 'r1/a.jpg',
      totalMinutes: 35,
      nutritionPer: 'portion',
      vegetarian: true,
      timesCooked: 3,
      lastCooked: '2026-10-20',
      rating: 4.5,
    })
  })

  it('jamais cuisinée, sans photo ni base nutritionnelle connue', () => {
    expect(toRecipeListItem({ ...row, recipe_photos: [], nutrition_per: 'inconnue', recipe_reviews: [] }, undefined)).toMatchObject({
      mainPhotoPath: null,
      nutritionPer: null,
      timesCooked: 0,
      lastCooked: null,
      nextPlanned: null,
      rating: null,
    })
  })
})
