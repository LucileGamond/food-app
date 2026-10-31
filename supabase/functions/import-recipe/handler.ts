// Logique de la fonction import-recipe, indépendante de Deno pour pouvoir être testée.
//
// POST { url: string, knownTags?: string[] }
//   → 200 { recipe, source: 'structured' | 'text', image: { data, type } | null }
// POST { url: string, mode: 'title' } → 200 { title: string | null } (titre de la page seul, sans modèle)
//   Vidéo YouTube : description de la vidéo, sinon recette écrite trouvée en ligne → source 'video', foundUrl
// POST { mode: 'text', text, url?, knownTags? } → 200 { recipe, source: 'text', image: null } (légende Instagram collée)
// POST { mode: 'photos', images: [{ data, type }], knownTags? } → 200 { recipe, source: 'photo', image: null }
//   (1 ou 2 photos d'une page de livre ou d'un scan)
//   → 4xx/5xx { error: message lisible }
// La passerelle Supabase vérifie le jeton (verify_jwt), mais accepte aussi la clé publique anonyme :
// `isSignedIn` vérifie en plus qu'il s'agit d'un utilisateur connecté.

import { CORS_HEADERS, json } from '../_shared/anthropic.ts'
import { extractPage, MIN_TEXT_CHARS, type PageContent } from './extract.ts'
import { extractRecipe, extractRecipeFromPhotos, ImportError, type ImportedRecipe, type ModelUsage, type PhotoInput } from './model.ts'
import { checkPublicUrl, resolvesToPublic, type ResolveDns } from './url.ts'
import { fetchYoutubeVideo, findWrittenRecipe, INSTAGRAM_CAPTION, isInstagram, NOT_WRITTEN, videoText, youtubeId } from './video.ts'

export { CORS_HEADERS }

export const MAX_PAGE_BYTES = 3_000_000
export const MAX_IMAGE_BYTES = 3_000_000
const PAGE_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 4
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
  isSignedIn: (authorization: string | null) => Promise<boolean>
}

