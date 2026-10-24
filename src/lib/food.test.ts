import {
  clampToPeriod,
  consumptionsOn,
  containsDate,
  defaultPeriod,
  emptyPlanItemForm,
  formatPeriod,
  formatPortion,
  groupItems,
  itemUsage,
  lastConsumptionOn,
  mealLabel,
  mealStats,
  nextPosition,
  periodLength,
  periodNotice,
  periodProgress,
  planCategories,
  planItemToForm,
  sortConsumptions,
  suggestPeriod,
  toPlanItemInput,
  validatePeriodForm,
  validatePlanItem,
  type Consumption,
  type FoodPeriod,
  type PeriodItem,
  type PlanItem,
} from './food'

let seq = 0
const c = (consumed_on: string, created_at = `2026-10-01T00:00:0${seq % 10}Z`): Consumption => ({ id: `c${++seq}`, consumed_on, created_at })

function item(overrides: Partial<PeriodItem> = {}): PeriodItem {
  return {
    id: 'i1',
    meal: 'LUNCH',
    category: 'Produit laitier',
    name: 'Yaourt',
    quantity: 125,
    unit: 'g',
    allowed_occurrences: 3,
    position: 10,
    consumptions: [],
    ...overrides,
  }
}

const period = (start_date: string, end_date: string, id = `${start_date}`): FoodPeriod => ({ id, profile_id: 'p', start_date, end_date })

describe('affichage', () => {
  it('formate les portions', () => {
    expect(formatPortion(250, 'ml')).toBe('250 ml')
    expect(formatPortion(62.5, 'g')).toBe('62,5 g')
    expect(formatPortion(150, 'ml_ou_g')).toBe('150 ml ou g')
    expect(formatPortion(1, '')).toBe('1')
    expect(formatPortion(1, null)).toBe('1')
    expect(formatPortion(null, 'g')).toBe('')
  })

  it('formate une période', () => {
    expect(formatPeriod(period('2026-10-19', '2026-11-02'))).toBe('19 oct. → 2 nov. 2026')
    expect(formatPeriod(period('2026-12-25', '2027-01-07'))).toBe('25 déc. 2026 → 7 janv. 2027')
  })

  it('donne le libellé des moments', () => {
    expect(mealLabel('BREAKFAST')).toBe('Petit-déjeuner')
    expect(mealLabel('POOL')).toBe('Pool alimentaire')
  })
})

describe('quotas', () => {
  it('trie les consommations par date puis par ordre de saisie', () => {
    const list = [c('2026-10-21', 'b'), c('2026-10-20', 'z'), c('2026-10-21', 'a')]
    expect(sortConsumptions(list).map((x) => [x.consumed_on, x.created_at])).toEqual([
      ['2026-10-20', 'z'],
      ['2026-10-21', 'a'],
      ['2026-10-21', 'b'],
    ])
  })

  it('calcule les pastilles : utilisées, libres', () => {
    const usage = itemUsage(item({ consumptions: [c('2026-10-20')] }))
    expect(usage).toMatchObject({ used: 1, allowed: 3, remaining: 2, over: 0 })
    expect(usage.dots.map((d) => d.kind)).toEqual(['used', 'free', 'free'])
    expect(usage.dots[0]!.date).toBe('2026-10-20')
  })

  it('les consommations au-delà du quota sont hors plan (les plus récentes)', () => {
    const usage = itemUsage(item({ allowed_occurrences: 1, consumptions: [c('2026-10-22'), c('2026-10-20'), c('2026-10-21')] }))
    expect(usage).toMatchObject({ used: 3, remaining: 0, over: 2 })
    expect(usage.dots).toEqual([
      { kind: 'used', date: '2026-10-20' },
      { kind: 'over', date: '2026-10-21' },
      { kind: 'over', date: '2026-10-22' },
    ])
  })

  it('liste les consommations d’un jour et la dernière à retirer', () => {
    const first = c('2026-10-20', '2026-10-20T08:00:00Z')
    const last = c('2026-10-20', '2026-10-20T20:00:00Z')
    const it = item({ consumptions: [last, c('2026-10-21'), first] })
    expect(consumptionsOn(it, '2026-10-20')).toEqual([first, last])
    expect(lastConsumptionOn(it, '2026-10-20')).toBe(last)
    expect(lastConsumptionOn(it, '2026-10-25')).toBeUndefined()
  })

  it('compte par moment : consommations du jour et éléments hors plan', () => {
    const items = [
      item({ id: 'a', allowed_occurrences: 1, consumptions: [c('2026-10-20'), c('2026-10-20')] }),
      item({ id: 'b', consumptions: [c('2026-10-21')] }),
    ]
    expect(mealStats(items, '2026-10-20')).toEqual({ onDate: 2, overItems: 1 })
    expect(mealStats(items, '2026-10-22')).toEqual({ onDate: 0, overItems: 1 })
  })
})

