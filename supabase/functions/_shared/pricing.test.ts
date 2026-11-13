import { costUsd } from './pricing.ts'

const tokens = { model: 'claude-haiku-5-5', inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, webSearches: 0 }

describe('costUsd', () => {
  it('entrée, sortie, cache et recherches web au tarif du modèle', () => {
    expect(costUsd({ ...tokens, inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 1_000_000, cacheReadTokens: 1_000_000, webSearches: 2 })).toBeCloseTo(
      0.1 + 0.5 + 0.125 + 0.01 + 0.02,
    )
    expect(costUsd({ ...tokens, model: 'claude-sonnet-5-5', outputTokens: 1_000_000 })).toBeCloseTo(10)
    expect(costUsd({ ...tokens, model: 'claude-opus-5-5', inputTokens: 1_000_000 })).toBeCloseTo(4)
    expect(costUsd({ ...tokens, model: 'claude-fable-5-1', inputTokens: 1_000_000 })).toBeCloseTo(10)
  })

  it('identifiant daté : tarif de l’alias ; modèle inconnu : null', () => {
    expect(costUsd({ ...tokens, model: 'claude-haiku-5-5-20261001', inputTokens: 1_000_000 })).toBeCloseTo(0.1)
    expect(costUsd({ ...tokens, model: 'gpt-9' })).toBeNull()
  })
})
