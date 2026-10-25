import { ERIC, LUCILE, mealFixture } from '@/test/fakes'
import type { Ingredient } from './recipes'
import type { ShoppingItem } from './shopping'
import {
  applyTidy,
  buildDraft,
  capitalize,
  defaultSelection,
  isPantry,
  mealIngredients,
  mealSource,
  mealWhen,
  mergeIntoList,
  purchaseQuantity,
  skippedInput,
  skippedMeal,
  toItemInput,
  issueText,
  lineEntries,
  type DraftLine,
  type MealIngredients,
} from './shoppingFromPlan'

const ing = (name: string, quantity: number | null = null, unit: string | null = null): Ingredient => ({ name, quantity, unit, note: null })

const TARTIFLETTE = mealFixture({ id: 'm1', meal_date: '2026-10-26', slot: 'DINNER', people: [LUCILE.id, ERIC.id], recipe: { id: 'r1', is_saved: true, title: 'Tartiflette' } })
const GRATIN = mealFixture({ id: 'm2', meal_date: '2026-10-27', people: [LUCILE.id], recipe: { id: 'r2', is_saved: true, title: 'Gratin' } })

function source(meal = TARTIFLETTE, servings: number | null = 4, ingredients: Ingredient[] = []): MealIngredients {
  return { meal, servings, ingredients }
}

describe('repas', () => {
  it('distingue recette, lien et repas sans ingrédients', () => {
    expect(mealSource(TARTIFLETTE)).toBe('recipe')
    expect(mealSource(mealFixture({ recipe: { url: 'https://exemple.fr/r' } }))).toBe('link')
    expect(mealSource(mealFixture())).toBe('none')
  })

  it('coche par défaut les repas d’aujourd’hui et des jours suivants', () => {
    const past = mealFixture({ id: 'old', meal_date: '2026-10-24' })
    const today = mealFixture({ id: 'today', meal_date: '2026-10-25' })
    expect([...defaultSelection([past, today, GRATIN], '2026-10-25')]).toEqual(['today', 'm2'])
  })

  it('décrit quand a lieu un repas, et ce qui n’a pas pu être repris', () => {
    expect(mealWhen(TARTIFLETTE)).toBe('Lundi 26 octobre · Soir')
    const meal = mealFixture({ id: 'm9', recipe: { title: 'Poulet basquaise', url: 'https://exemple.fr/p' } })
    expect(skippedMeal(meal, 'unreadable-page')).toEqual({
      key: 'meal-m9',
      reason: 'unreadable-page',
      label: 'Poulet basquaise',
      detail: 'Mardi 20 octobre · Midi',
      url: 'https://exemple.fr/p',
    })
    expect(skippedInput(skippedMeal(meal, 'no-ingredients'))).toEqual({ name: 'Ingrédients : Poulet basquaise', quantity: null, unit: null, aisle: 'AUTRE' })
  })
})

describe('quantités', () => {
  it('adapte au nombre de personnes du repas quand la recette l’indique', () => {
    expect(mealIngredients(source(TARTIFLETTE, 4, [ing('lardons', 200, 'g')]))[0]!.quantity).toBe(100)
    expect(mealIngredients(source(TARTIFLETTE, null, [ing('lardons', 200, 'g')]))[0]!.quantity).toBe(200)
  })

  it('arrondit à l’unité supérieure ce qui s’achète à la pièce', () => {
    expect(purchaseQuantity(0.5, null)).toBe(1)
    expect(purchaseQuantity(1.5, 'gousse')).toBe(2)
    expect(purchaseQuantity(2, null)).toBe(2)
    expect(purchaseQuantity(0.75, 'kg')).toBe(0.75)
    expect(purchaseQuantity(null, null)).toBeNull()
  })

  it('repère les basiques du placard', () => {
    expect(['Sel', 'poivre noir', "Huile d'olive", 'piment d’Espelette', 'sucre'].every(isPantry)).toBe(true)
    expect(['sel de céleri'].map(isPantry)).toEqual([true])
    expect(['selle d’agneau', 'pommes', 'sucre glace'].map(isPantry)).toEqual([false, false, true])
  })
})

