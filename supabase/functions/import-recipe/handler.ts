// Logique de la fonction import-recipe, indépendante de Deno pour pouvoir être testée.
//
// POST { url: string, knownTags?: string[] }
//   → 200 { recipe, source: 'structured' | 'text', image: { data, type } | null }
// POST { url: string, mode: 'title' } → 200 { title: string | null } (titre de la page seul, sans modèle)
//   Vidéo YouTube : description de la vidéo, sinon recette écrite trouvée en ligne → source 'video', foundUrl
// POST { mode: 'text', text, url?, knownTags? } → 200 { recipe, source: 'text', image: null } (légende Instagram collée)
// POST { mode: 'photos', images: [{ data, type }], knownTags?, insist? } → 200 { recipe, source: 'photo', image: null }
//   (1 à 4 photos : pages d'un livre, scan, ou captures d'écran de la légende d'une publication)
// POST { mode: 'orient', images: [4 versions tournées de 0, 90, 180, 270°] } → 200 { rotation } (photo à l'endroit)
//   → 4xx/5xx { error: message lisible }
// La passerelle Supabase vérifie le jeton (verify_jwt), mais accepte aussi la clé publique anonyme :
// `isSignedIn` vérifie en plus qu'il s'agit d'un utilisateur connecté.

import { CORS_HEADERS, json, MISCONFIGURED } from '../_shared/anthropic.ts'
import { extractPage, MIN_TEXT_CHARS, type PageContent } from './extract.ts'
import { extractRecipe, extractRecipeFromPhotos, ImportError, type ImportedRecipe, type ModelUsage, type PhotoInput } from './model.ts'
import { detectRotation, ROTATIONS } from './orient.ts'
import { checkPublicUrl, type ResolveDns } from '../_shared/url.ts'
import { decodeHtml, download, PAGE_TIMEOUT_MS, toBase64 } from '../_shared/download.ts'
import { fetchYoutubeVideo, findWrittenRecipe, INSTAGRAM_CAPTION, isInstagram, NOT_WRITTEN, videoText, youtubeId } from './video.ts'
import { asRecord } from '../_shared/sanitize.ts'
import type { SignedInCheck } from '../_shared/auth.ts'
import type { BudgetCheck } from '../_shared/budget.ts'
import { trackUsage, type RecordUsage } from '../_shared/usage.ts'

export const MAX_PAGE_BYTES = 3_000_000
export const MAX_IMAGE_BYTES = 3_000_000
/** Import YouTube (description, recherche web, page trouvée) : borné sous la coupure des fonctions à 150 s. */
const YOUTUBE_BUDGET_MS = 130_000
/** En deçà, une étape n'a plus le temps d'aboutir. */
const MIN_STEP_MS = 15_000
const TOO_LONG = 'La lecture de cette vidéo prend trop de temps. Réessaie, ou saisis la recette à la main.'
/** Images acceptées : photo d'une page téléchargée, photos envoyées par le navigateur. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface ImportResult {
  /** La recette (la première de la page pour une photo : ce que lit une ancienne version de l'application). */
  recipe: ImportedRecipe
  /** Photo : toutes les recettes de la page, dans l'ordre. */
  recipes?: ImportedRecipe[]
  source: 'structured' | 'text' | 'photo' | 'video'
  image: { data: string; type: string } | null
  /** Vidéo : page où la recette écrite a été trouvée (la description ne la donnait pas). */
  foundUrl?: string
}

export interface Deps {
  apiKey: string | undefined
  /** Clé de l'API YouTube Data (lecture des descriptions de vidéos). */
  youtubeApiKey?: string
  model?: string
  /** fetch utilisé pour la page et l'image. */
  fetchPage: typeof fetch
  /** fetch utilisé pour l'API du modèle. */
  fetchModel: typeof fetch
  log?: (message: string, data?: Record<string, unknown>) => void
  /** Résolution DNS (Deno.resolveDns) : refuse les noms qui pointent vers une adresse privée. */
  resolveDns?: ResolveDns
  /** Vrai si l'en-tête Authorization correspond à un utilisateur connecté. */
  isSignedIn: SignedInCheck
  /** Enregistre la consommation de chaque appel (voir _shared/usage.ts). */
  recordUsage?: RecordUsage
  /** Budget IA du mois (voir _shared/budget.ts) : un message refuse l'import (402). */
  checkBudget?: BudgetCheck
}

