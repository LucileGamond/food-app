// Regroupement des modifications de listes de courses et texte des notifications.

export type ShoppingEventKind = 'ADDED' | 'CHECKED' | 'UNCHECKED' | 'UPDATED' | 'REMOVED'

export interface ShoppingEvent {
  id: number
  list_id: string
  list_name: string
  actor_id: string
  actor_name: string
  kind: ShoppingEventKind
  item_name: string
  created_at: string
}

export interface EventGroup {
  list_id: string
  list_name: string
  actor_id: string
  actor_name: string
  events: ShoppingEvent[]
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

/** Délai sans nouvelle modification avant d'envoyer la notification groupée. */
export const QUIET_MS = 2 * 60 * 1000

/** Groupes (liste × auteur) dont la dernière modification date d'au moins `quietMs`. */
export function readyGroups(events: readonly ShoppingEvent[], now: number, quietMs = QUIET_MS): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const event of events) {
    const key = `${event.list_id}|${event.actor_id}`
    const group = groups.get(key) ?? { list_id: event.list_id, list_name: event.list_name, actor_id: event.actor_id, actor_name: event.actor_name, events: [] }
    group.events.push(event)
    groups.set(key, group)
  }
  return [...groups.values()].filter((g) => {
    const last = Math.max(...g.events.map((e) => Date.parse(e.created_at)))
    return now - last >= quietMs
  })
}

const VERBS: Record<ShoppingEventKind, string> = {
  ADDED: 'ajouté',
  CHECKED: 'coché',
  UNCHECKED: 'décoché',
  UPDATED: 'modifié',
  REMOVED: 'retiré',
}

const ORDER: ShoppingEventKind[] = ['ADDED', 'CHECKED', 'UNCHECKED', 'UPDATED', 'REMOVED']

/** « a, b et c » */
export function joinFr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`
}

/** « Eric a ajouté farine et lait, et coché 4 articles » → titre = nom de la liste. */
export function buildShoppingMessage(group: EventGroup): PushPayload {
  const parts = ORDER.flatMap((kind) => {
    const names = [...new Set(group.events.filter((e) => e.kind === kind).map((e) => e.item_name))]
    if (names.length === 0) return []
    const what = names.length <= 3 ? joinFr(names) : `${names.length} articles`
    return [`${VERBS[kind]} ${what}`]
  })
  return {
    title: group.list_name,
    body: `${group.actor_name} a ${joinFr(parts)}`,
    url: `/courses/${group.list_id}`,
    tag: `shopping-${group.list_id}`,
  }
}