describe('buildDraft', () => {
  it('additionne les doublons dans des unités compatibles et garde la trace des repas', () => {
    const lines = buildDraft([
      source(TARTIFLETTE, 4, [ing('Pommes de terre', 1, 'kg'), ing('reblochon', 1), ing('crème fraîche', 20, 'cl'), ing('sel'), ing('  ')]),
      source(GRATIN, 2, [ing('pommes de terre', 250, 'g'), ing('crème fraîche', 100, 'ml'), ing('ail', 1, 'gousse'), ing('poivre')]),
    ])
    expect(lines.map((l) => [l.name, l.quantity, l.unit, l.aisle, l.include, l.meals.join(', ')])).toEqual([
      ['Pommes de terre', 0.63, 'kg', 'FRUITS_LEGUMES', true, 'Tartiflette, Gratin'],
      ['reblochon', 1, null, 'CREMERIE', true, 'Tartiflette'],
      ['crème fraîche', 15, 'cl', 'CREMERIE', true, 'Tartiflette, Gratin'],
      ['sel', null, null, 'EPICERIE_SALEE', false, 'Tartiflette'],
      ['ail', 1, 'gousse', 'FRUITS_LEGUMES', true, 'Gratin'],
      ['poivre', null, null, 'EPICERIE_SALEE', false, 'Gratin'],
    ])
    expect(lines.find((l) => l.name === 'sel')!.pantry).toBe(true)
  })

  it('garde deux lignes pour des unités non convertibles, et ignore une unité inconnue', () => {
    const lines = buildDraft([source(GRATIN, null, [ing('tomates', 3), ing('tomates', 200, 'g'), ing('rhum', 1, 'shot'), ing('tomates', 2)])])
    expect(lines.map((l) => [l.name, l.quantity, l.unit])).toEqual([
      ['tomates', 5, null],
      ['tomates', 200, 'g'],
      ['rhum', null, null],
    ])
  })

  it('ne descend jamais à 0 pour une petite quantité adaptée à une personne', () => {
    const [line] = buildDraft([source(GRATIN, 8, [ing('vanille liquide', 0.02, 'l')])])
    expect(line!.quantity).toBe(0.01)
  })

  it('ne compte qu’une fois un repas qui utilise deux fois le même ingrédient', () => {
    const [line] = buildDraft([source(GRATIN, null, [ing('beurre', 20, 'g'), ing('beurre', 30, 'g')])])
    expect(line).toMatchObject({ quantity: 50, meals: ['Gratin'] })
  })
})

describe('signalements', () => {
  const issues = (lines: DraftLine[]) => Object.fromEntries(lines.map((l) => [l.name, l.issues.map(issueText)]))

  it('signale ce qui n’a pas pu être repris tel quel, ingrédient par ingrédient', () => {
    const lines = buildDraft([
      source(GRATIN, null, [
        ing('lardons', 200, 'g'),
        ing('rhum', 1, 'shot'),
        { name: 'yaourt', quantity: null, unit: null, note: '1 pot' },
        { name: 'ciboulette', quantity: null, unit: null, note: 'ciselée' },
        ing('sel'),
        ing('tomates', 3),
        ing('tomates', 200, 'g'),
      ]),
      source(TARTIFLETTE, null, [ing('ciboulette')]),
    ])
    expect(issues(lines)).toEqual({
      lardons: [],
      rhum: ['Unité inconnue : 1 shot rhum (Gratin)'],
      yaourt: ['Quantité dans la précision : yaourt (1 pot) (Gratin)'],
      ciboulette: ['Quantité non précisée (Gratin)', 'Quantité non précisée (Tartiflette)'],
      sel: [],
      tomates: expect.anything(),
    })
    expect(lines.filter((l) => l.name === 'tomates').map((l) => l.issues.map(issueText))).toEqual([
      ['Deux unités différentes : aussi 200 g'],
      ['Deux unités différentes : aussi 3'],
    ])
    expect(lineEntries(lines).map((e) => [e.reason, e.label, e.detail])).toEqual([
      ['to-check', 'Rhum', 'Unité inconnue : 1 shot rhum (Gratin)'],
      ['to-check', 'Yaourt', 'Quantité dans la précision : yaourt (1 pot) (Gratin)'],
      ['to-check', 'Ciboulette', 'Quantité non précisée (Gratin) · Quantité non précisée (Tartiflette)'],
      ['unchecked', 'Sel', 'Gratin'],
      ['to-check', 'Tomates', 'Deux unités différentes : aussi 200 g'],
      ['to-check', 'Tomates', 'Deux unités différentes : aussi 3'],
    ])
  })

  it('un basique repéré par le modèle n’a pas besoin de quantité ; une fusion après renommage lève le doute', () => {
    const lines = applyTidy(buildDraft([source(GRATIN, null, [ing('thym'), ing('tomate', 2), ing('tomates cerises', 200, 'g')])]), [
      { id: 'd1', name: 'thym', aisle: 'FRUITS_LEGUMES', pantry: true },
      { id: 'd3', name: 'tomate cerise', aisle: 'FRUITS_LEGUMES', pantry: false },
    ])
    expect(issues(lines)).toEqual({ thym: [], tomate: [], 'tomate cerise': [] })
  })
})