describe('regroupement', () => {
  const items = [
    item({ id: '1', meal: 'DINNER', category: 'Autres', name: 'Ketchup', position: 50 }),
    item({ id: '2', meal: 'BREAKFAST', category: 'Boisson', name: 'Café', position: 10 }),
    item({ id: '3', meal: 'DINNER', category: 'Produit laitier', name: 'Yaourt', position: 40 }),
    item({ id: '4', meal: 'DINNER', category: 'Autres', name: 'Avocat', position: 60 }),
    item({ id: '5', meal: 'DINNER', category: 'Produit laitier', name: 'Fromage blanc', position: 45 }),
  ]

  it('regroupe par moment (ordre fixe) puis par catégorie (ordre d’apparition)', () => {
    const groups = groupItems(items)
    expect(groups.map((g) => g.label)).toEqual(['Petit-déjeuner', 'Dîner'])
    expect(groups[1]!.categories.map((cat) => [cat.name, cat.items.map((i) => i.name)])).toEqual([
      ['Produit laitier', ['Yaourt', 'Fromage blanc']],
      ['Autres', ['Ketchup', 'Avocat']],
    ])
  })

  it('départage les positions égales par nom', () => {
    const groups = groupItems([item({ id: 'x', name: 'Zeste', position: 1 }), item({ id: 'y', name: 'Abricot', position: 1 })])
    expect(groups[0]!.categories[0]!.items.map((i) => i.name)).toEqual(['Abricot', 'Zeste'])
  })
})

describe('périodes', () => {
  const p = period('2026-10-19', '2026-11-02')

  it('mesure et borne une période (dates incluses)', () => {
    expect(periodLength(p)).toBe(15)
    expect(periodLength(period('2026-10-19', '2026-10-19'))).toBe(1)
    expect(containsDate(p, '2026-10-19')).toBe(true)
    expect(containsDate(p, '2026-11-02')).toBe(true)
    expect(containsDate(p, '2026-11-03')).toBe(false)
    expect(clampToPeriod('2026-10-01', p)).toBe('2026-10-19')
    expect(clampToPeriod('2026-12-01', p)).toBe('2026-11-02')
    expect(clampToPeriod('2026-10-24', p)).toBe('2026-10-24')
  })

  it('calcule l’avancement', () => {
    expect(periodProgress(p, '2026-10-24')).toEqual({ day: 6, total: 15, daysLeft: 9 })
    expect(periodProgress(p, '2026-10-01')).toMatchObject({ day: 0 })
    expect(periodProgress(p, '2026-11-05')).toMatchObject({ day: 15, daysLeft: -3 })
  })

  it('choisit la période en cours, sinon la plus récente', () => {
    const old = period('2026-10-01', '2026-10-14')
    const next = period('2026-11-03', '2026-11-16')
    expect(defaultPeriod([next, p, old], '2026-10-24')).toBe(p)
    expect(defaultPeriod([old, p], '2026-12-01')).toBe(p)
    expect(defaultPeriod([], '2026-12-01')).toBeNull()
  })

  it('rappelle la fin de période et l’absence de période en cours', () => {
    expect(periodNotice([], '2026-10-24')).toBeNull()
    expect(periodNotice([p], '2026-10-24')).toBeNull()
    expect(periodNotice([p], '2026-10-31')).toMatchObject({ kind: 'ending', daysLeft: 2, message: expect.stringContaining('dans 2 jours') })
    expect(periodNotice([p], '2026-11-01')?.message).toContain('dans 1 jour :')
    expect(periodNotice([p], '2026-11-02')).toMatchObject({ kind: 'ending', daysLeft: 0, message: expect.stringContaining('aujourd’hui') })
    expect(periodNotice([p], '2026-11-05')).toMatchObject({ kind: 'none' })
    // La suivante est déjà prête : pas de rappel
    expect(periodNotice([p, period('2026-11-03', '2026-11-16')], '2026-11-01')).toBeNull()
    expect(periodNotice([p, period('2026-11-10', '2026-11-16')], '2026-11-05')).toBeNull()
  })

  it('propose la période suivante avec la même durée', () => {
    expect(suggestPeriod([p], '2026-10-24')).toEqual({ start: '2026-11-03', end: '2026-11-17' })
    // Dernière période terminée hier : on enchaîne
    expect(suggestPeriod([p], '2026-11-03')).toEqual({ start: '2026-11-03', end: '2026-11-17' })
    // Dernière période ancienne : on démarre aujourd'hui
    expect(suggestPeriod([p], '2026-12-01')).toEqual({ start: '2026-12-01', end: '2026-12-15' })
    expect(suggestPeriod([], '2026-10-24')).toEqual({ start: '2026-10-24', end: '2026-11-06' })
  })

  it('valide le formulaire de période', () => {
    expect(validatePeriodForm({ start: '', end: '2026-11-01' }, [])).toEqual({ start: 'Date requise' })
    expect(validatePeriodForm({ start: '2026-11-05', end: '2026-11-01' }, [])).toEqual({ end: 'La fin doit être après le début' })
    expect(validatePeriodForm({ start: '2026-01-01', end: '2027-01-02' }, [])).toEqual({ end: 'Une période dure au plus un an' })
    expect(validatePeriodForm({ start: '2026-11-02', end: '2026-11-10' }, [p])).toEqual({ start: 'Chevauche la période du 19 octobre au 2 novembre' })
    expect(validatePeriodForm({ start: '2026-11-03', end: '2026-11-03' }, [p])).toEqual({})
  })
})

