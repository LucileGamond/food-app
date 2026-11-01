import { isValidUrl } from './meals'
import { siteName } from './recipes'

/** Liste d'attente : « À planifier » (planning) ou « De côté » (recettes à enregistrer plus tard). */
export type InboxList = 'plan' | 'aside'

/** Élément d'une liste d'attente : lien, idée, recette enregistrée, ou photos (pages de livre, captures). */
export interface InboxItem {
  id: string
  title: string
  url: string | null
  recipe_id: string | null
  created_at: string
  /** Absents avec une base pas encore à jour : « À planifier », sans photo. */
  list?: InboxList | string
  photos?: string[]
}

/** Photos au plus pour un élément (pages d'une recette, captures d'une légende). */
export const MAX_INBOX_PHOTOS = 3

export type InboxKind = 'recipe' | 'link' | 'photos' | 'idea'

export function inboxKind(item: Pick<InboxItem, 'url' | 'recipe_id' | 'photos'>): InboxKind {
  if (item.recipe_id) return 'recipe'
  if (item.url) return 'link'
  return item.photos?.length ? 'photos' : 'idea'
}

/** Sous-titre affiché sous le titre : nom du site, « Recette enregistrée », nombre de photos ou « Idée ». */
export function inboxSubtitle(item: Pick<InboxItem, 'url' | 'recipe_id' | 'photos'>): string {
  const kind = inboxKind(item)
  if (kind === 'recipe') return 'Recette enregistrée'
  if (kind === 'link') return siteName(item.url!)
  if (kind === 'photos') return item.photos!.length > 1 ? `${item.photos!.length} photos` : '1 photo'
  return 'Idée'
}

/** Un lien ou des photos : la recette peut être préremplie (analyse) puis enregistrée depuis la liste. */
export const canPrefill = (item: Pick<InboxItem, 'url' | 'recipe_id' | 'photos'>) => ['link', 'photos'].includes(inboxKind(item))

/** Titre provisoire d'un élément photos : « Photos du 1 nov. », à renommer si besoin. */
export function photosTitle(date = new Date()): string {
  return `Photos du ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
}

/** Premier lien http(s) d'un texte (le partage Android met souvent le lien dans le texte). */
export function extractUrl(text: string | null | undefined): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text ?? '')
  if (!match) return null
  const url = match[0].replace(/[),.;!?»]+$/, '')
  return isValidUrl(url) ? url : null
}

export type InboxInput = { kind: 'link'; url: string; title: string } | { kind: 'idea'; title: string }

/**
 * Saisie du panneau (ou contenu partagé) → élément à ajouter :
 * un lien (titre provisoire : le nom du site), sinon une idée en texte libre.
 */
export function parseInboxInput(text: string, sharedTitle?: string | null): InboxInput | null {
  const url = extractUrl(text)
  const title = sharedTitle?.replace(/\s+/g, ' ').trim()
  if (url) return { kind: 'link', url, title: (title || siteName(url)).slice(0, 200) }
  const idea = text.replace(/\s+/g, ' ').trim()
  if (idea) return { kind: 'idea', title: idea.slice(0, 200) }
  return title ? { kind: 'idea', title: title.slice(0, 200) } : null
}