describe('applyTidy', () => {
  const draft = (): DraftLine[] =>
    buildDraft([source(GRATIN, null, [ing('oignons jaunes', 1), ing('oignon', 2), ing('reblochon', 1), ing('fleur de thym', 1, 'pincée')])])

  it('renomme, reclasse et refusionne ce qui devient identique', () => {
    const lines = applyTidy(draft(), [
      { id: 'd1', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false },
      { id: 'd2', name: 'oignon', aisle: 'FRUITS_LEGUMES', pantry: false },
      { id: 'd3', name: 'reblochon', aisle: 'CREMERIE', pantry: false },
      { id: 'd4', name: 'thym', aisle: 'FRUITS_LEGUMES', pantry: true },
      { id: 'inconnu', name: 'x', aisle: 'AUTRE', pantry: false },
    ])
    expect(lines.map((l) => [l.name, l.quantity, l.aisle, l.pantry, l.include])).toEqual([
      ['oignon', 3, 'FRUITS_LEGUMES', false, true],
      ['reblochon', 1, 'CREMERIE', false, true],
      ['thym', 1, 'FRUITS_LEGUMES', true, false],
    ])
  })

  it('garde la ligne d’origine sans suggestion, et un basique repéré par l’application reste au placard', () => {
    const lines = applyTidy(buildDraft([source(GRATIN, null, [ing('sel'), ing('lait', 1, 'l')])]), [{ id: 'd1', name: 'sel fin', aisle: 'EPICERIE_SALEE', pantry: false }])
    expect(lines.map((l) => [l.name, l.pantry])).toEqual([
      ['sel fin', true],
      ['lait', false],
    ])
  })
})

describe('enregistrement', () => {
  const item = (overrides: Partial<ShoppingItem>): ShoppingItem => ({
    id: 'i1',
    list_id: 'l1',
    name: 'Farine',
    quantity: 200,
    unit: 'g',
    aisle: 'EPICERIE_SALEE',
    checked: false,
    position: 0,
    ...overrides,
  })

  it('met une majuscule et liste les articles décochés', () => {
    expect(capitalize('œufs')).toBe('Œufs')
    const lines = buildDraft([source(GRATIN, null, [ing('sel'), ing('lait', 1, 'l')])])
    expect(toItemInput(lines[1]!)).toEqual({ name: 'Lait', quantity: 1, unit: 'l', aisle: 'CREMERIE' })
    expect(lineEntries(lines)).toEqual([
      { key: 'line-d1', reason: 'unchecked', label: 'Sel', detail: 'Gratin', url: null, input: { name: 'Sel', quantity: null, unit: null, aisle: 'EPICERIE_SALEE' } },
    ])
  })

  it('complète une liste : quantités additionnées, articles cochés ignorés, nouveaux articles', () => {
    const existing = [item({}), item({ id: 'i2', name: 'Lait', quantity: 1, unit: 'l', checked: true }), item({ id: 'i3', name: 'Sel', quantity: null, unit: null })]
    const merge = mergeIntoList(existing, [
      { name: 'farine', quantity: 0.3, unit: 'kg', aisle: 'EPICERIE_SALEE' },
      { name: 'Farine', quantity: 100, unit: 'g', aisle: 'EPICERIE_SALEE' },
      { name: 'Lait', quantity: 50, unit: 'cl', aisle: 'CREMERIE' },
      { name: 'sel', quantity: null, unit: null, aisle: 'EPICERIE_SALEE' },
    ])
    expect(merge.updates.map((u) => [u.item.id, u.quantity])).toEqual([['i1', 600]])
    expect(merge.additions).toEqual([{ name: 'Lait', quantity: 50, unit: 'cl', aisle: 'CREMERIE' }])
    expect(existing[0]!.quantity).toBe(200)
  })
})
