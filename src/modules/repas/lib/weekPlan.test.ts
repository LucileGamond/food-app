import {
  buildPlanRequest,
  draftWarnings,
  isFragile,
  isLong,
  canChooseDay,
  defaultPlanDays,
  dayKind,
  dayNeedsAttention,
  daySummary,
  dishEntries,
  earlierEntry,
  placeDish,
  plannedEaters,
  suggestedPortions,
  planHorizon,
  PLAN_HORIZON_DAYS,
  toggleDay,
  dishPortions,
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

const slot = (date: string, s: 'LUNCH' | 'DINNER', people: string[], freeCooks = people, taken: string[] = [], extra: Partial<PlanSlot> = {}): PlanSlot => ({
  date,
  slot: s,
  people,
  freeCooks,
  notes: {},
  fromAgenda: false,
  taken,
  ...extra,
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

const dish = (id: string, extra: Partial<Dish> = {}): Dish => ({ id, title: id, recipeId: null, minutes: null, servings: null, portions: null, ingredients: [], ...extra })
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

  it('pas assez de portions quand elles sont fixées à la main', () => {
    // Salade cuisinée pour 2 : 2 personnes le soir, puis 1 le lendemain midi.
    const petite = dish('salade', { servings: 2, portions: 2, ingredients: ['roquette'] })
    expect(Object.fromEntries(draftWarnings([entry('2026-11-09', 'DINNER', 'salade', E), entry('2026-11-10', 'LUNCH', 'salade')], SLOTS, [petite], PROFILES))).toEqual({
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
  it('cuisine le plat pour les couverts de tous ses repas, les suivants sont des restes', () => {
    // Lasagnes mardi soir (2 personnes) puis mercredi midi (1) : 3 portions cuisinées d'un coup.
    const entries = [entry('2026-11-11', 'LUNCH', 'lasagnes'), entry('2026-11-10', 'DINNER', 'lasagnes', E)]
    expect(toPlanWeekMeals(entries, SLOTS, [dish('lasagnes')])).toEqual([
      { item_id: 'lasagnes', meal_date: '2026-11-11', slot: 'LUNCH', people: [E], cook_id: null, portions: 0 },
      { item_id: 'lasagnes', meal_date: '2026-11-10', slot: 'DINNER', people: [E, L], cook_id: E, portions: 3 },
    ])
  })

  it('plat placé une seule fois : cuisiné pour les convives du créneau', () => {
    expect(toPlanWeekMeals([entry('2026-11-10', 'DINNER', 'lasagnes', E)], SLOTS, [dish('lasagnes')])).toEqual([
      { item_id: 'lasagnes', meal_date: '2026-11-10', slot: 'DINNER', people: [E, L], cook_id: E, portions: 2 },
    ])
  })

  it('portions fixées sur le plat : elles priment sur les couverts', () => {
    const entries = [entry('2026-11-11', 'LUNCH', 'lasagnes'), entry('2026-11-10', 'DINNER', 'lasagnes', E), entry('2026-11-10', 'LUNCH', 'soupe', E)]
    expect(toPlanWeekMeals(entries, SLOTS, [dish('lasagnes', { portions: 6 }), SOUPE]).map((m) => [m.item_id, m.meal_date, m.portions])).toEqual([
      ['lasagnes', '2026-11-11', 0],
      ['lasagnes', '2026-11-10', 6],
      ['soupe', '2026-11-10', 1],
    ])
  })

  it('plat inconnu (retiré de « À planifier » entre-temps) : sans portions', () => {
    expect(toPlanWeekMeals([entry('2026-11-10', 'DINNER', 'disparu', E)], SLOTS, DISHES)[0]!.portions).toBeNull()
  })
})

describe('plats placés plusieurs fois', () => {
  const first = entry('2026-11-09', 'DINNER', 'soupe', E)

  it('dishEntries et earlierEntry : les repas d’un plat, du premier au dernier', () => {
    const later = entry('2026-11-11', 'LUNCH', 'soupe')
    expect(dishEntries([later, first], 'soupe')).toEqual([first, later])
    expect(earlierEntry([later, first], { date: '2026-11-11', slot: 'LUNCH' }, 'soupe')).toEqual(first)
    expect(earlierEntry([later, first], { date: '2026-11-09', slot: 'DINNER' }, 'soupe')).toBeUndefined()
    expect(earlierEntry([], { date: '2026-11-11', slot: 'LUNCH' }, 'soupe')).toBeUndefined()
  })

  it('plannedEaters et suggestedPortions : les couverts de tous les repas, sauf portions fixées', () => {
    const entries = [first, entry('2026-11-11', 'LUNCH', 'soupe')]
    expect(plannedEaters(entries, SLOTS, 'soupe')).toBe(3)
    expect(plannedEaters(entries, SLOTS, 'lasagnes')).toBe(0)
    expect(suggestedPortions(entries, SLOTS, SOUPE)).toBe(3)
    expect(suggestedPortions(entries, SLOTS, dish('soupe', { portions: 8 }))).toBe(8)
    // Plat pas encore placé : rien à proposer.
    expect(suggestedPortions(entries, SLOTS, LASAGNES)).toBeNull()
  })

  it('placeDish : le premier repas se cuisine, les suivants sont des restes', () => {
    const entries = placeDish([first], SLOTS, { date: '2026-11-11', slot: 'LUNCH' }, 'soupe')
    expect(entries).toEqual([first, { date: '2026-11-11', slot: 'LUNCH', dishId: 'soupe', cookId: null, why: '' }])
  })

  it('placeDish : un plat posé avant ses autres repas leur prend le cuisinier', () => {
    const entries = placeDish([first], SLOTS, { date: '2026-11-09', slot: 'LUNCH' }, 'soupe')
    expect(entries.map((e) => [e.date, e.slot, e.cookId])).toEqual([
      ['2026-11-09', 'DINNER', null],
      ['2026-11-09', 'LUNCH', E],
    ])
  })

  it('placeDish : le premier repas retiré, le suivant se cuisine', () => {
    const entries = placeDish([first, entry('2026-11-11', 'LUNCH', 'soupe')], SLOTS, { date: '2026-11-09', slot: 'DINNER' }, null)
    expect(entries).toEqual([{ date: '2026-11-11', slot: 'LUNCH', dishId: 'soupe', cookId: E, why: '' }])
  })

  it('placeDish : le plat remplacé sur un créneau est remis d’équerre lui aussi', () => {
    const entries = placeDish([first, entry('2026-11-11', 'LUNCH', 'soupe')], SLOTS, { date: '2026-11-09', slot: 'DINNER' }, 'salade')
    expect(entries.map((e) => [e.dishId, e.date, e.cookId])).toEqual([
      ['salade', '2026-11-09', E],
      ['soupe', '2026-11-11', E],
    ])
  })

  it('placeDish : un cuisinier choisi à la main sur le premier repas est gardé', () => {
    const chosen = entry('2026-11-09', 'DINNER', 'soupe', L)
    expect(placeDish([chosen], SLOTS, { date: '2026-11-11', slot: 'LUNCH' }, 'soupe')[0]!.cookId).toBe(L)
  })

  it('placeDish : créneau sans personne libre, le premier venu cuisine ; créneau vide, personne', () => {
    // Mercredi soir : tout le monde est là mais personne n'a le temps.
    expect(placeDish([], SLOTS, { date: '2026-11-11', slot: 'DINNER' }, 'soupe')[0]!.cookId).toBe(E)
    expect(placeDish([], SLOTS, { date: '2026-11-13', slot: 'DINNER' }, 'soupe')[0]!.cookId).toBeNull()
  })
})

describe('portions', () => {
  it('celles du plat priment sur la recette, pour l’IA comme pour les alertes', () => {
    const big = dish('salade', { servings: 2, portions: 6, ingredients: ['roquette'] })
    expect(dishPortions(big)).toBe(6)
    expect(dishPortions(SALADE)).toBe(2)
    expect(buildPlanRequest('2026-11-09', SLOTS, [big], PROFILES).dishes[0]!.servings).toBe(6)
    expect(Object.fromEntries(draftWarnings([entry('2026-11-09', 'DINNER', 'salade', E), entry('2026-11-10', 'LUNCH', 'salade')], SLOTS, [big], PROFILES))).toEqual({})
  })
})

describe('résumé d’un jour', () => {
  const day = (lunch: PlanSlot, dinner: PlanSlot) => [lunch, dinner]

  it('dayKind : corrigé à la main, agenda, habitude, ou tout le monde', () => {
    const plein = day(slot('2026-11-09', 'LUNCH', [E, L]), slot('2026-11-09', 'DINNER', [E, L]))
    expect(dayKind(plein, false, PROFILES)).toBe('all')
    expect(dayKind(plein, true, PROFILES)).toBe('manual')
    const regle = day(slot('2026-11-09', 'LUNCH', [E], [E], [], { notes: { [L]: 'Au travail' } }), slot('2026-11-09', 'DINNER', [E, L]))
    expect(dayKind(regle, false, PROFILES)).toBe('rule')
    const rdv = day(slot('2026-11-09', 'LUNCH', [E, L]), slot('2026-11-09', 'DINNER', [L], [L], [], { fromAgenda: true, notes: { [E]: '20 h Dîner' } }))
    expect(dayKind(rdv, false, PROFILES)).toBe('agenda')
    // Un rendez-vous sur un repas déjà passé ou déjà prévu ne fait plus ouvrir le jour.
    const passe = day(slot('2026-11-09', 'LUNCH', [E, L], [E, L], [], { fromAgenda: true, past: true }), slot('2026-11-09', 'DINNER', [E, L]))
    expect(dayKind(passe, false, PROFILES)).toBe('all')
    expect(dayNeedsAttention('agenda')).toBe(true)
    expect(dayNeedsAttention('rule')).toBe(false)
  })

  it('daySummary : les deux repas réunis quand ils se ressemblent', () => {
    expect(daySummary(day(slot('2026-11-09', 'LUNCH', [E, L]), slot('2026-11-09', 'DINNER', [E, L])), PROFILES)).toBe('Midi et soir : Eric et Lucile')
    expect(daySummary(day(slot('2026-11-09', 'LUNCH', [E]), slot('2026-11-09', 'DINNER', [E, L])), PROFILES)).toBe('Midi : Eric · Soir : Eric et Lucile')
    expect(daySummary(day(slot('2026-11-09', 'LUNCH', []), slot('2026-11-09', 'DINNER', [L])), PROFILES)).toBe('Midi : personne · Soir : Lucile')
  })

  it('daySummary : repas passés et créneaux déjà prévus', () => {
    const slots = day(slot('2026-11-09', 'LUNCH', [E, L], [E, L], [], { past: true }), slot('2026-11-09', 'DINNER', [E, L], [E, L], ['Pizza']))
    expect(daySummary(slots, PROFILES)).toBe('Midi : repas passé · Soir : déjà prévu (Pizza)')
    expect(daySummary([], PROFILES)).toBe('')
  })
})

describe('jours à planifier', () => {
  it('par défaut les 7 prochains jours, parmi 4 semaines proposées', () => {
    expect(planHorizon('2026-11-09')).toHaveLength(PLAN_HORIZON_DAYS)
    expect(defaultPlanDays('2026-11-09')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })

  it('jours libres, 14 jours au plus du premier au dernier', () => {
    const chosen = ['2026-11-12', '2026-11-14']
    expect(canChooseDay(chosen, '2026-11-25')).toBe(true)
    expect(canChooseDay(chosen, '2026-11-26')).toBe(false)
    expect(canChooseDay(chosen, '2026-11-01')).toBe(true)
    expect(canChooseDay(chosen, '2026-10-31')).toBe(false)
    expect(canChooseDay([], '2026-12-31')).toBe(true)
    expect(toggleDay(chosen, '2026-11-13')).toEqual(['2026-11-12', '2026-11-13', '2026-11-14'])
    expect(toggleDay(chosen, '2026-11-12')).toEqual(['2026-11-14'])
    expect(toggleDay(chosen, '2026-11-30')).toEqual(chosen)
  })
})
