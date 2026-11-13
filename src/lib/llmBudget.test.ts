import { budgetView, creditView, formatUsd, parseAmount } from './llmBudget'

describe('budgetView', () => {
  it('dépense du mois en euros, reste et part du budget', () => {
    // 2,50 $ × 0,86 = 2,15 €
    expect(budgetView({ monthlyEur: 5, spentUsd: 2.5 })).toEqual({ monthlyEur: 5, spentEur: 2.15, remainingEur: 2.85, ratio: 0.43, reached: false })
  })
  it('budget atteint : reste nul, part plafonnée ; sans budget : rien à comparer', () => {
    expect(budgetView({ monthlyEur: 1, spentUsd: 2 })).toMatchObject({ remainingEur: 0, ratio: 1, reached: true })
    expect(budgetView({ monthlyEur: null, spentUsd: 2 })).toEqual({ monthlyEur: null, spentEur: 1.72, remainingEur: null, ratio: null, reached: false })
  })
})

describe('creditView', () => {
  it('crédit restant estimé (appels de l’application) et réel (coût Anthropic), jamais négatif', () => {
    expect(creditView({ creditsUsd: 20, since: '2026-11-01', spentUsd: 3.5 }, 4)).toEqual({ creditsUsd: 20, since: '2026-11-01', estimatedUsd: 16.5, realUsd: 16 })
    expect(creditView({ creditsUsd: 1, since: '2026-11-01', spentUsd: 3 }, null)).toEqual({ creditsUsd: 1, since: '2026-11-01', estimatedUsd: 0, realUsd: null })
    expect(creditView({ creditsUsd: 1, since: '2026-11-01', spentUsd: 0 }, 9)).toMatchObject({ realUsd: 0 })
  })
})

describe('formats et saisie', () => {
  it('dollars à la française', () => {
    expect(formatUsd(12.3)).toBe('12,30 $')
    expect(formatUsd(0)).toBe('0,00 $')
  })
  it('montant saisi : virgule ou point, positif, au plus 10 000', () => {
    expect(parseAmount('5,5')).toBe(5.5)
    expect(parseAmount(' 12.25 ')).toBe(12.25)
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('-3')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('20000')).toBeNull()
  })
})
