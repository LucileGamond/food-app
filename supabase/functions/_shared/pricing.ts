// Tarifs Anthropic (dollars par million de tokens, novembre 2026), partagés par les Edge Functions (coût de chaque
// appel, budget) et l'application (statistiques). Écriture du cache : 1,25 × l'entrée (5 min) ; lecture : tarif propre.
// Haiku 5.5 : tarif des requêtes de moins de 100 000 tokens.

const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
}
/** Recherche web : 10 $ les 1 000. */
const WEB_SEARCH_USD = 0.01
/** Taux de conversion fixe, pour une estimation. */
export const USD_TO_EUR = 0.86

export interface PricedTokens {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  webSearches: number
}

/** Coût en dollars, ou null si le modèle n'a pas de tarif connu. */
export function costUsd(tokens: PricedTokens): number | null {
  // L'API peut renvoyer l'identifiant daté (claude-haiku-5-5-20261001) : même tarif que l'alias.
  const price = PRICES[tokens.model] ?? PRICES[tokens.model.replace(/-\d{8}$/, '')]
  if (!price) return null
  return (
    (tokens.inputTokens * price.input + tokens.outputTokens * price.output + tokens.cacheCreationTokens * price.cacheWrite + tokens.cacheReadTokens * price.cacheRead) /
      1_000_000 +
    tokens.webSearches * WEB_SEARCH_USD
  )
}