/** Photo de la recette : facultative, une erreur ne fait jamais échouer l'import. */
async function downloadImage(url: string | null, doFetch: typeof fetch, resolve?: ResolveDns): Promise<ImportResult['image']> {
  if (!url) return null
  try {
    const image = await download(url, IMAGE_TYPES.join(','), MAX_IMAGE_BYTES, doFetch, resolve)
    const type = image.type.split(';')[0]!.trim().toLowerCase()
    if (!IMAGE_TYPES.some((t) => t === type) || image.bytes.length === 0) return null
    return { data: toBase64(image.bytes), type }
  } catch {
    return null
  }
}

type Result = ImportResult & { usage: ModelUsage | null }

const knownTagsOf = (input: Record<string, unknown>) =>
  Array.isArray(input.knownTags) ? input.knownTags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 30)) : []

const addUsage = (a: ModelUsage | null, b: ModelUsage | null): ModelUsage | null =>
  a && b ? { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens } : (a ?? b)

export async function importRecipe(body: unknown, deps: Deps): Promise<Result> {
  const input = asRecord(body)
  const check = checkPublicUrl(input.url)
  if (!check.ok) throw new ImportError(check.reason, 400)
  const knownTags = knownTagsOf(input)
  // Instagram : rien à lire, la légende doit être collée (mode « text »).
  if (isInstagram(check.url)) throw new ImportError(INSTAGRAM_CAPTION, 422)
  if (!deps.apiKey) throw new ImportError(MISCONFIGURED, 500)
  const videoId = youtubeId(check.url)
  if (videoId) return importYoutube(videoId, knownTags, deps)
  return importPage(check.url.href, knownTags, deps)
}

/** Page web téléchargée et lue : données structurées, sinon texte. */
async function readPage(url: string, deps: Deps): Promise<{ content: PageContent; url: string }> {
  const page = await download(url, 'text/html,application/xhtml+xml', MAX_PAGE_BYTES, deps.fetchPage, deps.resolveDns)
  if (!/html|xml/i.test(page.type)) throw new ImportError('Cette adresse ne mène pas à une page web.', 415)
  const content = extractPage(decodeHtml(page.bytes, page.type), page.url.href)
  if (!content.structured && content.text.length < MIN_TEXT_CHARS) {
    throw new ImportError('Impossible de lire cette page (elle est peut-être protégée). Saisis la recette à la main.', 422)
  }
  return { content, url: page.url.href }
}

/** Recette d'une page lue (appel au modèle) et sa photo. */
async function importContent({ content, url }: { content: PageContent; url: string }, knownTags: string[], deps: Deps, timeoutMs?: number): Promise<Result> {
  const [{ recipe, usage }, image] = await Promise.all([
    extractRecipe(content, url, knownTags, { apiKey: deps.apiKey!, model: deps.model, fetch: deps.fetchModel }, timeoutMs),
    downloadImage(content.imageUrl, deps.fetchPage, deps.resolveDns),
  ])
  return { recipe, source: content.structured ? 'structured' : 'text', image, usage }
}

const importPage = async (url: string, knownTags: string[], deps: Deps) => importContent(await readPage(url, deps), knownTags, deps)

/**
 * Recette d'une vidéo YouTube : d'abord la description ; si elle ne donne pas la recette (au moins 2 ingrédients),
 * recherche de la page où elle est écrite (blog du créateur…). La miniature de la vidéo sert de photo.
 */
