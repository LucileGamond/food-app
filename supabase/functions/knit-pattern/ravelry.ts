// Patrons de Ravelry (API officielle, gratuite) pour une idée de modèle : recherche avec les filtres du site (tricot,
// grosseur, métrage disponible), puis détails (métrage, aiguilles, langues, gratuit). Les patrons gratuits, puis en
// français, passent en premier.
// Avec le jeton du compte Ravelry de la personne (voir ravelryAuth.ts) ; sans compte relié, pas de patrons Ravelry (la
// recherche web du modèle reste possible).

import type { FoundPattern } from './ideas.ts'

export const RAVELRY_API = 'https://api.ravelry.com'
const METERS_PER_YARD = 0.9144
/** Patrons demandés à la recherche, avant le tri (gratuits, français). */
const SEARCH_SIZE = 8
const TIMEOUT_MS = 10_000

export interface RavelryDeps {
  fetchRavelry: typeof fetch
  /** Jeton d'accès OAuth du compte Ravelry relié. */
  accessToken: string
}

export interface RavelryQuery {
  /** Mots-clés en anglais (« ribbed beanie »). */
  search: string
  /** Grosseur selon Ravelry (« worsted »). */
  weight: string | null
  /** Métrage disponible : patrons qui en demandent au plus autant. */
  meters: number | null
}

export class RavelryError extends Error {}

async function get(path: string, params: URLSearchParams, deps: RavelryDeps): Promise<Record<string, unknown>> {
  // Les identifiants multiples s'écrivent « 1+2+3 » (le « + » ne doit pas être encodé).
  const url = `${RAVELRY_API}/${path}?${params.toString().replace(/%2B/g, '+')}`
  let response: Response
  try {
    response = await deps.fetchRavelry(url, {
      headers: { authorization: `Bearer ${deps.accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new RavelryError('Ravelry ne répond pas.')
  }
  if (response.status === 401 || response.status === 403) throw new RavelryError('Accès à Ravelry refusé.')
  if (!response.ok) throw new RavelryError(`Ravelry a répondu par une erreur (${response.status}).`)
  const body = (await response.json().catch(() => null)) as unknown
  if (typeof body !== 'object' || body === null) throw new RavelryError('Réponse de Ravelry illisible.')
  return body as Record<string, unknown>
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function positive(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function yardsToMeters(value: unknown): number | null {
  const yards = positive(value)
  return yards === null ? null : Math.round(yards * METERS_PER_YARD)
}

/** Langue du patron : le français s'il y est, sinon la première. */
function language(value: unknown): string | null {
  const codes = (Array.isArray(value) ? value : [])
    .map((l) => record(l).code)
    .filter((c): c is string => typeof c === 'string' && /^[a-z]{2}/i.test(c))
    .map((c) => c.slice(0, 2).toLowerCase())
  return codes.includes('fr') ? 'fr' : (codes[0] ?? null)
}

/** Patron de Ravelry (détails) → patron trouvé ; null s'il n'a pas de page. */
export function toFoundPattern(raw: unknown): FoundPattern | null {
  const p = record(raw)
  const permalink = typeof p.permalink === 'string' && /^[\w-]+$/.test(p.permalink) ? p.permalink : null
  const title = typeof p.name === 'string' ? p.name.trim().slice(0, 150) : ''
  if (!permalink || !title) return null
  const designer = record(p.pattern_author ?? p.designer).name
  const meters = yardsToMeters(p.yardage)
  const metersMax = yardsToMeters(p.yardage_max)
  return {
    title: typeof designer === 'string' && designer.trim() ? `${title} par ${designer.trim().slice(0, 60)}` : title,
    url: `https://www.ravelry.com/patterns/library/${permalink}`,
    free: typeof p.free === 'boolean' ? p.free : null,
    language: language(p.languages),
    meters,
    metersMax: metersMax !== null && meters !== null && metersMax > meters ? metersMax : null,
  }
}

/** Gratuits d'abord, puis en français ; ordre de Ravelry sinon. */
function rank(p: FoundPattern): number {
  return (p.free === true ? 0 : 2) + (p.language === 'fr' ? 0 : 1)
}

/** Jusqu'à `limit` patrons de Ravelry pour une idée ; liste vide si rien ne correspond. */
export async function searchRavelry(query: RavelryQuery, deps: RavelryDeps, limit = 3): Promise<FoundPattern[]> {
  const search = query.search.trim()
  if (!search) return []
  const params = new URLSearchParams({ query: search, craft: 'knitting', page_size: String(SEARCH_SIZE), sort: 'best' })
  if (query.weight) params.set('weight', query.weight)
  if (query.meters !== null && query.meters > 0) params.set('yardage', `0|${Math.floor(query.meters / METERS_PER_YARD)}`)
  const found = await get('patterns/search.json', params, deps)
  const ids = (Array.isArray(found.patterns) ? found.patterns : []).map((p) => record(p).id).filter((id): id is number => typeof id === 'number')
  if (ids.length === 0) return []
  const details = await get('patterns.json', new URLSearchParams({ ids: ids.join('+') }), deps)
  // { patterns: { "123": {…} } } ; ordre de la recherche conservé.
  const byId = record(details.patterns)
  return ids
    .map((id) => toFoundPattern(byId[String(id)]))
    .filter((p): p is FoundPattern => p !== null)
    .map((p, index) => ({ p, index }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.index - b.index)
    .slice(0, limit)
    .map(({ p }) => p)
}
