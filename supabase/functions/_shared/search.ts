// Résultats de la recherche web d'Anthropic : seules les adresses réellement trouvées sont acceptées.

import type { ContentBlock } from './anthropic.ts'

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Adresse comparable : sans www, sans paramètres ni ancre, sans / final. */
export function urlKey(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return null
  }
}

/** Adresses réellement renvoyées par la recherche web (les seules acceptées pour une recette web). */
export function searchResultUrls(blocks: readonly ContentBlock[]): Map<string, { url: string; title: string }> {
  const results = new Map<string, { url: string; title: string }>()
  for (const block of blocks) {
    // En cas d'erreur de recherche, `content` est un objet (code d'erreur), pas une liste.
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const result of block.content as Record<string, unknown>[]) {
      const url = typeof result?.url === 'string' ? result.url : ''
      const key = urlKey(url)
      if (key && !results.has(key)) results.set(key, { url, title: str(result.title, 200) })
    }
  }
  return results
}
