// Patron ajouté par un lien (bibliothèque), sans le modèle : le PDF est téléchargé si le lien en est un ; sinon la page
// donne son nom et son image, et le PDF du patron est cherché parmi ses liens.

import { parseHTML } from 'linkedom'
import { HttpError } from '../_shared/anthropic.ts'
import { decodeHtml, download, toBase64 } from '../_shared/download.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { checkPublicUrl, type ResolveDns } from '../_shared/url.ts'

/** Comme les PDF envoyés depuis le téléphone. */
export const MAX_LINK_PDF_BYTES = 20 * 1024 * 1024
const MAX_PAGE_BYTES = 3_000_000
const MAX_IMAGE_BYTES = 3_000_000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** PDF de la page essayés au plus (les autres liens sont souvent des fichiers sans rapport). */
const MAX_PDF_TRIES = 2

export interface LinkInput {
  url: string
}

export interface LinkDeps {
  fetchPage: typeof fetch
  resolveDns?: ResolveDns
}

export interface LinkResult {
  /** Adresse finale (après redirections). */
  url: string
  title: string | null
  /** Image de la page (le modèle tricoté), facultative. */
  image: { data: string; type: string } | null
  /** PDF du patron (le lien lui-même, ou trouvé dans la page). */
  pdf: { data: string; name: string } | null
}

/** Corps { link: { url } } ; null si ce n'est pas un lien à lire. */
export function parseLinkInput(body: unknown): LinkInput | null {
  const link = asRecord(body).link
  if (link === undefined) return null
  const check = checkPublicUrl(asRecord(link).url)
  if (!check.ok) throw new HttpError(check.reason, 400)
  return { url: check.url.href }
}

const isPdf = (bytes: Uint8Array) => bytes.length > 4 && new TextDecoder('latin1').decode(bytes.subarray(0, 5)) === '%PDF-'

/** « Pull%20Bergamote.pdf » → « Pull Bergamote ». */
export function nameFromUrl(url: string): string | null {
  const last = new URL(url).pathname.split('/').filter(Boolean).at(-1)
  if (!last) return null
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    // Nom mal encodé : gardé tel quel.
  }
  name = name.replace(/\.pdf$/i, '').replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim()
  return name ? name.slice(0, 200) : null
}

const PATTERN_WORDS = /patron|pattern|t[ée]l[ée]charg|download|anleitung|explication|modele|modèle/i

export interface PageInfo {
  title: string | null
  imageUrl: string | null
  /** Liens vers des PDF, les plus probables d'abord (texte ou adresse qui parle de patron, de téléchargement). */
  pdfLinks: string[]
}

/** Nom, image et liens PDF d'une page. */
export function readPageInfo(html: string, pageUrl: string): PageInfo {
  const { document } = parseHTML(html)
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() || null
  const absolute = (href: string | null | undefined) => {
    if (!href) return null
    const check = checkPublicUrl(href, new URL(pageUrl))
    return check.ok ? check.url.href : null
  }
  const title =
    meta('meta[property="og:title"]') ?? meta('meta[name="twitter:title"]') ?? (document.querySelector('title')?.textContent?.trim() || null) ?? (document.querySelector('h1')?.textContent?.trim() || null)
  const imageUrl = absolute(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]'))

  const found: { href: string; likely: boolean }[] = []
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = absolute(anchor.getAttribute('href'))
    if (!href || !/\.pdf$/i.test(new URL(href).pathname) || found.some((f) => f.href === href)) continue
    found.push({ href, likely: PATTERN_WORDS.test(`${anchor.textContent ?? ''} ${href}`) })
  }
  const pdfLinks = [...found.filter((f) => f.likely), ...found.filter((f) => !f.likely)].map((f) => f.href)
  return { title: title ? title.replace(/\s+/g, ' ').slice(0, 200) : null, imageUrl, pdfLinks }
}

async function downloadPdf(url: string, deps: LinkDeps): Promise<LinkResult['pdf']> {
  const file = await download(url, 'application/pdf', MAX_LINK_PDF_BYTES, deps.fetchPage, deps.resolveDns, 'PDF trop lourd (20 Mo au plus).')
  return isPdf(file.bytes) ? { data: toBase64(file.bytes), name: `${nameFromUrl(file.url.href) ?? 'patron'}.pdf` } : null
}

/** Image de la page : facultative, une erreur ne fait jamais échouer la lecture du lien. */
async function downloadImage(url: string | null, deps: LinkDeps): Promise<LinkResult['image']> {
  if (!url) return null
  try {
    const image = await download(url, IMAGE_TYPES.join(','), MAX_IMAGE_BYTES, deps.fetchPage, deps.resolveDns)
    const type = image.type.split(';')[0]!.trim().toLowerCase()
    return IMAGE_TYPES.some((t) => t === type) && image.bytes.length > 0 ? { data: toBase64(image.bytes), type } : null
  } catch {
    return null
  }
}

/** PDF de la page : le premier des liens probables qui est vraiment un PDF ; aucun si tous échouent (connexion requise…). */
async function findPdf(links: string[], deps: LinkDeps): Promise<LinkResult['pdf']> {
  for (const link of links.slice(0, MAX_PDF_TRIES)) {
    try {
      const pdf = await downloadPdf(link, deps)
      if (pdf) return pdf
    } catch {
      // Lien suivant.
    }
  }
  return null
}

export async function readLink(input: LinkInput, deps: LinkDeps): Promise<LinkResult> {
  const response = await download(input.url, 'text/html,application/xhtml+xml,application/pdf', MAX_LINK_PDF_BYTES, deps.fetchPage, deps.resolveDns, 'Fichier trop lourd (20 Mo au plus).')
  const url = response.url.href
  if (isPdf(response.bytes)) {
    return { url, title: nameFromUrl(url), image: null, pdf: { data: toBase64(response.bytes), name: `${nameFromUrl(url) ?? 'patron'}.pdf` } }
  }
  if (!/html|xml/i.test(response.type)) throw new HttpError('Ce lien ne mène ni à une page ni à un PDF.', 422)
  if (response.bytes.length > MAX_PAGE_BYTES) throw new HttpError('La page est trop volumineuse.', 413)
  const info = readPageInfo(decodeHtml(response.bytes, response.type), url)
  const [image, pdf] = await Promise.all([downloadImage(info.imageUrl, deps), findPdf(info.pdfLinks, deps)])
  return { url, title: info.title, image, pdf }
}
