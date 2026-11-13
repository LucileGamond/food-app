// Budget IA mensuel du foyer et crédit restant sur la clé Anthropic (Réglages → Consommation IA).

import { USD_TO_EUR } from '../../supabase/functions/_shared/pricing.ts'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface BudgetStatus {
  monthlyEur: number | null
  spentUsd: number
}

export function budgetView({ monthlyEur, spentUsd }: BudgetStatus) {
  const spentEur = round2(spentUsd * USD_TO_EUR)
  if (monthlyEur === null) return { monthlyEur, spentEur, remainingEur: null, ratio: null, reached: false }
  return {
    monthlyEur,
    spentEur,
    remainingEur: round2(Math.max(0, monthlyEur - spentEur)),
    ratio: round2(Math.min(1, spentEur / monthlyEur)),
    // Même règle que le serveur (_shared/budget.ts), sur le montant exact.
    reached: spentUsd * USD_TO_EUR >= monthlyEur,
  }
}

export interface CreditStatus {
  creditsUsd: number
  /** Date de la première recharge (null : aucune). */
  since: string | null
  /** Dépense mesurée par l'application depuis cette date. */
  spentUsd: number
}

/** Crédit restant estimé (appels de l'application) et réel (coût Anthropic depuis la première recharge, si connu). */
export function creditView(status: CreditStatus, realCostUsd: number | null) {
  return {
    creditsUsd: status.creditsUsd,
    since: status.since,
    estimatedUsd: round2(Math.max(0, status.creditsUsd - status.spentUsd)),
    realUsd: realCostUsd === null ? null : round2(Math.max(0, status.creditsUsd - realCostUsd)),
  }
}

export function formatUsd(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

/** Montant saisi (« 5,5 » ou « 5.50 »), entre 0 exclu et 10 000 ; null sinon. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value > 0 && value <= 10_000 ? value : null
}
