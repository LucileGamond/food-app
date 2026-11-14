// Bibliothèque de patrons : un patron gardé (PDF, photos et/ou lien), commencé ou non, avec ses projets.
// Logique pure : saisie, tri, recherche et résumé d'un patron. L'envoi des fichiers est dans api.ts.

import { sizeIndexOf } from './sizes'
import { decimal, NEEDLE_TOLERANCE_MM, parseDecimal, parseMeters, yarnMeters, type Yarn } from './yarn'

/** Photos par patron (pages d'un magazine, d'un livre). La première sert de couverture. */
export const MAX_PATTERN_PHOTOS = 10
/** Étiquettes par patron (« pull », « bébé », « cadeau »), 30 caractères chacune (comme la base). */
export const MAX_PATTERN_TAGS = 10
export const MAX_TAG_LENGTH = 30
/** Pages photographiées lues par « Remplir avec l'IA » (comme la fonction knit-pattern). */
export const MAX_INFO_PHOTOS = 4

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
  /** Étiquettes, en minuscules. */
  tags: string[]
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
  tags: string[]
}

/** Photo d'un patron en cours de saisie : chemin d'une photo enregistrée, ou nouvelle photo déjà réduite (JPEG). */
export type PatternPhoto = string | Blob

/** Fichiers d'un patron en cours de saisie, dans l'ordre affiché : ceux déjà enregistrés qu'on garde, et les nouveaux à envoyer. */
export interface PatternFiles {
  pdfPath: string | null
  newPdf: File | null
  photos: PatternPhoto[]
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
  tags: string[]
}

export const EMPTY_PATTERN_DRAFT: PatternDraft = { title: '', url: '', size: '', yarnIdea: '', notes: '', metersNeeded: '', needleMm: '', tags: [] }

export function toPatternDraft(p: KnitPattern): PatternDraft {
  return {
    title: p.title,
    url: p.url ?? '',
    size: p.size ?? '',
    yarnIdea: p.yarnIdea,
    notes: p.notes,
    metersNeeded: p.metersNeeded === null ? '' : String(p.metersNeeded),
    needleMm: p.needleMm === null ? '' : decimal(p.needleMm),
    tags: p.tags,
  }
}

/** Étiquette saisie → étiquette gardée : espaces resserrés, minuscules, 30 caractères (« Pull  Homme » → « pull homme »). */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH).trim()
}

/** Ajoute une étiquette à la liste, sans doublon ni vide ; la liste est rendue telle quelle si elle est pleine. */
export function addTag(tags: string[], tag: string): string[] {
  const normalized = normalizeTag(tag)
  if (!normalized || tags.includes(normalized) || tags.length >= MAX_PATTERN_TAGS) return tags
  return [...tags, normalized]
}

/** Étiquettes de la bibliothèque, les plus employées d'abord (puis par ordre alphabétique) : suggestions et filtre. */
export function libraryTags(items: Pick<KnitPattern, 'tags'>[]): string[] {
  const counts = new Map<string, number>()
  for (const tag of items.flatMap((p) => p.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([tag]) => tag)
}

/** Photos dans un nouvel ordre : celle n° `from` passe en position `to` (la position 0 est la couverture). */
export function movePhoto<T>(photos: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= photos.length || to < 0 || to >= photos.length) return photos
  const next = photos.filter((_, i) => i !== from)
  next.splice(to, 0, photos[from]!)
  return next
}

/** Nombre de fichiers d'un patron (PDF et photos), gardés et nouveaux. */
export function fileCount(files: PatternFiles): { pdf: boolean; photos: number } {
  return { pdf: files.pdfPath !== null || files.newPdf !== null, photos: files.photos.length }
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
  const tags = [...new Set(draft.tags.map(normalizeTag).filter(Boolean))]
  if (tags.length > MAX_PATTERN_TAGS) return { error: `${MAX_PATTERN_TAGS} étiquettes au plus.` }
  return {
    fields: {
      title,
      url: url || null,
      size: draft.size.trim() || null,
      yarnIdea: draft.yarnIdea.trim(),
      notes: draft.notes.trim(),
      metersNeeded,
      needleMm: needle === null ? null : Math.round(needle * 100) / 100,
      tags,
    },
  }
}

/** Les patrons les plus récents d'abord. */
export function sortPatterns<T extends Pick<KnitPattern, 'createdAt'>>(items: T[]): T[] {
  return items.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Minuscules sans accents, pour chercher « rosee » dans « Rosée ». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Patrons qui répondent à la recherche (titre, notes, laine, taille, étiquettes, nom des projets) et portent l'étiquette choisie, triés. */
export function filterPatterns(items: KnitPattern[], search: string, tag: string | null = null): KnitPattern[] {
  const words = fold(search).split(/\s+/).filter(Boolean)
  return sortPatterns(
    items.filter((p) => {
      if (tag !== null && !p.tags.includes(tag)) return false
      const text = fold([p.title, p.notes, p.yarnIdea, p.size ?? '', ...p.tags, ...p.projects.map((project) => project.title)].join(' '))
      return words.every((w) => text.includes(w))
    }),
  )
}

/** Nom comparable : sans accents, ni casse, ni ponctuation (« Gilet-Rosée » = « gilet rosee »). */
function sameTitle(title: string): string {
  return fold(title)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Lien comparable : sans protocole, « www. », ancre ni « / » final, en minuscules. */
function sameUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '')
}

