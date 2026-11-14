// Téléchargement d'une ressource publique (page, image, PDF) pour les fonctions qui lisent un lien : adresse vérifiée
// (protection SSRF, voir url.ts) à chaque redirection, taille et durée bornées.

import { HttpError } from './anthropic.ts'
import { checkPublicUrl, resolvesToPublic, type ResolveDns } from './url.ts'

/** Durée maximale d'un téléchargement, redirections comprises. */
export const PAGE_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 4

/** Télécharge une ressource publique : redirections vérifiées une à une, taille et durée bornées. */
export async function download(
  rawUrl: string,
  accept: string,
  maxBytes: number,
  doFetch: typeof fetch,
  resolve?: ResolveDns,
  /** Message quand la ressource dépasse `maxBytes`. */
  tooLarge = 'La page est trop volumineuse.',
): Promise<{ url: URL; type: string; bytes: Uint8Array }> {
  let check = checkPublicUrl(rawUrl)
  const signal = AbortSignal.timeout(PAGE_TIMEOUT_MS)
  for (let hop = 0; ; hop++) {
    if (!check.ok) throw new HttpError(check.reason, 400)
    // Nom d'hôte qui pointe vers une adresse privée (vérifié à chaque redirection).
    if (resolve && !(await resolvesToPublic(check.url.hostname, resolve))) throw new HttpError('Adresse non autorisée.', 400)
    let response: Response
    try {
      response = await doFetch(check.url.href, {
        redirect: 'manual',
        headers: {
          accept,
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
          'user-agent': 'Mozilla/5.0 (compatible; FoodApp/1.0)',
        },
        signal,
      })
    } catch {
      throw new HttpError('Impossible de joindre ce site.', 502)
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      void response.body?.cancel().catch(() => undefined)
      if (hop >= MAX_REDIRECTS) throw new HttpError('Trop de redirections.', 502)
      check = checkPublicUrl(response.headers.get('location'), check.url)
      continue
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined)
      throw new HttpError(`Le site a répondu par une erreur (${response.status}).`, 502)
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > maxBytes) throw new HttpError(tooLarge, 413)

    // Lecture en flux pour ne jamais dépasser la limite, même sans content-length.
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        // Délai dépassé (ou connexion coupée) pendant la lecture.
        throw new HttpError('Impossible de joindre ce site.', 502)
      }
      const { done, value } = chunk
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        // Sans attendre : l'annulation peut rester en suspens selon la source du flux.
        void reader.cancel().catch(() => undefined)
        throw new HttpError(tooLarge, 413)
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

export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048))
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
