import {
  buildPlanRequest,
  draftWarnings,
  isFragile,
  isLong,
  MAX_PLAN_DISHES,
  openSlots,
  parsePlan,
  setEntry,
  toPlanWeekMeals,
  type Dish,
  type DraftEntry,
  type PlanSlot,
} from './weekPlan'

const L = 'lucile'
const E = 'eric'
const PROFILES = [
  { id: E, display_name: 'Eric' },
  { id: L, display_name: 'Lucile' },
]

const slot = (date: string, s: 'LUNCH' | 'DINNER', people: string[], freeCooks = people, taken: string[] = []): PlanSlot => ({
  date,
  slot: s,
  people,
  freeCooks,
  notes: {},
  taken,
})

const SLOTS: PlanSlot[] = [
  slot('2026-11-09', 'LUNCH', [E]),
  slot('2026-11-09', 'DINNER', [E, L]),
  slot('2026-11-10', 'LUNCH', [E]),
  slot('2026-11-10', 'DINNER', [E, L], [E]),
  slot('2026-11-11', 'LUNCH', [E]),
  slot('2026-11-11', 'DINNER', [E, L], []),
  slot('2026-11-12', 'DINNER', [E, L]),
  slot('2026-11-13', 'DINNER', [], []),
  slot('2026-11-14', 'DINNER', [E, L], [E, L], ['Pizza']),
]

const dish = (id: string, extra: Partial<Dish> = {}): Dish => ({ id, title: id, recipeId: null, minutes: null, servings: null, ingredients: [], ...extra })
const LASAGNES = dish('lasagnes', { minutes: 90, servings: 4, ingredients: ['pâtes', 'bœuf haché', 'tomate'] })
const SALADE = dish('salade', { minutes: 15, servings: 2, ingredients: ['saumon fumé', 'roquette'] })
const SOUPE = dish('soupe', { minutes: 30 })
const DISHES = [LASAGNES, SALADE, SOUPE]

const entry = (date: string, s: 'LUNCH' | 'DINNER', dishId: string, cookId: string | null = null): DraftEntry => ({ date, slot: s, dishId, cookId, why: '' })

describe('plats', () => {
  it('long au-delà de 45 minutes', () => {
    expect(isLong(dish('a', { minutes: 46 }))).toBe(true)
    expect(isLong(dish('a', { minutes: 45 }))).toBe(false)
    expect(isLong(dish('a'))).toBe(false)
  })

  it('fragile : poisson, salade, viande hachée, herbes fraîches… dans les ingrédients ou le titre', () => {
    expect(isFragile(SALADE)).toBe(true)
    expect(isFragile(LASAGNES)).toBe(true)
    expect(isFragile(dish('Moules frites'))).toBe(true)
    expect(isFragile(SOUPE)).toBe(false)
    expect(isFragile(dish('Riz', { ingredients: ['riz', 'oignon'] }))).toBe(false)
  })
})

describe('openSlots', () => {
  it('garde les créneaux avec du monde et sans repas déjà prévu', () => {
    expect(openSlots(SLOTS).map((s) => `${s.date} ${s.slot}`)).not.toContain('2026-11-13 DINNER')
    expect(openSlots(SLOTS).map((s) => `${s.date} ${s.slot}`)).not.toContain('2026-11-14 DINNER')
    expect(openSlots(SLOTS)).toHaveLength(7)
  })

  it('écarte les créneaux déjà passés', () => {
    expect(openSlots([{ ...SLOTS[0]!, past: true }, SLOTS[1]!]).map((s) => s.slot)).toEqual(['DINNER'])
  })
})

describe('buildPlanRequest', () => {
  it('décrit les créneaux ouverts, les personnes et les plats (long, fragile)', () => {
    const request = buildPlanRequest('2026-11-09', SLOTS, [LASAGNES, SOUPE], PROFILES)
    expect(request.start).toBe('2026-11-09')
    expect(request.people).toEqual([
      { id: E, name: 'Eric' },
      { id: L, name: 'Lucile' },
    ])
    expect(request.slots).toHaveLength(7)
    expect(request.slots[3]).toEqual({ key: '2026-11-10|DINNER', day: 'Mardi 10 novembre', slot: 'DINNER', people: [E, L], freeCooks: [E] })
    expect(request.dishes).toEqual([
      { id: 'lasagnes', title: 'lasagnes', minutes: 90, servings: 4, ingredients: ['pâtes', 'bœuf haché', 'tomate'], long: true, fragile: true },
      { id: 'soupe', title: 'soupe', minutes: 30, servings: null, ingredients: [], long: false, fragile: false },
    ])
  })

  it(`borne les plats à ${MAX_PLAN_DISHES} (limite de la fonction)`, () => {
    const many = Array.from({ length: MAX_PLAN_DISHES + 5 }, (_, i) => dish(`d${i}`))
    const request = buildPlanRequest('2026-11-09', SLOTS, many, PROFILES)
    expect(request.dishes).toHaveLength(MAX_PLAN_DISHES)
    expect(request.dishes.at(-1)!.id).toBe(`d${MAX_PLAN_DISHES - 1}`)
  })
})