/** Patrons déjà dans la bibliothèque sous le même nom ou avec le même lien (hors `ignoreId`, le patron modifié). */
export function findDuplicates<T extends Pick<KnitPattern, 'id' | 'title' | 'url'>>(items: T[], candidate: { title: string; url: string | null }, ignoreId: string | null = null): T[] {
  const title = sameTitle(candidate.title)
  const url = candidate.url ? sameUrl(candidate.url) : ''
  return items.filter((p) => p.id !== ignoreId && ((title !== '' && sameTitle(p.title) === title) || (url !== '' && p.url !== null && sameUrl(p.url) === url)))
}

/** « 2 projets · taille M · 600 m · aiguilles 4 mm · Mérinos » (les projets, s'il y en a). */
export function patternFacts(p: KnitPattern): string[] {
  return [
    p.projects.length > 0 && `${p.projects.length} projet${p.projects.length > 1 ? 's' : ''}`,
    p.size && `taille ${p.size}`,
    p.metersNeeded !== null && `${p.metersNeeded} m`,
    p.needleMm !== null && `aiguilles ${decimal(p.needleMm)} mm`,
    p.yarnIdea,
  ].filter((f): f is string => !!f)
}

/** « 5 patrons · 2 tricotés » : ce que contient la bibliothèque. */
export function librarySummary(items: Pick<KnitPattern, 'projects'>[]): string {
  const knitted = items.filter((p) => p.projects.length > 0).length
  return [`${items.length} patron${items.length > 1 ? 's' : ''}`, knitted > 0 && `${knitted} tricoté${knitted > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
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
  const fields = (Object.keys(initial) as (keyof PatternDraft)[]).some((k) => String(initial[k]) !== String(draft[k]))
  const savedPhotos = saved?.photos ?? []
  return (
    fields ||
    files.newPdf !== null ||
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

// ---------------------------------------------------------------------------
// « Remplir avec l'IA » : infos générales lues dans le PDF ou les photos
// ---------------------------------------------------------------------------

/** Ce que le modèle a lu du patron (réponse de knit-pattern { info }). */
export interface PatternInfo {
  title: string | null
  /** Tailles du patron (vide : taille unique). */
  sizes: string[]
  /** Métrage par taille, dans l'ordre des tailles (une valeur pour une taille unique). */
  meters: (number | null)[]
  needleMm: number | null
  yarn: string | null
  /** Type d'ouvrage (« pull ») : devient une étiquette. */
  kind: string | null
}

/** Ce que les infos lues ajoutent à la saisie, sans rien remplacer, et ce qu'on en dit. */
export function infoAdditions(info: PatternInfo, draft: PatternDraft): { patch: Partial<PatternDraft>; message: string } {
  const patch: Partial<PatternDraft> = {}
  const filled: string[] = []
  if (!draft.title.trim() && info.title) {
    patch.title = info.title
    filled.push('nom')
  }
  // Métrage de la taille visée ; sans taille visée, celui d'un patron en taille unique.
  const index = info.sizes.length === 0 ? 0 : draft.size.trim() ? sizeIndexOf(info.sizes, draft.size) : info.sizes.length === 1 ? 0 : null
  const meters = index === null ? null : (info.meters[index] ?? null)
  if (!draft.metersNeeded.trim() && meters !== null) {
    patch.metersNeeded = String(meters)
    filled.push('métrage')
  }
  if (!draft.needleMm.trim() && info.needleMm !== null) {
    patch.needleMm = decimal(info.needleMm)
    filled.push('aiguilles')
  }
  if (!draft.yarnIdea.trim() && info.yarn) {
    patch.yarnIdea = info.yarn
    filled.push('laine')
  }
  const tags = info.kind ? addTag(draft.tags, info.kind) : draft.tags
  if (tags !== draft.tags) {
    patch.tags = tags
    filled.push(`étiquette « ${tags.at(-1)} »`)
  }
  const parts = [filled.length > 0 ? `Rempli : ${filled.join(', ')}` : 'Rien de nouveau : la fiche était déjà remplie']
  if (info.sizes.length > 1) parts.push(`tailles du patron : ${info.sizes.join(', ')}`)
  if (!draft.metersNeeded.trim() && meters === null && info.meters.some((m) => m !== null)) {
    parts.push(index === null && info.sizes.length > 1 ? 'métrage selon la taille : indique la taille visée et relance' : 'métrage introuvable pour cette taille')
  }
  return { patch, message: `${parts.join(' · ')}.` }
}

// ---------------------------------------------------------------------------
// Ajout groupé : un patron par PDF
// ---------------------------------------------------------------------------

/** PDF choisi pour l'ajout groupé : le patron qu'il donnera, ou pourquoi il est sauté. */
export interface BatchItem {
  title: string
  skip: 'too-large' | 'duplicate' | null
}

/** Patrons à créer d'après des PDF : nom tiré du fichier ; trop lourds et doublons (bibliothèque ou même lot) sautés. */
export function planBatch(files: { name: string; size: number }[], library: Pick<KnitPattern, 'id' | 'title' | 'url'>[], maxBytes: number): BatchItem[] {
  const taken = [...library]
  return files.map((file) => {
    const title = titleFromFile(file.name).trim().slice(0, 200) || 'Patron'
    if (file.size > maxBytes) return { title, skip: 'too-large' }
    if (findDuplicates(taken, { title, url: null }).length > 0) return { title, skip: 'duplicate' }
    // Comparé aux suivants du lot comme s'il était déjà rangé.
    taken.push({ id: `lot-${taken.length}`, title, url: null })
    return { title, skip: null }
  })
}

/** Patron créé par l'ajout groupé : seulement son nom et son PDF. */
export function batchFields(title: string): PatternFields {
  return { title, url: null, size: null, yarnIdea: '', notes: '', metersNeeded: null, needleMm: null, tags: [] }
}
