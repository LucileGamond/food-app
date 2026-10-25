import shoppingSql from '../../supabase/migrations/20261029000000_shopping_lists.sql?raw'
import { AISLES as FUNCTION_AISLES } from '../../supabase/functions/tidy-shopping/tidy.ts'
import {
  AISLES,
  aisleLabel,
  convertQuantity,
  defaultListName,
  emptyItemForm,
  findMergeTarget,
  formatAmount,
  groupByAisle,
  guessAisle,
  itemToForm,
  listProgress,
  nextPosition,
  normalizeName,
  toItemInput,
  validateItemForm,
  type ShoppingItem,
} from './shopping'

const item = (overrides: Partial<ShoppingItem>): ShoppingItem => ({
  id: 'i',
  list_id: 'l',
  name: 'x',
  quantity: null,
  unit: null,
  aisle: 'AUTRE',
  checked: false,
  position: 0,
  ...overrides,
})

describe('rayons', () => {
  it.each([
    ['Pommes', 'FRUITS_LEGUMES'],
    ['pommes de terre', 'FRUITS_LEGUMES'],
    ['Tomates cerises', 'FRUITS_LEGUMES'],
    ['ail', 'FRUITS_LEGUMES'],
    ['Baguette tradition', 'BOULANGERIE'],
    ['Escalopes de poulet', 'BOUCHERIE_POISSON'],
    ['Lardons fumés', 'BOUCHERIE_POISSON'],
    ['Œufs', 'CREMERIE'],
    ['Lait demi-écrémé', 'CREMERIE'],
    ['Crème fraîche', 'CREMERIE'],
    ['Pâte brisée', 'CREMERIE'],
    ['Lait de coco', 'EPICERIE_SALEE'],
    ['Pâtes', 'EPICERIE_SALEE'],
    ['Farine', 'EPICERIE_SALEE'],
    ['Thon en boîte', 'EPICERIE_SALEE'],
    ['Poivre', 'EPICERIE_SALEE'],
    ['Poivrons rouges', 'FRUITS_LEGUMES'],
    ['Chocolat noir', 'EPICERIE_SUCREE'],
    ['Thé vert', 'EPICERIE_SUCREE'],
    ['Petits pois surgelés', 'SURGELES'],
    ['Eau gazeuse', 'BOISSONS'],
    ['Bières', 'BOISSONS'],
    ['Liquide vaisselle', 'HYGIENE_MAISON'],
    ['Essuie-tout', 'HYGIENE_MAISON'],
    ['Piles AA', 'AUTRE'],
  ])('« %s » → %s', (name, aisle) => {
    expect(guessAisle(name)).toBe(aisle)
  })

  it('donne le libellé et normalise les noms', () => {
    expect(aisleLabel('EPICERIE_SALEE')).toBe('Épicerie salée')
    expect(normalizeName('  Œufs   FRAIS ')).toBe('oeufs frais')
  })
})

describe('regroupement et affichage', () => {
  it('range les articles par rayon dans l’ordre du magasin, les cochés à part', () => {
    const items = [
      item({ id: 'a', name: 'Lait', aisle: 'CREMERIE', position: 3 }),
      item({ id: 'b', name: 'Pommes', aisle: 'FRUITS_LEGUMES', position: 2 }),
      item({ id: 'c', name: 'Beurre', aisle: 'CREMERIE', position: 1 }),
      item({ id: 'd', name: 'Pain', aisle: 'BOULANGERIE', checked: true, position: 0 }),
    ]
    const { groups, checked } = groupByAisle(items)
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Fruits et légumes', ['b']],
      ['Crèmerie', ['c', 'a']],
    ])
    expect(checked.map((i) => i.id)).toEqual(['d'])
  })

  it('formate les quantités, la progression, le nom par défaut et la position suivante', () => {
    expect(formatAmount({ quantity: 500, unit: 'g' })).toBe('500 g')
    expect(formatAmount({ quantity: 3, unit: 'gousse' })).toBe('3 gousses')
    expect(formatAmount({ quantity: 2, unit: null })).toBe('2')
    expect(formatAmount({ quantity: null, unit: null })).toBe('')
    expect(listProgress({ checked: 3, total: 12 })).toBe('3 / 12')
    expect(defaultListName('2026-10-25')).toBe('Courses du 25 oct.')
    expect(nextPosition([])).toBe(0)
    expect(nextPosition([{ position: 4 }, { position: 2 }])).toBe(5)
  })
})

