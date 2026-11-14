// Bibliothèque de patrons : un patron gardé (PDF, photos et/ou lien), commencé ou non, avec ses projets.
// Logique pure : saisie, tri, recherche et résumé d'un patron. L'envoi des fichiers est dans api.ts.

import { decimal, NEEDLE_TOLERANCE_MM, parseDecimal, parseMeters, yarnMeters, type Yarn } from './yarn'

/** Envie de tricoter un patron : 1 = bientôt, 2 = un jour, 3 = peut-être. */
export type PatternWish = 1 | 2 | 3

export const WISHES: { value: PatternWish; label: string }[] = [
  { value: 1, label: 'Bientôt' },
  { value: 2, label: 'Un jour' },
  { value: 3, label: 'Peut-être' },
]

/** Photos par patron (pages d'un magazine, d'un livre). */
export const MAX_PATTERN_PHOTOS = 10

/** Projet tricoté d'après un patron. */
export interface PatternProject {
  id: string
  title: string
  size: string
}

export interface KnitPattern {
  id: string
  title: string
  pdfPath: string | null
  /** Chemins des photos (bucket knit-photos). */
  photos: string[]
  url: string | null
  /** Taille visée. */
  size: string | null
  yarnIdea: string
  notes: string
  /** Besoins du patron (taille visée), s'ils sont connus : servent à le retrouver depuis une laine du stock. */
  metersNeeded: number | null
  needleMm: number | null
  /** Envie notée ; null une fois commencé, ou pour un patron simplement gardé. */
  wish: PatternWish | null
  createdAt: string
  projects: PatternProject[]
  /** Tailles dont la lecture par le modèle est gardée (un projet dans ces tailles se crée sans relire). */
  readSizes: string[]
}

/** Ce qui s'enregistre d'un patron, hors fichiers. */
export interface PatternFields {
  title: string
  url: string | null
  size: string | null
  yarnIdea: string
  notes: string
  metersNeeded: number | null
  needleMm: number | null
  wish: PatternWish | null
}

/** Fichiers d'un patron en cours de saisie : ceux déjà enregistrés qu'on garde, et les nouveaux à envoyer. */
export interface PatternFiles {
  pdfPath: string | null
  newPdf: File | null
  photos: string[]
  /** Photos déjà réduites (JPEG). */
  newPhotos: Blob[]
}

/** Saisie du formulaire (nombres en texte). */
export interface PatternDraft {
  title: string
  url: string
  size: string
  yarnIdea: string
  notes: string
  metersNeeded: string
  needleMm: string
  wish: PatternWish | null
}

export const EMPTY_PATTERN_DRAFT: PatternDraft = { title: '', url: '', size: '', yarnIdea: '', notes: '', metersNeeded: '', needleMm: '', wish: 2 }

export function toPatternDraft(p: KnitPattern): PatternDraft {
  return {
    title: p.title,
    url: p.url ?? '',
    size: p.size ?? '',
    yarnIdea: p.yarnIdea,
    notes: p.notes,
    metersNeeded: p.metersNeeded === null ? '' : String(p.metersNeeded),
    needleMm: p.needleMm === null ? '' : decimal(p.needleMm),
    wish: p.wish,
  }
}

/** Nombre de fichiers d'un patron (PDF et photos), gardés et nouveaux. */
export function fileCount(files: PatternFiles): { pdf: boolean; photos: number } {
  return { pdf: files.pdfPath !== null || files.newPdf !== null, photos: files.photos.length + files.newPhotos.length }
}

