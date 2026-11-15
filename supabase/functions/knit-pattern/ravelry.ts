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

/** Accès refusé par Ravelry (jeton expiré, ou permission non accordée à l'application). */
export class RavelryForbidden extends RavelryError {}

async function get(path: string, params: URLSearchParams, deps: RavelryDeps, method: 'GET' | 'POST' = 'GET'): Promise<Record<string, unknown>> {
  // Les identifiants multiples s'écrivent « 1+2+3 » (le « + » ne doit pas être encodé).
  const url = `${RAVELRY_API}/${path}?${params.toString().replace(/%2B/g, '+')}`
  let response: Response
  try {
    response = await deps.fetchRavelry(url, {
      method,
      headers: { authorization: `Bearer ${deps.accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new RavelryError('Ravelry ne répond pas.')
  }
  if (response.status === 401 || response.status === 403) throw new RavelryForbidden('Accès à Ravelry refusé.')
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

// ---------------------------------------------------------------------------
// Patron gardé depuis un lien Ravelry : ses infos (tailles, métrage, aiguilles, laine), comme « Remplir avec l'IA »
// ---------------------------------------------------------------------------

/** « https://www.ravelry.com/patterns/library/ladder-rib-beanie » → « ladder-rib-beanie » ; null pour un autre lien. */
export function ravelryPermalink(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)ravelry\.com$/i.test(parsed.hostname)) return null
    const match = parsed.pathname.match(/^\/patterns\/library\/([\w-]+)\/?$/)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

/** Infos d'un patron (même forme que la lecture du PDF par le modèle). */
export interface RavelryPatternInfo {
  title: string | null
  sizes: string[]
  meters: (number | null)[]
  needleMm: number | null
  yarn: string | null
  kind: null
}

/**
 * « 2 sizes: Adult (S-M), Adult (M-L) » → ['Adult (S-M)', 'Adult (M-L)'] : virgules hors parenthèses ; une seule
 * taille (ou texte libre sans liste) → [].
 */
export function parseRavelrySizes(value: unknown): string[] {
  if (typeof value !== 'string') return []
  const text = value.replace(/^\s*\d+\s+sizes?\s*:\s*/i, '').trim()
  const sizes: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      sizes.push(current)
      current = ''
    } else current += char
  }
  sizes.push(current)
  const clean = sizes.map((s) => s.trim().slice(0, 40)).filter(Boolean)
  return clean.length > 1 ? clean.slice(0, 12) : []
}

/**
 * Patron de Ravelry → infos : métrage de la plus petite et de la plus grande taille (Ravelry ne donne pas les autres),
 * aiguilles du corps (la plus grosse), laines conseillées ou grosseur.
 */
export function toPatternInfo(raw: unknown): RavelryPatternInfo {
  const p = record(raw)
  const sizes = parseRavelrySizes(p.sizes_available)
  const min = yardsToMeters(p.yardage)
  const max = yardsToMeters(p.yardage_max)
  const meters = sizes.length === 0 ? [max ?? min] : sizes.map((_, i) => (i === 0 ? min : i === sizes.length - 1 ? (max ?? min) : null))
  const needles = (Array.isArray(p.pattern_needle_sizes) ? p.pattern_needle_sizes : []).map((n) => positive(record(n).metric)).filter((n): n is number => n !== null && n <= 30)
  const yarns = (Array.isArray(p.packs) ? p.packs : [])
    .map((k) => record(k).yarn_name)
    .filter((n): n is string => typeof n === 'string' && !!n.trim())
    .map((n) => n.trim())
  const weight = record(p.yarn_weight).name
  const yarn = [...new Set(yarns)].join(', ') || (typeof weight === 'string' && weight.trim() ? weight.trim() : '')
  return {
    title: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 200) : null,
    sizes,
    meters,
    needleMm: needles.length ? Math.max(...needles) : null,
    yarn: yarn ? yarn.slice(0, 200) : null,
    kind: null,
  }
}

/** Infos d'un patron de Ravelry par son adresse (permalink). */
export async function getRavelryPattern(permalink: string, deps: RavelryDeps): Promise<RavelryPatternInfo> {
  const body = await get(`patterns/${permalink}.json`, new URLSearchParams(), deps)
  if (typeof body.pattern !== 'object' || body.pattern === null) throw new RavelryError('Patron introuvable sur Ravelry.')
  return toPatternInfo(body.pattern)
}

// ---------------------------------------------------------------------------
// Laine trouvée sur Ravelry (ajout au stock) : marque, nom, métrage, poids, composition, aiguilles
// ---------------------------------------------------------------------------

/** Laine trouvée par la recherche (aperçu dans la liste). */
export interface RavelryYarnHit {
  id: number
  brand: string | null
  name: string
  weightG: number | null
  lengthM: number | null
  /** Grosseur selon Ravelry (« DK »). */
  category: string | null
}

/** Laine de Ravelry, dans les champs d'une laine de l'application. */
export interface RavelryYarn {
  brand: string | null
  name: string | null
  composition: string | null
  weight_g: number | null
  length_m: number | null
  needle_mm: number | null
}

const MAX_YARN_HITS = 6

/** Fibres de Ravelry en français (les autres restent telles quelles, en minuscules). */
const FIBERS: Record<string, string> = {
  merino: 'mérinos',
  wool: 'laine',
  alpaca: 'alpaga',
  acrylic: 'acrylique',
  cotton: 'coton',
  silk: 'soie',
  cashmere: 'cachemire',
  linen: 'lin',
  bamboo: 'bambou',
  nylon: 'polyamide',
  polyamide: 'polyamide',
  polyester: 'polyester',
  viscose: 'viscose',
  mohair: 'mohair',
  angora: 'angora',
  yak: 'yack',
  camel: 'chameau',
  hemp: 'chanvre',
}

function cleanText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, max) : null
}

/** « 70 % mérinos, 30 % soie » ; null sans fibres. */
export function compositionOf(fibers: unknown): string | null {
  const parts = (Array.isArray(fibers) ? fibers : []).flatMap((f) => {
    const fiber = record(f)
    const name = cleanText(record(fiber.fiber_type).name, 40)
    if (!name) return []
    const french = FIBERS[name.toLowerCase()] ?? name.toLowerCase()
    const percent = positive(fiber.percentage)
    return [percent !== null ? `${Math.round(percent)} % ${french}` : french]
  })
  return parts.length ? parts.join(', ').slice(0, 80) : null
}

export function toYarnHit(raw: unknown): RavelryYarnHit | null {
  const y = record(raw)
  const name = cleanText(y.name, 80)
  if (typeof y.id !== 'number' || !name) return null
  return {
    id: y.id,
    brand: cleanText(y.yarn_company_name, 80),
    name,
    weightG: positive(y.grams),
    lengthM: yardsToMeters(y.yardage),
    category: cleanText(record(y.yarn_weight).name, 30),
  }
}

/** Détails d'une laine → champs de l'application ; aiguilles : la plus grosse conseillée. */
export function toRavelryYarn(raw: unknown): RavelryYarn {
  const y = record(raw)
  const needles = [record(y.min_needle_size).metric, record(y.max_needle_size).metric].map(positive).filter((n): n is number => n !== null && n <= 30)
  return {
    brand: cleanText(record(y.yarn_company).name, 80) ?? cleanText(y.yarn_company_name, 80),
    name: cleanText(y.name, 80),
    composition: compositionOf(y.yarn_fibers),
    weight_g: positive(y.grams),
    length_m: yardsToMeters(y.yardage),
    needle_mm: needles.length ? Math.max(...needles) : null,
  }
}

/** Laines de Ravelry pour une recherche (« drops merino extra fine »), les plus pertinentes d'abord. */
export async function searchRavelryYarns(query: string, deps: RavelryDeps): Promise<RavelryYarnHit[]> {
  const q = query.trim()
  if (!q) return []
  const body = await get('yarns/search.json', new URLSearchParams({ query: q, page_size: String(MAX_YARN_HITS), sort: 'best' }), deps)
  return (Array.isArray(body.yarns) ? body.yarns : []).map(toYarnHit).filter((y): y is RavelryYarnHit => y !== null)
}

export async function getRavelryYarn(id: number, deps: RavelryDeps): Promise<RavelryYarn> {
  const body = await get(`yarns/${id}.json`, new URLSearchParams(), deps)
  if (typeof body.yarn !== 'object' || body.yarn === null) throw new RavelryError('Laine introuvable sur Ravelry.')
  return toRavelryYarn(body.yarn)
}

// ---------------------------------------------------------------------------
// Import depuis Ravelry : patrons en favoris et patrons achetés (bibliothèque Ravelry)
// ---------------------------------------------------------------------------

/** Patron de Ravelry proposé à l'import. */
export interface RavelryImportItem {
  patternId: number
  title: string
  author: string | null
  /** Petite photo (aperçu dans la liste). */
  photoUrl: string | null
  /** D'où il vient : favori, bibliothèque (acheté ou gratuit téléchargé), ou les deux. */
  sources: ('favori' | 'bibliothèque')[]
  /** Volume de la bibliothèque (PDF), s'il y en a un. */
  volumeId: number | null
  hasPdf: boolean
}

/** Liste lue d'un coup : au-delà, les plus récents seulement. */
const MAX_LIST = 100

function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//.test(value) ? value.replace(/^http:/, 'https:') : null
}

/** Nom du compte Ravelry relié (pour lire ses listes). */
export async function ravelryUsername(deps: RavelryDeps): Promise<string> {
  const body = await get('current_user.json', new URLSearchParams(), deps)
  const username = record(body.user).username
  if (typeof username !== 'string' || !/^[\w-]+$/.test(username)) throw new RavelryError('Compte Ravelry illisible.')
  return username
}

/** Favoris (patrons) et bibliothèque, réunis par patron ; favoris d'abord, puis bibliothèque. */
export function mergeImportItems(favorites: unknown, volumes: unknown): RavelryImportItem[] {
  const items = new Map<number, RavelryImportItem>()
  for (const raw of Array.isArray(favorites) ? favorites : []) {
    const favorite = record(raw)
    if (favorite.type !== 'pattern') continue
    const p = record(favorite.favorited)
    const title = cleanText(p.name, 150)
    if (typeof p.id !== 'number' || !title || items.has(p.id)) continue
    const photo = record(p.first_photo)
    items.set(p.id, {
      patternId: p.id,
      title,
      author: cleanText(record(p.pattern_author).name, 80) ?? cleanText(record(p.designer).name, 80),
      photoUrl: httpsUrl(photo.square_url ?? photo.small_url),
      sources: ['favori'],
      volumeId: null,
      hasPdf: false,
    })
  }
  for (const raw of Array.isArray(volumes) ? volumes : []) {
    const v = record(raw)
    const title = cleanText(v.title, 150)
    if (typeof v.pattern_id !== 'number' || typeof v.id !== 'number' || !title) continue
    const volume = { volumeId: v.id, hasPdf: v.has_downloads === true }
    const known = items.get(v.pattern_id)
    if (known) {
      items.set(v.pattern_id, { ...known, ...volume, sources: [...known.sources, 'bibliothèque'] })
      continue
    }
    items.set(v.pattern_id, {
      patternId: v.pattern_id,
      title,
      author: cleanText(v.author_name, 80),
      photoUrl: httpsUrl(v.square_image_url ?? v.small_image_url),
      sources: ['bibliothèque'],
      ...volume,
    })
  }
  return [...items.values()]
}

/** Patrons à importer : favoris et bibliothèque de la personne. */
export async function listRavelryImports(deps: RavelryDeps): Promise<RavelryImportItem[]> {
  const username = await ravelryUsername(deps)
  const [favorites, library] = await Promise.all([
    get(`people/${username}/favorites/list.json`, new URLSearchParams({ types: 'pattern', page_size: String(MAX_LIST) }), deps),
    get(`people/${username}/library/search.json`, new URLSearchParams({ page_size: String(MAX_LIST) }), deps),
  ])
  return mergeImportItems(favorites.favorites, library.volumes)
}

/** Patron importé : sa page, son nom (et sa créatrice), ses infos, sa photo, et le PDF de la bibliothèque si possible. */
export interface RavelryImport {
  url: string
  title: string
  author: string | null
  info: RavelryPatternInfo
  photoUrl: string | null
  /** PDF à télécharger (lien temporaire de Ravelry) ; null sans PDF ou sans permission. */
  pdf: { url: string; name: string } | null
  /** Pourquoi il n'y a pas de PDF : aucun dans la bibliothèque, ou permission Ravelry manquante. */
  pdfMissing: 'aucun' | 'permission' | null
}

/** Fichier du volume : le français s'il existe, sinon l'anglais, sinon le premier PDF. */
export function pickAttachment(attachments: unknown): { id: number; name: string } | null {
  const pdfs = (Array.isArray(attachments) ? attachments : [])
    .map(record)
    .filter((a) => typeof a.product_attachment_id === 'number' && (a.content_type === 'application/pdf' || /\.pdf$/i.test(String(a.filename ?? ''))))
  const pick = pdfs.find((a) => a.language_code === 'fr') ?? pdfs.find((a) => a.language_code === 'en') ?? pdfs[0]
  if (!pick) return null
  return { id: pick.product_attachment_id as number, name: cleanText(pick.filename, 150) ?? 'patron.pdf' }
}

async function libraryPdf(volumeId: number, deps: RavelryDeps): Promise<Pick<RavelryImport, 'pdf' | 'pdfMissing'>> {
  const volume = record((await get(`volumes/${volumeId}.json`, new URLSearchParams(), deps)).volume)
  const attachment = pickAttachment(volume.volume_attachments)
  if (!attachment) return { pdf: null, pdfMissing: 'aucun' }
  try {
    const link = await get(`product_attachments/${attachment.id}/generate_download_link.json`, new URLSearchParams(), deps, 'POST')
    const url = httpsUrl(link.url ?? link.download_url)
    return url ? { pdf: { url, name: attachment.name }, pdfMissing: null } : { pdf: null, pdfMissing: 'aucun' }
  } catch (e) {
    if (e instanceof RavelryForbidden) return { pdf: null, pdfMissing: 'permission' }
    throw e
  }
}

export async function importRavelryPattern(patternId: number, volumeId: number | null, deps: RavelryDeps): Promise<RavelryImport> {
  const body = await get(`patterns/${patternId}.json`, new URLSearchParams(), deps)
  const p = record(body.pattern)
  const permalink = typeof p.permalink === 'string' && /^[\w-]+$/.test(p.permalink) ? p.permalink : null
  const title = cleanText(p.name, 150)
  if (!permalink || !title) throw new RavelryError('Patron introuvable sur Ravelry.')
  const photos = Array.isArray(p.photos) ? p.photos.map(record) : []
  const pdf = volumeId === null ? { pdf: null, pdfMissing: 'aucun' as const } : await libraryPdf(volumeId, deps)
  return {
    url: `https://www.ravelry.com/patterns/library/${permalink}`,
    title,
    author: cleanText(record(p.pattern_author).name, 80),
    info: toPatternInfo(p),
    photoUrl: httpsUrl(photos[0]?.medium_url ?? photos[0]?.small_url),
    ...pdf,
  }
}
