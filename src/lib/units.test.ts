import sql from '../../supabase/migrations/20261027000000_ingredient_units.sql?raw'
import shoppingSql from '../../supabase/migrations/20261029000000_shopping_lists.sql?raw'
import { UNITS as FUNCTION_UNITS } from '../../supabase/functions/import-recipe/model.ts'
import { isUnit, splitUnit, UNIT_ALIASES, unitKey, unitLabel, UNITS } from './units'

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
    const shopping = /unit in \((.*?)\)\),/s.exec(shoppingSql)?.[1]
    expect(shopping!.split(',').map((u) => u.trim().replace(/^'|'$/g, ''))).toEqual(UNITS)
  })
})