/** Saisie → patron enregistrable, ou le premier problème. Un patron a au moins un format : PDF, photo ou lien. */
export function parsePatternDraft(draft: PatternDraft, files: PatternFiles): { fields: PatternFields } | { error: string } {
  const title = draft.title.trim()
  const url = draft.url.trim()
  const count = fileCount(files)
  if (!title) return { error: 'Donne un nom au patron.' }
  if (title.length > 200) return { error: 'Nom : 200 caractères au plus.' }
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { error: 'Le lien doit commencer par http:// ou https://.' }
  if (url.length > 2000) return { error: 'Lien : 2000 caractères au plus.' }
  if (!count.pdf && count.photos === 0 && !url) return { error: 'Ajoute le patron : un PDF, des photos ou un lien.' }
  if (count.photos > MAX_PATTERN_PHOTOS) return { error: `${MAX_PATTERN_PHOTOS} photos au plus.` }
  if (draft.size.trim().length > 40) return { error: 'Taille : 40 caractères au plus.' }
  if (draft.yarnIdea.trim().length > 200) return { error: 'Laine envisagée : 200 caractères au plus.' }
  if (draft.notes.trim().length > 2000) return { error: 'Notes : 2000 caractères au plus.' }
  const metersNeeded = parseMeters(draft.metersNeeded)
  if (metersNeeded === undefined) return { error: 'Métrage : un nombre entier de mètres (1 à 20 000).' }
  const needle = parseDecimal(draft.needleMm)
  if (needle !== null && (!Number.isFinite(needle) || needle < 1 || needle > 30)) return { error: 'Aiguilles : entre 1 et 30 mm.' }
  return {
    fields: {
      title,
      url: url || null,
      size: draft.size.trim() || null,
      yarnIdea: draft.yarnIdea.trim(),
      notes: draft.notes.trim(),
      metersNeeded,
      needleMm: needle === null ? null : Math.round(needle * 100) / 100,
      wish: draft.wish,
    },
  }
}

/** Les envies d'abord (les plus pressées en tête), puis les autres patrons, les plus récents d'abord. */
export function sortPatterns<T extends Pick<KnitPattern, 'wish' | 'createdAt'>>(items: T[]): T[] {
  return items.toSorted((a, b) => (a.wish ?? 4) - (b.wish ?? 4) || (a.wish === null ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)))
}

export type PatternFilter = 'all' | 'todo' | 'started'

export const PATTERN_FILTERS: { value: PatternFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'todo', label: 'À faire' },
  { value: 'started', label: 'Commencés' },
]

/** Minuscules sans accents, pour chercher « rosee » dans « Rosée ». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Patrons qui répondent à la recherche (titre, notes, laine, taille, nom des projets) et au filtre, triés. */
export function filterPatterns(items: KnitPattern[], search: string, filter: PatternFilter): KnitPattern[] {
  const words = fold(search).split(/\s+/).filter(Boolean)
  return sortPatterns(
    items.filter((p) => {
      if (filter === 'todo' && p.projects.length > 0) return false
      if (filter === 'started' && p.projects.length === 0) return false
      const text = fold([p.title, p.notes, p.yarnIdea, p.size ?? '', ...p.projects.map((project) => project.title)].join(' '))
      return words.every((w) => text.includes(w))
    }),
  )
}

/** « Bientôt · taille M · 600 m · aiguilles 4 mm · Mérinos » ; « 2 projets » une fois commencé. */
export function patternFacts(p: KnitPattern): string[] {
  return [
    p.projects.length > 0 ? `${p.projects.length} projet${p.projects.length > 1 ? 's' : ''}` : WISHES.find((w) => w.value === p.wish)?.label,
    p.size && `taille ${p.size}`,
    p.metersNeeded !== null && `${p.metersNeeded} m`,
    p.needleMm !== null && `aiguilles ${decimal(p.needleMm)} mm`,
    p.yarnIdea,
  ].filter((f): f is string => !!f)
}

/** « PDF », « 3 photos », « lien » : les formats du patron. */
export function patternFormats(p: Pick<KnitPattern, 'pdfPath' | 'photos' | 'url'>): string[] {
  return [p.pdfPath && 'PDF', p.photos.length > 0 && `${p.photos.length} photo${p.photos.length > 1 ? 's' : ''}`, p.url && 'lien'].filter((f): f is string => !!f)
}

/** Nom proposé d'après le fichier choisi : « pull-bergamote.pdf » → « pull-bergamote ». */
export function titleFromFile(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '')
}

// ---------------------------------------------------------------------------
// Patron ajouté par un lien
// ---------------------------------------------------------------------------

/** Ce que la lecture d'un lien a trouvé (sans le modèle) : PDF du patron, nom et image de la page. */
export interface PatternLink {
  url: string
  title: string | null
  /** Image de la page (le modèle tricoté). */
  image: File | null
  pdf: File | null
}

/** Réponse de la fonction qui lit un lien (fichiers en base64). */
export interface PatternLinkResponse {
  url: string
  title: string | null
  image: { data: string; type: string } | null
  pdf: { data: string; name: string } | null
}

/** Fichier en base64 → fichier, comme s'il avait été choisi sur le téléphone. */
export function base64ToFile(data: string, name: string, type: string): File {
  return new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type })
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp' }

