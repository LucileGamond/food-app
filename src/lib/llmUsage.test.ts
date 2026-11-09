import { costEur, featureLabel, formatEur, formatTokens, periodRange, summarizeUsage, type UsageRow } from './llmUsage'

const row = (overrides: Partial<UsageRow> = {}): UsageRow => ({
  userId: 'u-lucile',
  function: 'knit-pattern',
  mode: 'ideas',
  model: 'claude-haiku-5-5',
  calls: 1,
  requests: 1,
  failures: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
  ...overrides,
})

describe('periodRange', () => {
  const now = new Date(2026, 10, 8, 15, 30)
  it('ce mois, le mois dernier, 30 jours, tout', () => {
    expect(periodRange('month', now)).toEqual({ since: new Date(2026, 10, 1), until: null })
    expect(periodRange('lastMonth', now)).toEqual({ since: new Date(2026, 9, 1), until: new Date(2026, 10, 1) })
    expect(periodRange('30d', now)).toEqual({ since: new Date(2026, 9, 9, 15, 30), until: null })
    expect(periodRange('all', now)).toEqual({ since: null, until: null })
  })
  it('le mois dernier en janvier est décembre', () => {
    expect(periodRange('lastMonth', new Date(2027, 0, 15))).toEqual({ since: new Date(2026, 11, 1), until: new Date(2027, 0, 1) })
  })
})

describe('costEur', () => {
  it('tarif du modèle : entrée, sortie, cache et recherches web, converti en euros', () => {
    // Haiku 5.5 : 0,10 $ / 0,50 $ par million ; écriture cache ×1,25, lecture ×0,1 ; recherche 10 $ les 1 000.
    const usd = 0.1 + 0.5 + 0.125 + 0.01 + 2 * 0.01
    expect(costEur(row({ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 1_000_000, cacheReadTokens: 1_000_000, webSearches: 2 }))).toBeCloseTo(usd * 0.86, 6)
  })
  it('chaque modèle a son tarif ; modèle inconnu : null', () => {
    expect(costEur(row({ model: 'claude-sonnet-5-5', outputTokens: 1_000_000 }))).toBeCloseTo(10 * 0.86)
    expect(costEur(row({ model: 'claude-opus-5-5', inputTokens: 1_000_000 }))).toBeCloseTo(4 * 0.86)
    expect(costEur(row({ model: 'claude-fable-5-1', inputTokens: 1_000_000 }))).toBeCloseTo(10 * 0.86)
    expect(costEur(row({ model: 'claude-opus-5-5-20261001', inputTokens: 1_000_000 }))).toBeCloseTo(4 * 0.86)
    expect(costEur(row({ model: 'gpt-9' }))).toBeNull()
  })
})

describe('summarizeUsage', () => {
  const PROFILES = [
    { id: 'u-lucile', display_name: 'Lucile' },
    { id: 'u-eric', display_name: 'Eric' },
  ]

  it('totaux du foyer, par personne et par fonctionnalité avec le détail par mode, du plus coûteux au moins coûteux', () => {
    const summary = summarizeUsage(
      [
        row({ mode: 'ideas', calls: 2, failures: 1, inputTokens: 1_000_000, outputTokens: 100, webSearches: 3 }),
        row({ mode: 'question', userId: 'u-eric', inputTokens: 1000, outputTokens: 10, cacheReadTokens: 500 }),
        row({ function: 'import-recipe', mode: 'url', userId: 'u-eric', inputTokens: 2_000_000 }),
        row({ function: 'tidy-shopping', mode: null, userId: null, inputTokens: 10 }),
      ],
      PROFILES,
    )
    expect(summary.total).toMatchObject({ calls: 5, failures: 1, inputTokens: 3_001_510, outputTokens: 110, webSearches: 3 })
    expect(summary.total.costEur).toBeGreaterThan(0)

    expect(summary.byPerson.map((p) => [p.name, p.calls])).toEqual([
      ['Eric', 2],
      ['Lucile', 2],
      ['Personne inconnue', 1],
    ])
    expect(summary.byFeature.map((f) => [f.label, f.calls])).toEqual([
      ['Import de recette', 1],
      ['Tricot', 3],
      ['Liste de courses', 1],
    ])
    expect(summary.byFeature[1]!.modes.map((m) => [m.label, m.calls])).toEqual([
      ['Idées de modèles', 2],
      ['Question', 1],
    ])
  })

  it('coût partiel quand un modèle n’a pas de tarif', () => {
    const summary = summarizeUsage([row({ inputTokens: 1_000_000 }), row({ model: 'inconnu', inputTokens: 5 })], [])
    expect(summary.total.costEur).toBeCloseTo(0.1 * 0.86)
    expect(summary.total.partialCost).toBe(true)
    expect(summarizeUsage([], []).total).toMatchObject({ calls: 0, costEur: 0, partialCost: false })
  })
})

describe('libellés et formats', () => {
  it('libellé lisible d’une fonction et d’un mode, ou leur nom technique', () => {
    expect(featureLabel('knit-pattern')).toBe('Tricot')
    expect(featureLabel('knit-pattern', 'pattern')).toBe('Lecture du patron')
    expect(featureLabel('import-recipe', 'photos')).toBe('Photos')
    expect(featureLabel('nouvelle-fonction')).toBe('nouvelle-fonction')
    expect(featureLabel('nouvelle-fonction', 'x')).toBe('x')
    expect(featureLabel('suggest-meals', null)).toBe('Appel')
  })

  it('tokens et euros', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_345)).toBe('12,3 k')
    expect(formatTokens(2_500_000)).toBe('2,5 M')
    expect(formatEur(0.004)).toBe('< 0,01 €')
    expect(formatEur(0)).toBe('0,00 €')
    expect(formatEur(1.234)).toBe('1,23 €')
  })
})
