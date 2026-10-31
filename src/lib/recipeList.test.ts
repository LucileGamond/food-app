import { listItem } from '@/test/fakes'
import {
  applyListOptions,
  averageRating,
  collectBooks,
  DEFAULT_LIST_OPTIONS,
  formatHistory,
  formatKcal,
  formatRating,
  isForgotten,
  isVegetarian,
  isVegetarianTag,
  readListOptions,
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
    listItem({ id: '1', title: 'B', source: 'Livre', sourcePage: '146-147', totalMinutes: null, rating: null }),
    listItem({ id: '2', title: 'A', source: 'Livre', sourcePage: '30', totalMinutes: 30, rating: 2, vegetarian: true }),
    listItem({ id: '3', title: 'C', source: null, sourcePage: null, totalMinutes: 31, rating: 5 }),
    listItem({ id: '4', title: 'D', source: 'Autre', sourcePage: null, totalMinutes: 10, rating: 4, lastCooked: '2026-10-30' }),
  ]
  const run = (patch: Partial<typeof DEFAULT_LIST_OPTIONS>) => applyListOptions(recipes, { ...DEFAULT_LIST_OPTIONS, ...patch }, TODAY).map((r) => r.title)

  it('trie, valeurs absentes en dernier', () => {
    expect(run({})).toEqual(['A', 'B', 'C', 'D'])
    expect(run({ sort: 'quick' })).toEqual(['D', 'A', 'C', 'B'])
    expect(run({ sort: 'rating' })).toEqual(['C', 'D', 'A', 'B'])
    expect(run({ sort: 'book' })).toEqual(['D', 'A', 'B', 'C'])
  })

  it('filtre par livre et filtres rapides, cumulés', () => {
    expect(run({ book: 'Livre' })).toEqual(['A', 'B'])
    expect(run({ filters: ['quick'] })).toEqual(['A', 'D'])
    expect(run({ filters: ['quick', 'vegetarian'] })).toEqual(['A'])
    expect(run({ filters: ['forgotten'] })).toEqual(['A', 'B', 'C'])
  })
})

describe('options dans l’adresse', () => {
  it('aller-retour, sans les valeurs par défaut', () => {
    const options = { query: 'tarte', tag: 'dessert', book: 'Pâtisserie maison', filters: ['quick', 'forgotten'] as const, sort: 'book' as const }
    const params = writeListOptions({ ...options, filters: [...options.filters] })
    expect(readListOptions(params)).toEqual({ ...options, filters: [...options.filters] })
    expect(writeListOptions(DEFAULT_LIST_OPTIONS).toString()).toBe('')
  })

  it('ignore les valeurs inconnues', () => {
    expect(readListOptions(new URLSearchParams('tri=nimporte&filtres=,quick,xx'))).toEqual({ ...DEFAULT_LIST_OPTIONS, filters: ['quick'] })
  })
})

describe('affichage', () => {
  it('collectBooks : livres distincts triés', () => {
    expect(collectBooks([{ source: 'b' }, { source: null }, { source: 'A' }, { source: 'b' }])).toEqual(['A', 'b'])
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
