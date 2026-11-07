// Scan de livre : la session (livre, photos regroupées par recette, état de lecture de chaque groupe). Fonctions pures ;
// les photos elles-mêmes sont rangées à part (lib/scanStore), les groupes n'en gardent que l'identifiant.

import { needsRetry, tally, type BatchRecipe, type BatchStatus } from './batchImport'

/** Pages au plus par session (une double page en compte deux). */
export const MAX_SCAN_PAGES = 100
/** Photos au plus pour une recette (limite de la lecture). */
export const MAX_GROUP_IMAGES = 4
/** Délai avant l'envoi d'une photo : le temps de l'annuler. */
export const UNDO_DELAY_MS = 3000
/** Nouvel essai d'un groupe interrompu par une coupure du réseau. */
export const OFFLINE_RETRY_MS = 5000

/** Photos d'une même recette, lues ensemble. */
export interface ScanGroup {
  id: string
  /** Identifiants des images rangées (une page chacune, dans l'ordre). */
  images: string[]
  /** Fermé : plus aucune photo ne s'y ajoute, il peut partir à la lecture. */
  closed: boolean
  /** Pas d'envoi avant (délai d'annulation, nouvel essai hors ligne). */
  readyAt: number
  status: BatchStatus
  message?: string
  recipes: BatchRecipe[]
  /** Relu à la demande (« C'est une recette ») après avoir été jugé sans recette. */
  insist?: boolean
}

export interface ScanSession {
  book: string
  /** Recettes sur plusieurs photos : le bouton « Nouvelle recette » ferme le groupe en cours. Sinon, 1 photo = 1 recette. */
  multi: boolean
  groups: ScanGroup[]
  /** Photos prises, la dernière à la fin (pour l'annuler) : groupe et images ajoutées. */
  history: { group: string; images: string[] }[]
}

export const newSession = (book: string, multi: boolean): ScanSession => ({ book, multi, groups: [], history: [] })

/** Pages prises dans la session. */
export const pageCount = (session: ScanSession): number => session.history.reduce((n, h) => n + h.images.length, 0)

const group = (id: string, images: string[], closed: boolean, now: number): ScanGroup => ({
  id,
  images,
  closed,
  readyAt: now + UNDO_DELAY_MS,
  status: 'pending',
  recipes: [],
})

const openGroup = (session: ScanSession) => session.groups.find((g) => !g.closed)

/**
 * Ajoute une photo (une page, ou les deux moitiés d'une double page). 1 photo = 1 recette : un groupe fermé, envoyé après
 * le délai d'annulation. Plusieurs photos par recette : ajoutée au groupe en cours ; s'il est plein, il part et le
 * suivant reprend sa dernière page (la recette continue).
 */
export function addCapture(session: ScanSession, images: string[], now: number, newId: () => string): ScanSession {
  const current = session.multi ? openGroup(session) : undefined
  if (current && current.images.length + images.length <= MAX_GROUP_IMAGES) {
    return {
      ...session,
      groups: session.groups.map((g) => (g.id === current.id ? { ...g, images: [...g.images, ...images], readyAt: now + UNDO_DELAY_MS } : g)),
      history: [...session.history, { group: current.id, images }],
    }
  }
  const carried = current ? current.images.slice(-1) : []
  const created = group(newId(), [...carried, ...images], !session.multi, now)
  return {
    ...session,
    groups: [...session.groups.map((g) => (g.id === current?.id ? { ...g, closed: true } : g)), created],
    history: [...session.history, { group: created.id, images }],
  }
}

/**
 * « Nouvelle recette » : la recette en cours part à la lecture. Si sa dernière page est encore devant la caméra (elle
 * finit une recette et commence la suivante), la nouvelle recette commence par cette même page.
 */
export function startNewRecipe(session: ScanSession, now: number, newId: () => string, keepLastPage: boolean): ScanSession {
  const current = openGroup(session)
  if (!current) return session
  const groups = session.groups.map((g) => (g.id === current.id ? { ...g, closed: true, readyAt: Math.min(g.readyAt, now) } : g))
  const last = current.images.at(-1)
  return { ...session, groups: keepLastPage && last ? [...groups, group(newId(), [last], false, now)] : groups }
}

