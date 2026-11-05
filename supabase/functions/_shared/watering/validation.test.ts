import { describe, expect, it } from 'vitest'
import { monthsAreContiguous, validateRules } from './validation.ts'

const base = { months: [6, 7, 8], firstWateringOn: '2026-06-05', intervalCount: 1, intervalUnit: 'month' as const, amountMl: 1000 }

describe('monthsAreContiguous', () => {
  it.each([
    [[6, 7, 8], true],
    [[11, 12, 1, 2], true],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], true],
    [[5], true],
    [[1, 3], false],
    [[12, 1, 6], false],
  ])('%j → %s', (months, expected) => {
    expect(monthsAreContiguous(months)).toBe(expected)
  })
})

describe('validateRules', () => {
  it('accepte des règles saisonnières qui ne se chevauchent pas', () => {
    expect(validateRules([base, { ...base, months: [11, 12, 1, 2], firstWateringOn: '2026-11-15', intervalUnit: 'week', intervalCount: 6 }])).toEqual([])
  })

  it('exige au moins un mois', () => {
    expect(validateRules([{ ...base, months: [] }])).toEqual([{ index: 0, field: 'months', message: 'Choisis au moins un mois.' }])
  })

  it('refuse les mois en double ou hors 1-12', () => {
    expect(validateRules([{ ...base, months: [6, 6] }])[0]?.message).toBe('Mois invalides.')
    expect(validateRules([{ ...base, months: [13] }])[0]?.message).toBe('Mois invalides.')
  })

  it('refuse des mois qui ne se suivent pas', () => {
    expect(validateRules([{ ...base, months: [6, 8] }])[0]).toMatchObject({ field: 'months' })
  })

  it('refuse deux règles qui couvrent le même mois', () => {
    const issues = validateRules([base, { ...base, months: [8, 9], firstWateringOn: '2026-09-01' }])
    expect(issues).toEqual([{ index: 1, field: 'months', message: 'Août est déjà couvert par la règle 1.' }])
  })

  it('exige une date de 1er arrosage valide, dans les mois choisis', () => {
    expect(validateRules([{ ...base, firstWateringOn: '' }])).toEqual([{ index: 0, field: 'firstWateringOn', message: 'Indique la date du 1er arrosage.' }])
    expect(validateRules([{ ...base, firstWateringOn: '2026-05-31' }])[0]?.field).toBe('firstWateringOn')
  })

  it('borne la fréquence et la quantité', () => {
    const issues = validateRules([{ ...base, intervalCount: 0, amountMl: 0.5 }])
    expect(issues.map((i) => i.field)).toEqual(['intervalCount', 'amountMl'])
    expect(validateRules([{ ...base, intervalCount: 366, amountMl: 100_001 }])).toHaveLength(2)
  })
})
