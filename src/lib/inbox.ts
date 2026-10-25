import { isValidUrl } from './meals'
import { siteName } from './recipes'

/** Élément de la liste « À planifier ». */
export interface InboxItem {
  id: string
  title: string
  url: string | null
  recipe_id: string | null
  created_at: string
}

export type InboxKind = 'recipe' | 'link' | 'idea'

export function inboxKind(item: Pick<InboxItem, 'url' | 'recipe_id'>): InboxKind {
  if (item.recipe_id) return 'recipe'
  return item.url ? 'link' : 'idea'
}

/** Sous-titre affiché sous le titre : nom du site, « Recette enregistrée » ou « Idée ». */
export function inboxSubtitle(item: Pick<InboxItem, 'url' | 'recipe_id'>): string {
  const kind = inboxKind(item)
  if (kind === 'recipe') return 'Recette enregistrée'
  if (kind === 'link') return siteName(item.url!)
  return 'Idée'
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
