// Coût réel de la clé Anthropic depuis la première recharge (rapport de coût de l'API Admin), demandé seulement à
// l'ouverture des statistiques et gardé 48 h dans `llm_cost_cache` (écrite par le serveur seulement).

import { CORS_HEADERS, json } from '../_shared/anthropic.ts'
import type { SignedInCheck } from '../_shared/auth.ts'

export const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report'
export const MAX_AGE_MS = 48 * 3600_000
const MAX_PAGES = 20
const UNAVAILABLE = 'Le coût réel est indisponible pour l’instant.'
const REFUSED = 'La clé Admin Anthropic est refusée.'

export interface Deps {
  /** Clé Admin Anthropic (sk-ant-admin…) : sans elle, le coût réel n'est pas proposé. */
  adminKey: string | undefined
  supabaseUrl: string
  serviceKey: string | undefined
  fetch: typeof fetch
  isSignedIn: SignedInCheck
  now?: () => Date
  log?: (message: string, data?: Record<string, unknown>) => void
}

interface Cache {
  since: string
  cost_usd: number
  fetched_at: string
}

interface CostReport {
  data?: { results?: { amount?: string }[] }[]
  has_more?: boolean
  next_page?: string | null
}

class ReportError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** Somme du rapport de coût depuis une date, en dollars (montants en centimes, toutes les pages). */
async function fetchCost(since: string, deps: Deps): Promise<number> {
  let cents = 0
  let page: string | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({ starting_at: `${since}T00:00:00Z`, limit: '31' })
    if (page) params.set('page', page)
    const response = await deps
      .fetch(`${COST_REPORT_URL}?${params}`, { headers: { 'x-api-key': deps.adminKey!, 'anthropic-version': '2026-10-21' } })
      .catch(() => {
        throw new ReportError(UNAVAILABLE)
      })
    if (response.status === 401 || response.status === 403) throw new ReportError(REFUSED, response.status)
    if (!response.ok) throw new ReportError(UNAVAILABLE, response.status)
    const report = (await response.json()) as CostReport
    for (const bucket of report.data ?? []) for (const result of bucket.results ?? []) cents += Number(result.amount ?? 0) || 0
    if (!report.has_more || !report.next_page) break
    page = report.next_page
  }
  return Number((cents / 100).toFixed(6))
}

export function createHandler(deps: Deps) {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? (() => {})

  async function db(path: string, init?: RequestInit): Promise<Response> {
    return deps.fetch(`${deps.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: deps.serviceKey!, authorization: `Bearer ${deps.serviceKey}`, 'content-type': 'application/json', ...init?.headers },
    })
  }

  async function read<T>(path: string): Promise<T[]> {
    const response = await db(path)
    if (!response.ok) throw new Error(`lecture ${path} : ${response.status}`)
    return (await response.json()) as T[]
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    if (!(await deps.isSignedIn(request.headers.get('authorization')))) return json({ error: 'Connexion requise.' }, 401)
    if (!deps.adminKey) return json({ available: false })

    let since: string | null
    let cache: Cache | undefined
    try {
      if (!deps.serviceKey) throw new Error('clé de service absente')
      const [first] = await read<{ added_on: string }>('llm_credits?select=added_on&order=added_on.asc&limit=1')
      since = first?.added_on ?? null
      if (!since) return json({ available: true, since: null })
      ;[cache] = await read<Cache>('llm_cost_cache?select=since,cost_usd,fetched_at')
    } catch (error) {
      log('coût réel en erreur', { error: String(error) })
      return json({ error: UNAVAILABLE }, 500)
    }

    const sameStart = cache?.since === since
    if (cache && sameStart && now().getTime() - new Date(cache.fetched_at).getTime() < MAX_AGE_MS) {
      return json({ available: true, since, costUsd: Number(cache.cost_usd), fetchedAt: cache.fetched_at })
    }

    let costUsd: number
    try {
      costUsd = await fetchCost(since, deps)
    } catch (error) {
      const status = error instanceof ReportError ? error.status : undefined
      const message = error instanceof ReportError ? error.message : UNAVAILABLE
      log('coût réel indisponible', { status, error: String(error) })
      if (cache && sameStart) return json({ available: true, since, costUsd: Number(cache.cost_usd), fetchedAt: cache.fetched_at, error: message })
      return json({ available: true, since, error: message })
    }

    const fetchedAt = now().toISOString()
    const saved = await db('llm_cost_cache', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: true, since, cost_usd: costUsd, fetched_at: fetchedAt }),
    }).catch(() => null)
    if (!saved?.ok) log('cache du coût non enregistré', { status: saved?.status })
    return json({ available: true, since, costUsd, fetchedAt })
  }
}