/** Fin du scan : la recette en cours part (une recette qui ne contient que la page reprise est abandonnée). */
export function closeAll(session: ScanSession, now: number): ScanSession {
  const history = new Set(session.history.map((h) => h.group))
  const groups = session.groups
    .filter((g) => g.closed || history.has(g.id))
    .map((g) => (g.closed ? g : { ...g, closed: true, readyAt: Math.min(g.readyAt, now) }))
  return { ...session, groups }
}

/**
 * Annule la dernière photo, si sa recette n'est pas encore partie à la lecture. Renvoie les images à supprimer (celles
 * qu'aucun groupe n'utilise plus), ou `null` si c'est trop tard.
 */
export function undoLast(session: ScanSession): { session: ScanSession; removed: string[] } | null {
  const last = session.history.at(-1)
  if (!last) return null
  const target = session.groups.find((g) => g.id === last.group)
  if (!target || target.status !== 'pending') return null
  const history = session.history.slice(0, -1)
  const images = target.images.slice(0, target.images.length - last.images.length)
  // Recette qui ne garde que la page reprise de la précédente : supprimée aussi.
  const kept = history.some((h) => h.group === target.id) && images.length > 0
  const groups = session.groups.flatMap((g) => (g.id !== target.id ? [g] : kept ? [{ ...g, images }] : []))
  const used = new Set(groups.flatMap((g) => g.images))
  return { session: { ...session, groups, history }, removed: last.images.filter((id) => !used.has(id)) }
}

/** Groupes à envoyer maintenant (fermés, en attente, délai passé), dans l'ordre, `room` au plus. */
export function readyToRead(session: ScanSession, now: number, room: number): ScanGroup[] {
  if (room <= 0) return []
  return session.groups.filter((g) => g.closed && g.status === 'pending' && g.readyAt <= now).slice(0, room)
}

/** Prochain instant où un groupe en attente pourra partir (pour relancer la file), ou null. */
export function nextReadyAt(session: ScanSession, now: number): number | null {
  const later = session.groups.filter((g) => g.closed && g.status === 'pending' && g.readyAt > now).map((g) => g.readyAt)
  return later.length > 0 ? Math.min(...later) : null
}

export const updateGroup = (session: ScanSession, id: string, patch: Partial<ScanGroup>): ScanSession => ({
  ...session,
  groups: session.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
})

/** Session rouverte : les lectures interrompues (appli fermée) repartent. */
export function resumeSession(session: ScanSession): ScanSession {
  return { ...session, groups: session.groups.map((g) => (g.status === 'reading' ? { ...g, status: 'pending', readyAt: 0 } : g)) }
}

/** Groupes en erreur remis en attente (ce qui avait abouti est gardé, voir `mergeRetry`). */
export function retryErrors(session: ScanSession): ScanSession {
  return { ...session, groups: session.groups.map((g) => (needsRetry(g) ? { ...g, status: 'pending', message: undefined, readyAt: 0 } : g)) }
}

/** « C'est une recette » : un groupe jugé sans recette repart à la lecture, en insistant (une seule fois). */
export function insistOnRecipe(session: ScanSession, id: string): ScanSession {
  return {
    ...session,
    groups: session.groups.map((g) => (g.id === id && g.status === 'skipped' && !g.insist ? { ...g, status: 'pending', message: undefined, readyAt: 0, insist: true } : g)),
  }
}

/** Le groupe peut être relu en insistant : jugé sans recette, pas encore relu. */
export const canInsist = (group: ScanGroup): boolean => group.status === 'skipped' && !group.insist

export interface ScanCounts extends ReturnType<typeof tally> {
  pages: number
  /** Recettes prises, pas encore lues (en attente ou en lecture). */
  waiting: number
  reading: number
}

export function scanCounts(session: ScanSession): ScanCounts {
  const sent = session.groups.filter((g) => g.closed)
  return {
    ...tally(sent),
    pages: pageCount(session),
    waiting: sent.filter((g) => g.status === 'pending' || g.status === 'reading').length,
    reading: sent.filter((g) => g.status === 'reading').length,
  }
}

/** Toutes les recettes prises ont été lues. */
export const allRead = (session: ScanSession): boolean => session.groups.every((g) => g.closed && g.status !== 'pending' && g.status !== 'reading')