export function patternLinkFromResponse(read: PatternLinkResponse): PatternLink {
  return {
    url: read.url,
    title: read.title,
    image: read.image ? base64ToFile(read.image.data, `photo-du-modele.${IMAGE_EXTENSIONS[read.image.type] ?? 'jpg'}`, read.image.type) : null,
    pdf: read.pdf ? base64ToFile(read.pdf.data, read.pdf.name, 'application/pdf') : null,
  }
}

/** Ce que la lecture d'un lien ajoute au patron en cours de saisie, sans rien remplacer, et ce qu'on en dit. */
export interface LinkAdditions {
  title: string | null
  pdf: File | null
  /** Photo du modèle, déjà réduite. */
  image: Blob | null
  message: string
}

/** `imageFailed` : la page avait une photo, mais elle n'a pas pu être préparée (le reste est ajouté quand même). */
export function linkAdditions(
  link: { title: string | null; pdf: File | null; image: Blob | null },
  current: { title: string; files: PatternFiles },
  { imageFailed = false }: { imageFailed?: boolean } = {},
): LinkAdditions {
  const count = fileCount(current.files)
  const title = !current.title.trim() && link.title ? link.title : null
  const pdf = link.pdf && !count.pdf ? link.pdf : null
  const image = link.image && count.photos < MAX_PATTERN_PHOTOS ? link.image : null
  const parts = [
    pdf ? 'PDF du patron ajouté' : link.pdf ? 'PDF trouvé, mais le patron en a déjà un' : 'Pas de PDF trouvé (la page demande peut-être une connexion) : le lien est gardé',
    image ? 'photo du modèle ajoutée' : imageFailed && 'photo du modèle illisible',
    title && 'nom repris de la page',
  ].filter((p): p is string => !!p)
  return { title, pdf, image, message: `${parts.join(' · ')}.` }
}

/** Saisie qui diffère de celle du départ (champs ou fichiers) : la quitter la perdrait. */
export function patternFormChanged(
  initial: PatternDraft,
  draft: PatternDraft,
  saved: Pick<KnitPattern, 'pdfPath' | 'photos'> | null,
  files: PatternFiles,
): boolean {
  const fields = (Object.keys(initial) as (keyof PatternDraft)[]).some((k) => initial[k] !== draft[k])
  const savedPhotos = saved?.photos ?? []
  return (
    fields ||
    files.newPdf !== null ||
    files.newPhotos.length > 0 ||
    files.pdfPath !== (saved?.pdfPath ?? null) ||
    files.photos.length !== savedPhotos.length ||
    files.photos.some((p, i) => p !== savedPhotos[i])
  )
}

/** Lien saisi qui peut être lu (http ou https). */
export function isReadableLink(url: string): boolean {
  return /^https?:\/\/\S+\.\S+$/i.test(url.trim())
}

// ---------------------------------------------------------------------------
// « Quel patron pour ma laine ? »
// ---------------------------------------------------------------------------

export interface PatternMatch {
  item: KnitPattern
  /** « 350 m nécessaires, 750 m en stock », « aiguilles 4 mm (laine : 3,5 mm) ». */
  reasons: string[]
}

/**
 * Patrons de la bibliothèque comparés à une laine : ceux qui conviennent (métrage suffisant, aiguilles proches) et ceux qu'on
 * ne peut pas juger (besoins du patron ou de la laine inconnus). Les patrons qui ne conviennent pas sont écartés.
 */
export function matchPatterns(yarn: Yarn, patterns: KnitPattern[]): { fits: PatternMatch[]; unknown: KnitPattern[] } {
  const available = yarnMeters(yarn)
  const fits: PatternMatch[] = []
  const unknown: KnitPattern[] = []
  for (const item of sortPatterns(patterns)) {
    const reasons: string[] = []
    let judged = false
    let fails = false
    if (item.metersNeeded !== null && available !== null) {
      judged = true
      if (item.metersNeeded > available) fails = true
      else reasons.push(`${item.metersNeeded} m nécessaires, ${available} m en stock`)
    }
    if (item.needleMm !== null && yarn.needle_mm !== null) {
      judged = true
      if (Math.abs(item.needleMm - yarn.needle_mm) > NEEDLE_TOLERANCE_MM) fails = true
      else reasons.push(`aiguilles ${decimal(item.needleMm)} mm (laine : ${decimal(yarn.needle_mm)} mm)`)
    }
    if (!judged) unknown.push(item)
    else if (!fails) fits.push({ item, reasons })
  }
  return { fits, unknown }
}