async function importYoutube(id: string, knownTags: string[], deps: Deps): Promise<Result> {
  if (!deps.youtubeApiKey) throw new ImportError('La lecture des vidéos YouTube n’est pas configurée.', 500)
  const video = await fetchYoutubeVideo(id, deps.youtubeApiKey, deps.fetchPage)
  const options = { apiKey: deps.apiKey!, model: deps.model, fetch: deps.fetchModel }
  const thumbnail = downloadImage(video.thumbnail, deps.fetchPage, deps.resolveDns)
  const videoUrl = `https://www.youtube.com/watch?v=${id}`
  // Jusqu'à trois appels au modèle et une page : chaque étape prend ce qui reste du budget.
  const deadline = Date.now() + YOUTUBE_BUDGET_MS
  const stepTime = (max: number) => {
    const left = deadline - Date.now()
    if (left < MIN_STEP_MS) throw new ImportError(TOO_LONG, 504)
    return Math.min(max, left)
  }

  let usage: ModelUsage | null = null
  try {
    const content = { structured: null, text: videoText(video), title: video.title, imageUrl: video.thumbnail }
    const described = await extractRecipe(content, videoUrl, knownTags, options, stepTime(45_000))
    usage = described.usage
    if (described.recipe.ingredients.length >= 2) return { recipe: described.recipe, source: 'video', image: await thumbnail, usage }
  } catch (error) {
    // Pas de recette dans la description : on la cherche en ligne.
    if (!(error instanceof ImportError && error.status === 422)) throw error
  }

  const found = await findWrittenRecipe(video, options, stepTime(50_000))
  usage = addUsage(usage, found.usage)
  if (!found.url) throw new ImportError(NOT_WRITTEN, 422)
  // Page trouvée mais injoignable ou illisible : la recette n'est pas récupérable. Les erreurs du modèle, elles, remontent.
  let read: Awaited<ReturnType<typeof readPage>>
  stepTime(PAGE_TIMEOUT_MS)
  try {
    read = await readPage(found.url, deps)
  } catch (error) {
    if (error instanceof ImportError) throw new ImportError(NOT_WRITTEN, 422)
    throw error
  }
  const page = await importContent(read, knownTags, deps, stepTime(60_000))
  const site = new URL(found.url).hostname.replace(/^www\./, '')
  return {
    recipe: { ...page.recipe, source: page.recipe.source ?? site },
    source: 'video',
    image: (await thumbnail) ?? page.image,
    foundUrl: found.url,
    usage: addUsage(usage, page.usage),
  }
}

export const MIN_PASTED_CHARS = 20
export const MAX_PASTED_CHARS = 20_000

/** Recette d'un texte collé (légende Instagram…), avec l'adresse de la publication si elle est connue. */
export async function importText(body: unknown, deps: Deps): Promise<Result> {
  const input = asRecord(body)
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < MIN_PASTED_CHARS) throw new ImportError('Colle le texte de la recette (la légende complète).', 400)
  if (text.length > MAX_PASTED_CHARS) throw new ImportError('Texte trop long.', 413)
  const check = input.url ? checkPublicUrl(input.url) : null
  if (check && !check.ok) throw new ImportError(check.reason, 400)
  if (!deps.apiKey) throw new ImportError(MISCONFIGURED, 500)
  const content = { structured: null, text, title: null, imageUrl: null }
  try {
    const options = { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel }
    const { recipe, usage } = await extractRecipe(content, check?.url.href ?? 'texte collé', knownTagsOf(input), options)
    return { recipe, source: 'text', image: null, usage }
  } catch (error) {
    if (error instanceof ImportError && error.status === 422) throw new ImportError('Aucune recette trouvée dans ce texte.', 422)
    throw error
  }
}

/** Titre d'une page (liste « À planifier ») : téléchargement et lecture des métadonnées, sans appel au modèle. */
export async function fetchTitle(body: unknown, deps: Pick<Deps, 'fetchPage' | 'resolveDns'>): Promise<{ title: string | null }> {
  const input = asRecord(body)
  const check = checkPublicUrl(input.url)
  if (!check.ok) throw new ImportError(check.reason, 400)
  const page = await download(check.url.href, 'text/html,application/xhtml+xml', MAX_PAGE_BYTES, deps.fetchPage, deps.resolveDns)
  if (!/html|xml/i.test(page.type)) return { title: null }
  const title = extractPage(decodeHtml(page.bytes, page.type), page.url.href).title
  return { title: title ? title.replace(/\s+/g, ' ').trim().slice(0, 200) : null }
}

