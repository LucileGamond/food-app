import sql from '../../supabase/migrations/20261027000000_ingredient_units.sql?raw'
import shoppingSql from '../../supabase/migrations/20261029000000_shopping_lists.sql?raw'
import { ENGLISH_UNITS as FUNCTION_ENGLISH_UNITS, UNITS as FUNCTION_UNITS } from '../../supabase/functions/import-recipe/recipe.ts'
import { ENGLISH_UNITS, isUnit, metricText, splitUnit, toMetric, UNIT_ALIASES, unitKey, unitLabel, UNITS } from './units'

describe('unités', () => {
  it('normalise les variantes', () => {
    expect(unitKey('Cuillère(s) à Soupe.')).toBe('cuillereasoupe')
    expect(unitKey("c. à c.")).toBe('cac')
    expect(isUnit('c. à s.')).toBe(true)
    expect(isUnit('cs')).toBe(false)
    expect(isUnit(null)).toBe(false)
  })

  it.each([
    ['g', { unit: 'g', rest: null }],
    ['Grammes', { unit: 'g', rest: null }],
    ['cuillères à soupe', { unit: 'c. à s.', rest: null }],
    ['CàS', { unit: 'c. à s.', rest: null }],
    ['tbsp', { unit: 'c. à s.', rest: null }],
    ['petite cuillère', { unit: 'c. à c.', rest: null }],
    ['c. à s. bombée(s)', { unit: 'c. à s.', rest: 'bombée(s)' }],
    ['c. à c. rase', { unit: 'c. à c.', rest: 'rase' }],
    ['petit morceau', { unit: 'morceau', rest: 'petit' }],
    ['gros  morceaux', { unit: 'morceau', rest: 'gros' }],
    ['poignées', { unit: 'poignée', rest: null }],
    ['Boites', { unit: 'boîte', rest: null }],
    ['pièce', { unit: null, rest: null }],
    ['', { unit: null, rest: null }],
    [null, { unit: null, rest: null }],
  ])('reconnaît « %s »', (raw, expected) => {
    expect(splitUnit(raw)).toEqual(expected)
  })

  it('renvoie null pour une unité inconnue', () => {
    expect(splitUnit('pluche')).toBeNull()
    expect(splitUnit('1 shot')).toBeNull()
  })

  it('accorde l’unité à la quantité', () => {
    expect(unitLabel('gousse', 3)).toBe('gousses')
    expect(unitLabel('morceau', 2)).toBe('morceaux')
    expect(unitLabel('gousse', 1)).toBe('gousse')
    expect(unitLabel('gousse', 1.5)).toBe('gousse')
    expect(unitLabel('gousse', null)).toBe('gousse')
    expect(unitLabel('c. à s.', 3)).toBe('c. à s.')
    expect(unitLabel('noix', 2)).toBe('noix')
    expect(unitLabel('g', 200)).toBe('g')
    expect(unitLabel('inconnue', 2)).toBe('inconnue')
  })

  it('toutes les correspondances mènent à une unité de la liste', () => {
    for (const unit of Object.values(UNIT_ALIASES)) expect(unit === '' || isUnit(unit)).toBe(true)
    for (const unit of UNITS) expect(UNIT_ALIASES[unitKey(unit)]).toBe(unit)
  })

  it('la base et la fonction d’import utilisent la même liste et les mêmes correspondances', () => {
    const aliases = /select '(\{.*?\})'::jsonb/s.exec(sql)?.[1]
    expect(JSON.parse(aliases!)).toEqual(UNIT_ALIASES)
    const check = /unit in \((.*?)\)\);/s.exec(sql)?.[1]
    expect(check!.split(',').map((u) => u.trim().replace(/^'|'$/g, ''))).toEqual(UNITS)
    expect(FUNCTION_UNITS).toEqual(UNITS)
    expect(FUNCTION_ENGLISH_UNITS).toEqual(ENGLISH_UNITS)
    const shopping = /unit in \((.*?)\)\),/s.exec(shoppingSql)?.[1]
    expect(shopping!.split(',').map((u) => u.trim().replace(/^'|'$/g, ''))).toEqual(UNITS)
  })
})

describe('unités anglaises', () => {
  it.each([
    [4, 'oz', { quantity: 115, unit: 'g', rest: null }],
    [1, 'ounce', { quantity: 28, unit: 'g', rest: null }],
    [0.25, 'oz', { quantity: 7, unit: 'g', rest: null }],
    [2, 'lb', { quantity: 905, unit: 'g', rest: null }],
    [3, 'Pounds', { quantity: 1.35, unit: 'kg', rest: null }],
    [1, 'stick', { quantity: 115, unit: 'g', rest: null }],
    [0.5, 'cup', { quantity: 120, unit: 'ml', rest: null }],
    [1.5, 'cups packed', { quantity: 360, unit: 'ml', rest: 'packed' }],
    [2, 'fl oz', { quantity: 60, unit: 'ml', rest: null }],
    [1, 'quart', { quantity: 945, unit: 'ml', rest: null }],
    [1, 'gallon', { quantity: 3.8, unit: 'l', rest: null }],
    [0.02, 'oz', { quantity: 0.6, unit: 'g', rest: null }],
    [null, 'cups', { quantity: null, unit: 'ml', rest: null }],
  ])('convertit %s %s', (quantity, unit, expected) => {
    expect(toMetric(quantity, unit)).toEqual(expected)
  })

  it('ignore les autres unités', () => {
    expect(toMetric(2, 'tbsp')).toBeNull()
    expect(toMetric(2, 'g')).toBeNull()
    expect(toMetric(2, '')).toBeNull()
    expect(toMetric(2, null)).toBeNull()
  })

  it('chaque unité anglaise de la fonction d’import est convertie', () => {
    for (const unit of ENGLISH_UNITS) expect(toMetric(1, unit)).not.toBeNull()
  })

  it.each([
    ['Preheat oven to 350°F.', 'Preheat oven to 175 °C.'],
    ['Préchauffer le four à 425 °F', 'Préchauffer le four à 220 °C'],
    ['Bake at 400 degrees F for 20 min', 'Bake at 205 °C for 20 min'],
    ['Préchauffer à 350 °F (180 °C).', 'Préchauffer à 180 °C.'],
    ['Graisser un moule de 9 x 13 inches', 'Graisser un moule de 23 x 33 cm'],
    ['a 9-inch pan', 'a 23 cm pan'],
    ['un moule de 8 pouces', 'un moule de 20 cm'],
    ['Cuire 20 min à 180 °C', 'Cuire 20 min à 180 °C'],
    ['Ajouter 2 fines herbes', 'Ajouter 2 fines herbes'],
  ])('convertit « %s »', (text, expected) => {
    expect(metricText(text)).toBe(expected)
  })
})
