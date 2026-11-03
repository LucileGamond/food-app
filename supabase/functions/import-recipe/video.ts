// Recettes en vidéo. YouTube : description lue avec l'API officielle (clé YOUTUBE_API_KEY), puis, si elle ne contient
// pas la recette, recherche web de la recette écrite (blog ou site du créateur). Instagram ne laisse pas lire ses
// publications sans connexion : la légende est collée par la personne (mode « text »).

import { HttpError, runConversation, type ContentBlock, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import { searchResultUrls, urlKey } from '../_shared/search.ts'

/** Identifiant d'une vidéo YouTube (watch, shorts, live, embed, youtu.be) ; null pour une autre adresse. */
export function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  const id =
    host === 'youtu.be'
      ? url.pathname.split('/')[1]
      : host === 'youtube.com' || host === 'youtube-nocookie.com'
        ? url.pathname === '/watch'
          ? url.searchParams.get('v')
          : /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(url.pathname)?.[1]
        : null
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

export const isInstagram = (url: URL) => /(^|\.)instagram\.com$/.test(url.hostname) || url.hostname === 'instagr.am'

export const INSTAGRAM_CAPTION = 'Instagram ne laisse pas lire ses publications : colle la légende du reel pour importer la recette.'
export const NOT_WRITTEN =
  'La recette n’est écrite ni dans la description de la vidéo, ni sur une page trouvée en ligne. Fais une capture d’écran de la recette (photo) ou saisis-la à la main.'

export interface YoutubeVideo {
  id: string
  title: string
  channel: string
  description: string
  thumbnail: string | null
}

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3/videos'

/** Titre, chaîne, description et miniature d'une vidéo (API YouTube Data v3, 1 unité de quota). */
export async function fetchYoutubeVideo(id: string, apiKey: string, doFetch: typeof fetch): Promise<YoutubeVideo> {
  let response: Response
  try {
    response = await doFetch(`${YOUTUBE_API}?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new HttpError('Impossible de joindre YouTube.', 502)
  }
  const data = (await response.json().catch(() => null)) as { items?: { snippet?: Record<string, unknown> }[]; error?: unknown } | null
  if (!response.ok || !data) throw new HttpError(`YouTube a répondu par une erreur (${response.status}).`, 502)
  const snippet = data.items?.[0]?.snippet
  if (!snippet) throw new HttpError('Vidéo introuvable : elle est peut-être privée ou supprimée.', 404)
  const thumbnails = (snippet.thumbnails ?? {}) as Record<string, { url?: string } | undefined>
  const thumbnail = ['maxres', 'standard', 'high', 'medium', 'default'].map((size) => thumbnails[size]?.url).find((u) => typeof u === 'string') ?? null
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return { id, title: text(snippet.title), channel: text(snippet.channelTitle), description: text(snippet.description).slice(0, 8000), thumbnail }
}

/** Texte donné au modèle pour extraire la recette de la description. */
export function videoText(video: YoutubeVideo): string {
  return [`Vidéo YouTube « ${video.title} », chaîne « ${video.channel} ».`, '', 'Description de la vidéo :', video.description || '(vide)'].join('\n')
}

/** Liens de la description (recette complète sur le blog…), hors réseaux sociaux et boutiques. */
export function descriptionLinks(description: string): string[] {
  const social = /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|facebook\.com|twitter\.com|x\.com|pinterest\.|amazon\.|amzn\.|linktr\.ee|bit\.ly)/i
  const links = description.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []
  return [...new Set(links.map((l) => l.replace(/[.,;:!?]+$/, '')))].filter((l) => !social.test(l)).slice(0, 10)
}

const TOOL_NAME = 'page_recette'

const TOOL = {
  name: TOOL_NAME,
  description: 'Donne l’adresse de la page où la recette de la vidéo est écrite (ingrédients et étapes), ou null.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Adresse exacte, prise dans les résultats de recherche ou les liens de la description ; null si aucune page ne donne cette recette.',
      },
    },
    required: ['url'],
  },
}

const SYSTEM = [
  'Tu cherches la recette écrite d’une vidéo de cuisine (YouTube) dont la description ne donne pas la recette.',
  'Cherche d’abord sur le blog ou le site du créateur de la vidéo (son nom de chaîne, le titre de la vidéo), puis sur les autres sites où le même créateur publie la même recette.',
  'La page doit donner cette recette précise (mêmes ingrédients principaux), avec ses ingrédients. Une autre recette du même plat par quelqu’un d’autre ne convient pas.',
  'N’invente jamais d’adresse : elle doit venir des résultats de recherche ou des liens de la description. Si rien ne convient, réponds null.',
  `N’écris pas de texte : après tes recherches, appelle directement l’outil ${TOOL_NAME}.`,
].join('\n')

export function buildSearchMessage(video: YoutubeVideo, links: readonly string[]): string {
  return [
    `Vidéo : « ${video.title} »`,
    `Chaîne : ${video.channel}`,
    `Liens de la description : ${links.length ? links.join(' ; ') : '(aucun)'}`,
    '',
    'Description :',
    video.description.slice(0, 2000) || '(vide)',
  ].join('\n')
}

/** Adresse proposée, gardée seulement si elle vient de la recherche ou de la description. */
export function sanitizeFound(output: unknown, blocks: readonly ContentBlock[], links: readonly string[]): string | null {
  const raw = (typeof output === 'object' && output !== null ? (output as Record<string, unknown>).url : null) as unknown
  if (typeof raw !== 'string') return null
  const key = urlKey(raw)
  if (!key) return null
  const known = searchResultUrls(blocks).get(key)?.url ?? links.find((l) => urlKey(l) === key)
  return known ?? null
}

/** Page de la recette écrite d'une vidéo, trouvée par recherche web ; null si aucune. */
export async function findWrittenRecipe(
  video: YoutubeVideo,
  options: ModelOptions & { webSearchTool?: string },
  timeoutMs = 60_000,
): Promise<{ url: string | null; usage: ModelUsage }> {
  const links = descriptionLinks(video.description)
  const { input, blocks, usage } = await runConversation(
    {
      system: SYSTEM,
      tool: TOOL,
      serverTools: [
        {
          type: options.webSearchTool ?? 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
          user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' },
        },
      ],
      message: buildSearchMessage(video, links),
      maxTokens: 4096,
      effort: 'low',
      retryAfterTruncation: () => 'Réponds maintenant avec ce que tu as trouvé.',
      failure: 'La recherche de la recette a échoué',
      missing: 'réponse sans adresse',
      timeoutMs,
    },
    options,
  )
  return { url: sanitizeFound(input, blocks, links), usage }
}
