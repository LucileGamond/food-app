// @ts-expect-error -- script Node en JavaScript, sans déclarations de types
import { categoryLabel, foodToSql, parseConsumption, parsePlan } from './food-to-sql.mjs'

const PLAN = JSON.stringify({
  petit_dejeuner: {
    boisson: [{ nom: 'Café au lait', quantity: 250, unit: 'ml', allowedOccurrences: 7 }],
    produit_laitier: [{ nom: 'Lait / skyr', quantity: 150, unit: 'ml_ou_g', allowedOccurrences: 4 }],
  },
  dejeuner: {
    autres: [
      { nom: 'Sauce soja', quantity: null, unit: null, allowedOccurrences: 2 },
      { nom: "Sardine à l'huile", quantity: 110, unit: 'g', allowedOccurrences: 1 },
      { nom: 'Sauce soja', allowedOccurrences: 1 },
      { nom: 'Sans quota' },
    ],
  },
  pool_alimentaire: { aliment_plaisir: [{ nom: 'Petit biscuit', quantity: 1, unit: '', allowedOccurrences: 2 }] },
  sport: [{ nom: 'Renforcement genoux', duree: 10, unit: 'min', allowedOccurrences: 4 }],
})

const CONSUMPTION = JSON.stringify({
  startDate: '2026-10-19',
  endDate: '2026-11-02',
  petit_dejeuner: {
    boisson: [{ nom: 'Café au lait', quantity: 250.0, unit: 'ml', allowedOccurrences: 7, consumedDates: ['2026-10-20', '2026-10-20', '2026-12-01'] }],
  },
  dejeuner: { autres: [{ nom: 'Sauce soja', allowedOccurrences: 2, consumedDates: ['2026-10-19'] }] },
})

describe('food-to-sql', () => {
  it('traduit les catégories', () => {
    expect(categoryLabel('plat_prepare')).toBe('Plat préparé')
    expect(categoryLabel('vegetaux_fruits')).toBe('Végétaux et fruits')
    expect(categoryLabel('nouvelle_categorie')).toBe('Nouvelle categorie')
  })

  it('lit le plan dans l’ordre du fichier, sport compris', () => {
    const { items, skipped } = parsePlan(PLAN)
    expect(items.map((i: { meal: string; name: string }) => `${i.meal}:${i.name}`)).toEqual([
      'BREAKFAST:Café au lait',
      'BREAKFAST:Lait / skyr',
      'LUNCH:Sauce soja',
      "LUNCH:Sardine à l'huile",
      'POOL:Petit biscuit',
      'SPORT:Renforcement genoux',
    ])
    expect(items[1]).toMatchObject({ category: 'Produit laitier', quantity: 150, unit: 'ml ou g', allowed: 4 })
    expect(items[2]).toMatchObject({ quantity: null, unit: null })
    expect(items[4]).toMatchObject({ quantity: 1, unit: null })
    expect(items[5]).toMatchObject({ category: 'Sport', quantity: 10, unit: 'min', allowed: 4 })
    expect(items.map((i: { position: number }) => i.position)).toEqual([...items.map((i: { position: number }) => i.position)].sort((a, b) => a - b))
    expect(skipped).toEqual(['dejeuner / Sauce soja (doublon)', 'dejeuner / autres : Sans quota'])
  })

  it('refuse un plan vide', () => {
    expect(() => parsePlan('{}')).toThrow('aucun aliment')
  })

  it('lit une période, ajoute le sport du plan et ignore les dates hors période', () => {
    const period = parseConsumption(CONSUMPTION, parsePlan(PLAN).items)
    expect(period).toMatchObject({ start: '2026-10-19', end: '2026-11-02', outside: ['Café au lait le 2026-12-01'] })
    expect(period.items.map((i: { name: string; dates: string[] }) => [i.name, i.dates])).toEqual([
      ['Café au lait', ['2026-10-20', '2026-10-20']],
      ['Sauce soja', ['2026-10-19']],
      ['Renforcement genoux', []],
    ])
    expect(() => parseConsumption('{"startDate":"2026-10-19","endDate":"2026-10-01"}')).toThrow('invalides')
  })

  it('génère un SQL idempotent', () => {
    const sql = foodToSql({ planText: '﻿' + PLAN, consumptionTexts: [CONSUMPTION], person: 'Éric' })
    expect(sql).toContain("= 'eric'")
    expect(sql).toContain('delete from public.food_plan_items where profile_id')
    expect(sql).toContain("start_date = date '2026-10-19' and end_date = date '2026-11-02'")
    expect(sql).toContain("('BREAKFAST', 'Café au lait', '2026-10-20', 0)")
    expect(sql).toContain("('BREAKFAST', 'Café au lait', '2026-10-20', 1)")
    expect(sql).toContain("'Sardine à l''huile'")
    expect(sql).toContain('-- hors période, ignoré : Café au lait le 2026-12-01')
    expect(sql.trim().startsWith('-- Plan de Éric : 6 aliments')).toBe(true)
    expect(sql.trim().endsWith('commit;')).toBe(true)
  })

  it('gère une période sans consommation', () => {
    const empty = JSON.stringify({ startDate: '2026-11-03', endDate: '2026-11-16', dejeuner: { autres: [{ nom: 'Sauce soja', allowedOccurrences: 2 }] } })
    const sql = foodToSql({ planText: PLAN, consumptionTexts: [empty] })
    expect(sql).toContain('select count(*) from items;')
    expect(sql).not.toContain('insert into public.food_consumptions')
  })
})
