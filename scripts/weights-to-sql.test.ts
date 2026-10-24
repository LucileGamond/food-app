// @ts-expect-error -- script Node en JavaScript, sans déclarations de types
import { parseDate, parseWeights, personKey, weightsJsonToSql } from './weights-to-sql.mjs'

describe('weights-to-sql', () => {
  it('normalise les noms et les dates', () => {
    expect(personKey(' Éric ')).toBe('eric')
    expect(parseDate('14-01-2024')).toBe('2024-01-14')
    expect(parseDate('4/2/2024')).toBe('2024-02-04')
    expect(parseDate('2024-01-14')).toBe('2024-01-14')
    expect(parseDate('31-02-2024')).toBeNull()
    expect(parseDate(null)).toBeNull()
  })

  it('trie, dédoublonne et écarte les entrées vides ou invalides', () => {
    const { rows, rejected } = parseWeights(
      '﻿' +
        JSON.stringify([
          { date: '27-06-2024', lucile: 65.0, eric: 72.6 },
          { date: '14-01-2024', lucile: 78.54 },
          { date: '14-06-2026' },
          { date: 'n/a', lucile: 60 },
          { date: '06-01-2026', eric: 74 },
          { date: '06-01-2026', eric: '74,2', lucile: 5 },
          'texte',
        ]),
    )
    expect(rows).toEqual([
      { person: 'lucile', date: '2024-01-14', kg: 78.5 },
      { person: 'eric', date: '2024-06-27', kg: 72.6 },
      { person: 'lucile', date: '2024-06-27', kg: 65 },
      { person: 'eric', date: '2026-01-06', kg: 74.2 },
    ])
    expect(rejected).toEqual(['lucile le 2026-01-06 : 5'])
  })

  it('produit un SQL idempotent qui retrouve les profils par leur nom', () => {
    const sql = weightsJsonToSql(JSON.stringify([{ date: '14-01-2024', lucile: 78.5 }, { date: "15-01-2024", "o'neil": 70 }]))
    expect(sql).toContain("('lucile', date '2024-01-14', 78.5)")
    expect(sql).toContain("('o''neil', date '2024-01-15', 70.0)")
    expect(sql).toContain('on conflict (profile_id, measured_on) do update set weight_kg = excluded.weight_kg;')
    expect(sql).toMatch(/^-- 2 pesées \(lucile : 1, o'neil : 1\)/)
  })

  it('refuse un fichier vide ou mal formé', () => {
    expect(() => weightsJsonToSql('[]')).toThrow(/Aucune pesée/)
    expect(() => weightsJsonToSql('{}')).toThrow(/liste/)
  })
})