export const MAX_PHOTOS = 4
/** Taille maximale d'une photo en base64 (≈ 3 Mo d'image ; le navigateur les réduit à quelques centaines de Ko). */
export const MAX_PHOTO_BASE64 = 4_000_000

/** Photos reçues du navigateur : 1 à `max` images de type connu, de taille bornée. */
export function parsePhotos(body: unknown, max = MAX_PHOTOS): PhotoInput[] {
  const raw = (typeof body === 'object' && body !== null ? (body as Record<string, unknown>).images : null) as unknown
  if (!Array.isArray(raw) || raw.length === 0) throw new ImportError('Aucune photo reçue.', 400)
  if (raw.length > max) throw new ImportError(`${max} photos au plus.`, 400)
  return raw.map((value) => {
    const image = asRecord(value)
    const type = IMAGE_TYPES.find((t) => t === image.type)
    if (!type || typeof image.data !== 'string') throw new ImportError('Photo illisible (JPEG, PNG ou WebP).', 400)
    if (image.data.length > MAX_PHOTO_BASE64) throw new ImportError('Photo trop lourde.', 413)
    if (!/^[A-Za-z0-9+/]+=*$/.test(image.data)) throw new ImportError('Photo illisible (JPEG, PNG ou WebP).', 400)
    return { type, data: image.data }
  })
}

export async function importPhotos(body: unknown, deps: Deps): Promise<ImportResult & { usage: ModelUsage | null }> {
  const photos = parsePhotos(body)
  const input = body as Record<string, unknown>
  const knownTags = knownTagsOf(input)
  if (!deps.apiKey) throw new ImportError(MISCONFIGURED, 500)
  // « C'est une recette » : relecture demandée après une page jugée sans recette.
  const insist = input.insist === true
  const { recipes, usage } = await extractRecipeFromPhotos(photos, knownTags, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel }, insist)
  return { recipe: recipes[0]!, recipes, source: 'photo', image: null, usage }
}

/** Sens d'une photo de plat : 4 versions tournées (0°, 90°, 180°, 270°) → rotation qui la remet à l'endroit. */
export async function orientPhoto(body: unknown, deps: Deps): Promise<{ rotation: number; usage: ModelUsage | null }> {
  const candidates = parsePhotos(body, ROTATIONS.length)
  if (candidates.length !== ROTATIONS.length) throw new ImportError(`${ROTATIONS.length} versions de la photo attendues.`, 400)
  if (!deps.apiKey) throw new ImportError(MISCONFIGURED, 500)
  return detectRotation(candidates, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel })
}

export function createHandler(baseDeps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    const signedIn = await baseDeps.isSignedIn(request.headers.get('authorization'))
    if (!signedIn) return json({ error: 'Connexion requise.' }, 401)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Requête invalide.' }, 400)
    }
    const started = Date.now()
    const tracked = trackUsage(baseDeps.fetchModel, baseDeps.model)
    const deps: Deps = { ...baseDeps, fetchModel: tracked.fetch }
    const mode = (body as { mode?: unknown } | null)?.mode
    let ok = false
    try {
      if (mode === 'title') return json(await fetchTitle(body, deps))
      const overBudget = await deps.checkBudget?.()
      if (overBudget) return json({ error: overBudget }, 402)
      if (mode === 'orient') {
        const { usage, rotation } = await orientPhoto(body, deps)
        ok = true
        deps.log?.('sens détecté', { rotation, ms: Date.now() - started, ...usage })
        return json({ rotation })
      }
      const { usage, ...result } =
        mode === 'photos' ? await importPhotos(body, deps) : mode === 'text' ? await importText(body, deps) : await importRecipe(body, deps)
      ok = true
      deps.log?.('import réussi', { source: result.source, ms: Date.now() - started, ...usage })
      return json(result)
    } catch (error) {
      if (error instanceof ImportError) {
        deps.log?.('import refusé', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('import en erreur', { error: String(error) })
      return json({ error: 'L’import a échoué.' }, 500)
    } finally {
      const total = tracked.total()
      if (total) {
        const user_id = typeof signedIn === 'string' ? signedIn : null
        await deps.recordUsage?.({ user_id, mode: typeof mode === 'string' ? mode : 'url', ok, ...total })
      }
    }
  }
}