/** Télécharge une ressource publique : redirections vérifiées une à une, taille et durée bornées. */
async function download(
  rawUrl: string,
  accept: string,
  maxBytes: number,
  doFetch: typeof fetch,
  resolve?: ResolveDns,
): Promise<{ url: URL; type: string; bytes: Uint8Array }> {
  let check = checkPublicUrl(rawUrl)
  for (let hop = 0; ; hop++) {
    if (!check.ok) throw new ImportError(check.reason, 400)
    // Nom d'hôte qui pointe vers une adresse privée (vérifié à chaque redirection).
    if (resolve && !(await resolvesToPublic(check.url.hostname, resolve))) throw new ImportError('Adresse non autorisée.', 400)
    let response: Response
    try {
      response = await doFetch(check.url.href, {
        redirect: 'manual',
        headers: {
          accept,
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
          'user-agent': 'Mozilla/5.0 (compatible; FoodApp/1.0; +import de recette)',
        },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      })
    } catch {
      throw new ImportError('Impossible de joindre ce site.', 502)
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      void response.body?.cancel().catch(() => undefined)
      if (hop >= MAX_REDIRECTS) throw new ImportError('Trop de redirections.', 502)
      check = checkPublicUrl(response.headers.get('location'), check.url)
      continue
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new ImportError(`Le site a répondu par une erreur (${response.status}).`, 502)
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > maxBytes) throw new ImportError('La page est trop volumineuse.', 413)

    // Lecture en flux pour ne jamais dépasser la limite, même sans content-length.
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        // Sans attendre : l'annulation peut rester en suspens selon la source du flux.
        void reader.cancel().catch(() => undefined)
        throw new ImportError('La page est trop volumineuse.', 413)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { url: check.url, type: response.headers.get('content-type') ?? '', bytes }
  }
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048))
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Photo de la recette : facultative, une erreur ne fait jamais échouer l'import. */
async function downloadImage(url: string | null, doFetch: typeof fetch, resolve?: ResolveDns): Promise<ImportResult['image']> {
  if (!url) return null
  try {
    const image = await download(url, IMAGE_TYPES.join(','), MAX_IMAGE_BYTES, doFetch, resolve)
    const type = image.type.split(';')[0]!.trim().toLowerCase()
    if (!IMAGE_TYPES.includes(type) || image.bytes.length === 0) return null
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
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const check = checkPublicUrl(input.url)
  if (!check.ok) throw new ImportError(check.reason, 400)
  const knownTags = knownTagsOf(input)
  // Instagram : rien à lire, la légende doit être collée (mode « text »).
  if (isInstagram(check.url)) throw new ImportError(INSTAGRAM_CAPTION, 422)
  if (!deps.apiKey) throw new ImportError('Le service d’analyse est mal configuré.', 500)
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
async function importContent({ content, url }: { content: PageContent; url: string }, knownTags: string[], deps: Deps): Promise<Result> {
  const [{ recipe, usage }, image] = await Promise.all([
    extractRecipe(content, url, knownTags, { apiKey: deps.apiKey!, model: deps.model, fetch: deps.fetchModel }),
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

  let usage: ModelUsage | null = null
  try {
    const content = { structured: null, text: videoText(video), title: video.title, imageUrl: video.thumbnail }
    const described = await extractRecipe(content, videoUrl, knownTags, options)
    usage = described.usage
    if (described.recipe.ingredients.length >= 2) return { recipe: described.recipe, source: 'video', image: await thumbnail, usage }
  } catch (error) {
    // Pas de recette dans la description : on la cherche en ligne.
    if (!(error instanceof ImportError && error.status === 422)) throw error
  }

  const found = await findWrittenRecipe(video, options)
  usage = addUsage(usage, found.usage)
  if (!found.url) throw new ImportError(NOT_WRITTEN, 422)
  // Page trouvée mais injoignable ou illisible : la recette n'est pas récupérable. Les erreurs du modèle, elles, remontent.
  let read: Awaited<ReturnType<typeof readPage>>
  try {
    read = await readPage(found.url, deps)
  } catch (error) {
    if (error instanceof ImportError) throw new ImportError(NOT_WRITTEN, 422)
    throw error
  }
  const page = await importContent(read, knownTags, deps)
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
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < MIN_PASTED_CHARS) throw new ImportError('Colle le texte de la recette (la légende complète).', 400)
  if (text.length > MAX_PASTED_CHARS) throw new ImportError('Texte trop long.', 413)
  const check = input.url ? checkPublicUrl(input.url) : null
  if (check && !check.ok) throw new ImportError(check.reason, 400)
  if (!deps.apiKey) throw new ImportError('Le service d’analyse est mal configuré.', 500)
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
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const check = checkPublicUrl(input.url)
  if (!check.ok) throw new ImportError(check.reason, 400)
  const page = await download(check.url.href, 'text/html,application/xhtml+xml', MAX_PAGE_BYTES, deps.fetchPage, deps.resolveDns)
  if (!/html|xml/i.test(page.type)) return { title: null }
  const title = extractPage(decodeHtml(page.bytes, page.type), page.url.href).title
  return { title: title ? title.replace(/\s+/g, ' ').trim().slice(0, 200) : null }
}

export const MAX_PHOTOS = 2
/** Taille maximale d'une photo en base64 (≈ 3 Mo d'image ; le navigateur les réduit à quelques centaines de Ko). */
export const MAX_PHOTO_BASE64 = 4_000_000
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Photos reçues du navigateur : 1 ou 2 images de type connu, de taille bornée. */
export function parsePhotos(body: unknown): PhotoInput[] {
  const raw = (typeof body === 'object' && body !== null ? (body as Record<string, unknown>).images : null) as unknown
  if (!Array.isArray(raw) || raw.length === 0) throw new ImportError('Aucune photo reçue.', 400)
  if (raw.length > MAX_PHOTOS) throw new ImportError(`${MAX_PHOTOS} photos au plus.`, 400)
  return raw.map((value) => {
    const image = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const type = PHOTO_TYPES.find((t) => t === image.type)
    if (!type || typeof image.data !== 'string') throw new ImportError('Photo illisible (JPEG, PNG ou WebP).', 400)
    if (image.data.length > MAX_PHOTO_BASE64) throw new ImportError('Photo trop lourde.', 413)
    if (!/^[A-Za-z0-9+/]+=*$/.test(image.data)) throw new ImportError('Photo illisible (JPEG, PNG ou WebP).', 400)
    return { type, data: image.data }
  })
}

export async function importPhotos(body: unknown, deps: Deps): Promise<ImportResult & { usage: ModelUsage | null }> {
  const photos = parsePhotos(body)
  const input = body as Record<string, unknown>
  const knownTags = Array.isArray(input.knownTags) ? input.knownTags.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 30)) : []
  if (!deps.apiKey) throw new ImportError('Le service d’analyse est mal configuré.', 500)
  const { recipes, usage } = await extractRecipeFromPhotos(photos, knownTags, { apiKey: deps.apiKey, model: deps.model, fetch: deps.fetchModel })
  return { recipe: recipes[0]!, recipes, source: 'photo', image: null, usage }
}

export function createHandler(deps: Deps) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    if (!(await deps.isSignedIn(request.headers.get('authorization')))) return json({ error: 'Connexion requise.' }, 401)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Requête invalide.' }, 400)
    }
    const started = Date.now()
    try {
      const mode = (body as { mode?: unknown } | null)?.mode
      if (mode === 'title') return json(await fetchTitle(body, deps))
      const { usage, ...result } =
        mode === 'photos' ? await importPhotos(body, deps) : mode === 'text' ? await importText(body, deps) : await importRecipe(body, deps)
      deps.log?.('import réussi', { source: result.source, ms: Date.now() - started, ...usage })
      return json(result)
    } catch (error) {
      if (error instanceof ImportError) {
        deps.log?.('import refusé', { status: error.status, message: error.message })
        return json({ error: error.message }, error.status)
      }
      deps.log?.('import en erreur', { error: String(error) })
      return json({ error: 'L’import a échoué.' }, 500)
    }
  }
}