describe('plan', () => {
  const existing: PlanItem = { id: 'e', meal: 'LUNCH', category: 'Produit laitier', name: 'Yaourt aromatisé', quantity: 125, unit: 'g', allowed_occurrences: 4, position: 10 }

  it('valide un aliment', () => {
    const ok = { ...emptyPlanItemForm('LUNCH', 'Autres'), name: 'Moutarde', quantity: '5', unit: 'g', allowed: '2' }
    expect(validatePlanItem(ok, [existing])).toEqual({})
    expect(validatePlanItem({ ...ok, name: ' ', category: '' }, [])).toEqual({ name: 'Nom requis', category: 'Catégorie requise' })
    expect(validatePlanItem({ ...ok, name: 'yaourt AROMATISE' }, [existing]).name).toBe('Déjà dans le plan (déjeuner)')
    expect(validatePlanItem({ ...ok, meal: 'DINNER', name: 'Yaourt aromatisé' }, [existing])).toEqual({})
    expect(validatePlanItem({ ...ok, quantity: 'abc' }, []).quantity).toBe('Quantité invalide')
    expect(validatePlanItem({ ...ok, quantity: '0' }, []).quantity).toBe('Quantité invalide')
    expect(validatePlanItem({ ...ok, quantity: '100000' }, []).quantity).toBe('Quantité trop grande')
    expect(validatePlanItem({ ...ok, quantity: '62,5' }, [])).toEqual({})
    expect(validatePlanItem({ ...ok, allowed: '0' }, []).allowed).toBe('Entre 1 et 99')
    expect(validatePlanItem({ ...ok, allowed: '1.5' }, []).allowed).toBe('Entre 1 et 99')
    expect(validatePlanItem({ ...ok, allowed: '100' }, []).allowed).toBe('Entre 1 et 99')
    expect(validatePlanItem({ ...ok, unit: 'x'.repeat(21) }, []).unit).toBe('20 caractères maximum')
    expect(validatePlanItem({ ...ok, name: 'x'.repeat(121) }, []).name).toBe('120 caractères maximum')
    expect(validatePlanItem({ ...ok, category: 'x'.repeat(61) }, []).category).toBe('60 caractères maximum')
  })

  it('convertit le formulaire dans les deux sens', () => {
    const form = planItemToForm({ ...existing, quantity: 62.5 })
    expect(form).toEqual({ meal: 'LUNCH', category: 'Produit laitier', name: 'Yaourt aromatisé', quantity: '62,5', unit: 'g', allowed: '4' })
    expect(toPlanItemInput({ ...form, name: '  Skyr ', unit: ' ' })).toEqual({
      meal: 'LUNCH',
      category: 'Produit laitier',
      name: 'Skyr',
      quantity: 62.5,
      unit: null,
      allowed_occurrences: 4,
    })
    expect(planItemToForm({ ...existing, quantity: null, unit: null })).toMatchObject({ quantity: '', unit: '' })
    expect(toPlanItemInput({ ...form, quantity: '' }).quantity).toBeNull()
  })

  it('liste les catégories et calcule la position d’un nouvel élément', () => {
    const items: PlanItem[] = [
      existing,
      { ...existing, id: 'f', category: 'Autres', name: 'Ketchup', position: 30 },
      { ...existing, id: 'g', meal: 'DINNER', category: 'Autres', name: 'Avocat', position: 80 },
    ]
    expect(planCategories(items)).toEqual(['Autres', 'Produit laitier'])
    expect(nextPosition(items, 'LUNCH', 'Produit laitier')).toBe(11)
    expect(nextPosition(items, 'LUNCH', 'Nouvelle')).toBe(31)
    expect(nextPosition(items, 'SPORT', 'Sport')).toBe(81)
    expect(nextPosition([], 'SPORT', 'Sport')).toBe(1)
  })
})
