// « Ce que l'autre a fait » : derniers gestes des autres (arrosages, repas planifiés, recettes, courses), regroupés
// en phrases courtes (« Eric a arrosé Ficus et Monstera »), avec un lien vers la page concernée.

import { addDays, parseIsoDate, todayIso, type IsoDate } from './dates'
import { slotLabel, type MealSlot } from './meals'
import type { PageKey } from './settings'

export type ActivityKind = 'watered' | 'plant_added' | 'planned' | 'recipe_added' | 'shopping_added' | 'shopping_checked'

/** Un geste, tel que renvoyé par recent_activity. */
export interface ActivityEvent {
  kind: ActivityKind
  actorId: string
  actorName: string
  at: string
  title: string
  /** Repas : « 2026-11-10 LUNCH » ; courses : nom de la liste. */
  detail: string | null
  /** Plante, recette ou liste concernée. */
  targetId: string | null
}

/** Gestes regroupés : une ligne du fil. */
export interface ActivityLine {
  key: string
  actorName: string
  /** Plus récent geste du groupe. */
  at: string
  /** « a arrosé Ficus et Monstera ». */
  text: string
  to: string
}

/** Période couverte par le fil. */
export const ACTIVITY_DAYS = 3

const PAGE_OF_KIND: Record<ActivityKind, PageKey> = {
  watered: 'plantes',
  plant_added: 'plantes',
  planned: 'planning',
  recipe_added: 'recettes',
  shopping_added: 'courses',
  shopping_checked: 'courses',
}

/** « Ficus », « Ficus et Monstera », « Ficus, Monstera et 2 autres ». */
export function listNames(names: string[], max = 2): string {
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : (names[0] ?? '')
  const others = names.length - max
  return `${names.slice(0, max).join(', ')} et ${others} autre${others > 1 ? 's' : ''}`
}

/** Jour (heure locale) d'un instant : les gestes se regroupent par jour. */
function dayOf(at: string): IsoDate {
  return todayIso(new Date(at))
}

/** « 2026-11-10 LUNCH » → « demain midi », « mardi soir ». */
export function describeMealSlot(detail: string | null, today: IsoDate): string | null {
  const [date, slot] = (detail ?? '').split(' ') as [IsoDate, MealSlot | undefined]
  if (!date || (slot !== 'LUNCH' && slot !== 'DINNER')) return null
  let day: string
  try {
    day =
      date === today
        ? 'aujourd’hui'
        : date === addDays(today, 1)
          ? 'demain'
          : date === addDays(today, -1)
            ? 'hier'
            : new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric' }).format(parseIsoDate(date))
  } catch {
    return null
  }
  return `${day} ${slotLabel(slot).toLowerCase()}`
}

function describe(kind: ActivityKind, events: ActivityEvent[], today: IsoDate): { text: string; to: string } {
  const first = events[0]!
  const titles = [...new Set(events.map((e) => e.title))]
  const single = titles.length === 1
  switch (kind) {
    case 'watered':
      return { text: `a arrosé ${listNames(titles)}`, to: single && first.targetId ? `/plantes/${first.targetId}` : '/plantes' }
    case 'plant_added':
      return { text: single ? `a ajouté la plante ${titles[0]}` : `a ajouté ${titles.length} plantes`, to: single && first.targetId ? `/plantes/${first.targetId}` : '/plantes' }
    case 'planned': {
      const when = describeMealSlot(first.detail, today)
      return { text: events.length === 1 ? `a planifié ${first.title}${when ? ` (${when})` : ''}` : `a planifié ${events.length} repas`, to: '/planning' }
    }
    case 'recipe_added':
      return { text: single ? `a ajouté la recette ${titles[0]}` : `a ajouté ${titles.length} recettes`, to: single && first.targetId ? `/recettes/${first.targetId}` : '/recettes' }
    case 'shopping_added':
      return { text: single ? `a ajouté ${titles[0]} à ${first.detail}` : `a ajouté ${titles.length} articles à ${first.detail}`, to: `/courses/${first.targetId}` }
    case 'shopping_checked':
      return { text: single ? `a coché ${titles[0]} dans ${first.detail}` : `a coché ${titles.length} articles dans ${first.detail}`, to: `/courses/${first.targetId}` }
  }
}

/**
 * Lignes du fil, de la plus récente à la plus ancienne : les gestes d'une même personne, de même nature, le même jour
 * (et pour les courses, sur la même liste) font une seule ligne. Seuls les gestes des pages affichées sont gardés.
 */
export function activityLines(events: ActivityEvent[], isEnabled: (page: PageKey) => boolean, today: IsoDate): ActivityLine[] {
  const groups = new Map<string, ActivityEvent[]>()
  const sorted = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  for (const event of sorted) {
    if (!isEnabled(PAGE_OF_KIND[event.kind])) continue
    const list = event.kind.startsWith('shopping') ? event.targetId : ''
    const key = `${event.actorId}|${event.kind}|${list}|${dayOf(event.at)}`
    const group = groups.get(key)
    if (group) group.push(event)
    else groups.set(key, [event])
  }
  return [...groups.entries()].map(([key, group]) => ({ key, actorName: group[0]!.actorName, at: group[0]!.at, ...describe(group[0]!.kind, group, today) }))
}

/** « à l’instant », « il y a 5 min », « il y a 2 h », « hier à 18:30 », « lundi à 09:05 ». */
export function formatAgo(at: string, now: Date): string {
  const date = new Date(at)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 6 * 60) return `il y a ${Math.floor(minutes / 60)} h`
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const day = todayIso(date)
  const today = todayIso(now)
  if (day === today) return `aujourd’hui à ${time}`
  if (day === addDays(today, -1)) return `hier à ${time}`
  return `${new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date)} à ${time}`
}
