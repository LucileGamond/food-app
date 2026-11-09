// Consommation du modèle (Claude) : périodes, coût estimé et regroupements affichés dans Réglages.

/** Totaux d'un groupe (personne, fonction, mode, modèle), tels que renvoyés par llm_usage_summary. */
export interface UsageRow {
  userId: string | null
  function: string
  mode: string | null
  model: string
  calls: number
  requests: number
  failures: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  webSearches: number
}

export type UsagePeriod = 'month' | 'lastMonth' | '30d' | 'all'

export const USAGE_PERIODS: { key: UsagePeriod; label: string }[] = [
  { key: 'month', label: 'Ce mois-ci' },
  { key: 'lastMonth', label: 'Le mois dernier' },
  { key: '30d', label: '30 derniers jours' },
  { key: 'all', label: 'Tout (12 mois max.)' },
]

/** Bornes [since, until[ d'une période, en heure locale. */
export function periodRange(period: UsagePeriod, now: Date = new Date()): { since: Date | null; until: Date | null } {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'month') return { since: monthStart, until: null }
  if (period === 'lastMonth') return { since: new Date(now.getFullYear(), now.getMonth() - 1, 1), until: monthStart }
  if (period === '30d') {
    const since = new Date(now)
    since.setDate(since.getDate() - 30)
    return { since, until: null }
  }
  return { since: null, until: null }
}

/**
 * Tarifs Anthropic en dollars par million de tokens (novembre 2026). Écriture du cache : 1,25 × l'entrée (5 min) ;
 * lecture : tarif propre. Haiku 5.5 : tarif des requêtes de moins de 100 000 tokens.
 */
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

type Tokens = Pick<UsageRow, 'model' | 'inputTokens' | 'outputTokens' | 'cacheCreationTokens' | 'cacheReadTokens' | 'webSearches'>

/** Coût estimé en euros, ou null si le modèle n'a pas de tarif connu. */
export function costEur(row: Tokens): number | null {
  // L'API peut renvoyer l'identifiant daté (claude-haiku-5-5-20261001) : même tarif que l'alias.
  const price = PRICES[row.model] ?? PRICES[row.model.replace(/-\d{8}$/, '')]
  if (!price) return null
  const usd =
    (row.inputTokens * price.input + row.outputTokens * price.output + row.cacheCreationTokens * price.cacheWrite + row.cacheReadTokens * price.cacheRead) / 1_000_000 +
    row.webSearches * WEB_SEARCH_USD
  return usd * USD_TO_EUR
}

const FEATURES: Record<string, { label: string; modes?: Record<string, string> }> = {
  'import-recipe': { label: 'Import de recette', modes: { url: 'Lien ou vidéo', text: 'Texte collé', photos: 'Photos', orient: 'Sens de la photo' } },
  'knit-pattern': {
    label: 'Tricot',
    modes: { pattern: 'Lecture du patron', label: 'Étiquette de laine', ideas: 'Idées de modèles', question: 'Question', translate: 'Traduction', adapt: 'Adaptation' },
  },
  'estimate-nutrition': { label: 'Calories' },
  'suggest-meals': { label: 'Idées de repas' },
  'plan-week': { label: 'Planifier la semaine' },
  'tidy-shopping': { label: 'Liste de courses' },
}

/** Libellé d'une fonction, ou de l'un de ses modes (« Appel » quand elle n'en a pas). */
export function featureLabel(fn: string, mode?: string | null): string {
  const feature = FEATURES[fn]
  if (mode === undefined) return feature?.label ?? fn
  if (mode === null) return 'Appel'
  return feature?.modes?.[mode] ?? mode
}

export interface UsageTotals {
  calls: number
  failures: number
  /** Tokens d'entrée, cache compris. */
  inputTokens: number
  outputTokens: number
  webSearches: number
  costEur: number
  /** Une partie de la consommation vient d'un modèle sans tarif connu. */
  partialCost: boolean
}

const emptyTotals = (): UsageTotals => ({ calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, costEur: 0, partialCost: false })

function add(totals: UsageTotals, row: UsageRow) {
  totals.calls += row.calls
  totals.failures += row.failures
  totals.inputTokens += row.inputTokens + row.cacheCreationTokens + row.cacheReadTokens
  totals.outputTokens += row.outputTokens
  totals.webSearches += row.webSearches
  const cost = costEur(row)
  if (cost === null) totals.partialCost = true
  else totals.costEur += cost
}

const byCost = (a: UsageTotals, b: UsageTotals) => b.costEur - a.costEur || b.calls - a.calls

function group<T extends UsageTotals>(rows: UsageRow[], key: (row: UsageRow) => string, make: (row: UsageRow) => T): T[] {
  const groups = new Map<string, T>()
  for (const row of rows) {
    const k = key(row)
    let entry = groups.get(k)
    if (!entry) groups.set(k, (entry = make(row)))
    add(entry, row)
  }
  return [...groups.values()].sort(byCost)
}

export interface UsageSummary {
  total: UsageTotals
  byPerson: (UsageTotals & { userId: string | null; name: string })[]
  byFeature: (UsageTotals & { function: string; label: string; modes: (UsageTotals & { mode: string | null; label: string })[] })[]
}

export function summarizeUsage(rows: UsageRow[], profiles: { id: string; display_name: string }[]): UsageSummary {
  const total = emptyTotals()
  for (const row of rows) add(total, row)
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? 'Personne inconnue'
  const byPerson = group(rows, (r) => r.userId ?? '', (r) => ({ ...emptyTotals(), userId: r.userId, name: nameOf(r.userId) }))
  const byFeature = group(rows, (r) => r.function, (r) => ({ ...emptyTotals(), function: r.function, label: featureLabel(r.function), modes: [] as (UsageTotals & { mode: string | null; label: string })[] }))
  for (const feature of byFeature) {
    const own = rows.filter((r) => r.function === feature.function)
    feature.modes = group(own, (r) => r.mode ?? '', (r) => ({ ...emptyTotals(), mode: r.mode, label: featureLabel(r.function, r.mode) }))
  }
  return { total, byPerson, byFeature }
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  if (n >= 1000) return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`
  return String(n)
}

export function formatEur(n: number): string {
  if (n > 0 && n < 0.01) return '< 0,01 €'
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}