describe('parsePlan', () => {
  it('garde les placements valides, un plat par créneau, et corrige le cuisinier', () => {
    const data = {
      meals: [
        { slot: '2026-11-09|DINNER', dishId: 'lasagnes', cookId: E, why: 'Soirée libre' },
        { slot: '2026-11-09|DINNER', dishId: 'soupe', cookId: E, why: 'doublon de créneau' },
        { slot: '2026-11-10|LUNCH', dishId: 'lasagnes', cookId: L, why: 'Restes' },
        { slot: '2026-11-11|LUNCH', dishId: 'soupe', cookId: null, why: 'Restes' },
        { slot: '2026-11-12|DINNER', dishId: 'soupe', why: 'sans cuisinier' },
        { slot: '2026-11-13|DINNER', dishId: 'soupe', cookId: E, why: 'personne' },
        { slot: '2026-11-14|DINNER', dishId: 'soupe', cookId: E, why: 'déjà pris' },
        { slot: '2026-11-09|LUNCH', dishId: 'inconnu', cookId: E, why: '' },
        { slot: 'n’importe quoi', dishId: 'soupe' },
        null,
      ],
    }
    expect(parsePlan(data, SLOTS, DISHES)).toEqual([
      { date: '2026-11-09', slot: 'DINNER', dishId: 'lasagnes', cookId: E, why: 'Soirée libre' },
      // Lucile n'est pas là le midi : le premier qui a le temps cuisine.
      { date: '2026-11-10', slot: 'LUNCH', dishId: 'lasagnes', cookId: E, why: 'Restes' },
      { date: '2026-11-11', slot: 'LUNCH', dishId: 'soupe', cookId: null, why: 'Restes' },
      { date: '2026-11-12', slot: 'DINNER', dishId: 'soupe', cookId: E, why: 'sans cuisinier' },
    ])
  })

  it('renvoie une liste vide pour une réponse illisible', () => {
    expect(parsePlan(null, SLOTS, DISHES)).toEqual([])
    expect(parsePlan({ meals: 'x' }, SLOTS, DISHES)).toEqual([])
  })
})

describe('draftWarnings', () => {
  const warnings = (entries: DraftEntry[]) => Object.fromEntries(draftWarnings(entries, SLOTS, DISHES, PROFILES))

  it('aucune alerte pour un brouillon qui respecte les règles', () => {
    expect(warnings([entry('2026-11-09', 'DINNER', 'lasagnes', E), entry('2026-11-10', 'LUNCH', 'lasagnes'), entry('2026-11-10', 'DINNER', 'salade', E)])).toEqual({})
  })

  it('même plat midi et soir', () => {
    expect(warnings([entry('2026-11-09', 'LUNCH', 'soupe', E), entry('2026-11-09', 'DINNER', 'soupe')])).toEqual({
      '2026-11-09|LUNCH': ['Même plat midi et soir'],
      '2026-11-09|DINNER': ['Même plat midi et soir'],
    })
  })

  it('restes trop loin du premier repas', () => {
    expect(warnings([entry('2026-11-09', 'DINNER', 'soupe', E), entry('2026-11-12', 'DINNER', 'soupe')])).toEqual({
      '2026-11-12|DINNER': ['Restes 3 jours après : ça risque de s’abîmer'],
    })
  })

  it('pas assez de portions', () => {
    // Salade pour 2 : 2 personnes le soir, puis 1 le lendemain midi.
    expect(warnings([entry('2026-11-09', 'DINNER', 'salade', E), entry('2026-11-10', 'LUNCH', 'salade')])).toEqual({
      '2026-11-10|LUNCH': ['Pas assez de portions (2 pour 3)'],
    })
  })

  it('plat long sans personne qui a le temps', () => {
    expect(warnings([entry('2026-11-11', 'DINNER', 'lasagnes', E)])['2026-11-11|DINNER']).toEqual(['Plat long : personne n’a le temps de cuisiner'])
    expect(warnings([entry('2026-11-10', 'DINNER', 'lasagnes', L)])['2026-11-10|DINNER']).toEqual(['Plat long : Lucile n’a pas le temps de cuisiner'])
  })

  it('cuisinier absent', () => {
    expect(warnings([entry('2026-11-09', 'LUNCH', 'soupe', L)])['2026-11-09|LUNCH']).toEqual(['Lucile n’est pas là'])
  })

  it('premier repas d’un plat sans cuisinier : il faut quelqu’un pour le préparer', () => {
    expect(warnings([entry('2026-11-09', 'DINNER', 'soupe', null), entry('2026-11-10', 'LUNCH', 'soupe')])).toEqual({
      '2026-11-09|DINNER': ['Personne ne cuisine : c’est le premier repas de ce plat'],
    })
  })

  it('ingrédients fragiles trop tard dans la semaine', () => {
    expect(warnings([entry('2026-11-12', 'DINNER', 'salade', E)])['2026-11-12|DINNER']).toEqual(['Ingrédients fragiles : plutôt en début de semaine'])
    expect(warnings([entry('2026-11-11', 'LUNCH', 'salade', E)])).toEqual({})
  })
})

describe('setEntry', () => {
  it('remplace, ajoute ou vide un créneau', () => {
    const entries = [entry('2026-11-09', 'DINNER', 'soupe', E)]
    expect(setEntry(entries, { date: '2026-11-09', slot: 'DINNER' }, { dishId: 'salade' })).toEqual([{ ...entries[0], dishId: 'salade' }])
    expect(setEntry(entries, { date: '2026-11-10', slot: 'LUNCH' }, { dishId: 'salade', cookId: E })).toEqual([
      entries[0],
      { date: '2026-11-10', slot: 'LUNCH', dishId: 'salade', cookId: E, why: '' },
    ])
    expect(setEntry(entries, { date: '2026-11-09', slot: 'DINNER' }, null)).toEqual([])
    expect(setEntry(entries, { date: '2026-11-10', slot: 'LUNCH' }, { cookId: E })).toEqual(entries)
  })
})

describe('toPlanWeekMeals', () => {
  it('donne les repas à créer avec les personnes du créneau', () => {
    expect(toPlanWeekMeals([entry('2026-11-10', 'DINNER', 'lasagnes', E)], SLOTS)).toEqual([
      { item_id: 'lasagnes', meal_date: '2026-11-10', slot: 'DINNER', people: [E, L], cook_id: E },
    ])
  })
})