describe('fusion des doublons', () => {
  it('convertit entre unités compatibles', () => {
    expect(convertQuantity(0.3, 'kg', 'g')).toBe(300)
    expect(convertQuantity(25, 'cl', 'l')).toBe(0.25)
    expect(convertQuantity(2, 'gousse', 'gousse')).toBe(2)
    expect(convertQuantity(2, null, null)).toBe(2)
    expect(convertQuantity(1, 'g', 'ml')).toBeNull()
    expect(convertQuantity(1, 'g', null)).toBeNull()
    expect(convertQuantity(1, 'tasse', 'l')).toBeNull()
  })

  it('additionne dans l’unité de l’article existant', () => {
    const farine = item({ id: 'f', name: 'Farine', quantity: 200, unit: 'g' })
    expect(findMergeTarget([farine], { name: ' farine ', quantity: 0.3, unit: 'kg', aisle: 'EPICERIE_SALEE' })).toEqual({ item: farine, quantity: 500 })
    const oeufs = item({ id: 'o', name: 'Œufs', quantity: 6, unit: null })
    expect(findMergeTarget([oeufs], { name: 'oeufs', quantity: 4, unit: null, aisle: 'CREMERIE' })).toEqual({ item: oeufs, quantity: 10 })
    const sel = item({ id: 's', name: 'Sel' })
    expect(findMergeTarget([sel], { name: 'sel', quantity: null, unit: null, aisle: 'AUTRE' })).toEqual({ item: sel, quantity: null })
  })

  it('crée un nouvel article si rien ne correspond', () => {
    const farine = item({ name: 'Farine', quantity: 200, unit: 'g' })
    expect(findMergeTarget([farine], { name: 'Farine', quantity: 1, unit: 'sachet', aisle: 'AUTRE' })).toBeNull()
    expect(findMergeTarget([farine], { name: 'Farine', quantity: null, unit: null, aisle: 'AUTRE' })).toBeNull()
    expect(findMergeTarget([{ ...farine, checked: true }], { name: 'Farine', quantity: 100, unit: 'g', aisle: 'AUTRE' })).toBeNull()
    expect(findMergeTarget([farine], { name: 'Sucre', quantity: 100, unit: 'g', aisle: 'AUTRE' })).toBeNull()
  })
})

describe('formulaire d’article', () => {
  it('valide et convertit la saisie', () => {
    const ok = { name: '  Farine ', quantity: '1,5', unit: 'kg', aisle: 'EPICERIE_SALEE' as const }
    expect(validateItemForm(ok)).toEqual({})
    expect(toItemInput(ok)).toEqual({ name: 'Farine', quantity: 1.5, unit: 'kg', aisle: 'EPICERIE_SALEE' })
    expect(toItemInput({ ...ok, quantity: '', unit: '' })).toMatchObject({ quantity: null, unit: null })
    expect(validateItemForm({ ...ok, name: ' ' })).toEqual({ name: 'Nom requis' })
    expect(validateItemForm({ ...ok, name: 'x'.repeat(121) })).toEqual({ name: '120 caractères maximum' })
    expect(validateItemForm({ ...ok, quantity: 'deux' })).toEqual({ quantity: 'Quantité invalide' })
    expect(validateItemForm({ ...ok, quantity: '0' })).toEqual({ quantity: 'Quantité invalide' })
    expect(validateItemForm({ ...ok, unit: 'pluche' })).toEqual({ unit: 'Unité inconnue' })
    expect(emptyItemForm()).toEqual({ name: '', quantity: '', unit: '', aisle: 'AUTRE' })
    expect(itemToForm(item({ name: 'Lait', quantity: 1.5, unit: 'l', aisle: 'CREMERIE' }))).toEqual({ name: 'Lait', quantity: '1,5', unit: 'l', aisle: 'CREMERIE' })
  })
})

describe('rayons', () => {
  it('sont identiques dans l’application, la base et la fonction tidy-shopping', () => {
    const values = /create type public\.shopping_aisle as enum \(([^)]*)\)/.exec(shoppingSql)![1]!
    const sqlAisles = values.split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
    expect(AISLES.map((a) => a.value)).toEqual(sqlAisles)
    expect([...FUNCTION_AISLES]).toEqual(sqlAisles)
  })
})
