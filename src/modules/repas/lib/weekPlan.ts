// Brouillon de la semaine : plats « À planifier » placés sur les créneaux où l'on mange à la maison, avec qui
// cuisine. L'IA propose (Edge Function plan-week) ; ce module prépare sa demande, relit sa réponse et signale ce qui
// ne respecte pas les règles, y compris après les modifications faites à la main.

import { addDays, formatDay, type IsoDate } from '@/lib/dates'
import { parseSlotKey, slotKey, type MealSlot, type Profile, type SlotRef } from '@/lib/meals'
import { foldText } from '@/lib/text'
import type { SlotPresence } from './presence'

/** Au-delà, un plat est « long » : il faut une personne qui a le temps de cuisiner. */
export const LONG_MINUTES = 45
/** Écart maximal entre deux repas d'un même plat (restes). */
export const MAX_LEFTOVER_DAYS = 2
/** Un plat aux ingrédients fragiles se place dans les 3 premiers jours. */
export const FRAGILE_DAYS = 3

/** Ingrédients qui se gardent peu (recherchés sans accents dans les ingrédients et le titre). */
const FRAGILE_WORDS = [
  'poisson', 'saumon', 'cabillaud', 'colin', 'merlu', 'lieu', 'truite', 'dorade', 'bar ', 'thon frais', 'sardine', 'maquereau',
  'crevette', 'moule', 'saint-jacques', 'calamar', 'fruits de mer', 'hache', 'tartare', 'carpaccio', 'abats', 'foie',
  'salade', 'roquette', 'mache', 'epinards frais', 'pousses', 'basilic', 'coriandre', 'persil', 'ciboulette', 'menthe',
  'aneth', 'champignon', 'fraise', 'framboise', 'myrtille', 'avocat', 'creme fraiche', 'mozzarella', 'burrata',
]

export interface Dish {
  /** Élément de la liste « À planifier ». */
  id: string
  title: string
  recipeId: string | null
  /** Préparation, repos et cuisson ; null si inconnu. */
  minutes: number | null
  servings: number | null
  ingredients: string[]
}

export interface PlanSlot extends SlotPresence {
  /** Titres des repas déjà prévus : le créneau n'est pas proposé à l'IA. */
  taken: string[]
}

export interface DraftEntry extends SlotRef {
  dishId: string
  cookId: string | null
  why: string
}

export interface PlanWeekRequest {
  start: IsoDate
  people: { id: string; name: string }[]
  slots: { key: string; day: string; slot: MealSlot; people: string[]; freeCooks: string[] }[]
  dishes: { id: string; title: string; minutes: number | null; servings: number | null; ingredients: string[]; long: boolean; fragile: boolean }[]
}

export const isLong = (dish: Pick<Dish, 'minutes'>) => dish.minutes !== null && dish.minutes > LONG_MINUTES

export function isFragile(dish: Pick<Dish, 'title' | 'ingredients'>): boolean {
  const text = ` ${foldText([dish.title, ...dish.ingredients].join(' | '))} `
  return FRAGILE_WORDS.some((word) => text.includes(word))
}

/** Créneaux à remplir : quelqu'un mange à la maison et rien n'est encore prévu. */
export const openSlots = (slots: readonly PlanSlot[]) => slots.filter((s) => s.people.length > 0 && s.taken.length === 0)

const sameSlot = (a: SlotRef, b: SlotRef) => a.date === b.date && a.slot === b.slot
const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export function buildPlanRequest(start: IsoDate, slots: readonly PlanSlot[], dishes: readonly Dish[], profiles: readonly Profile[]): PlanWeekRequest {
  return {
    start,
    people: profiles.map((p) => ({ id: p.id, name: p.display_name })),
    slots: openSlots(slots).map((s) => ({ key: slotKey(s), day: formatDay(s.date), slot: s.slot, people: s.people, freeCooks: s.freeCooks })),
    dishes: dishes.map((d) => ({
      id: d.id,
      title: d.title,
      minutes: d.minutes,
      servings: d.servings,
      ingredients: d.ingredients.slice(0, 15),
      long: isLong(d),
      fragile: isFragile(d),
    })),
  }
}

/**
 * Réponse de la fonction relue : créneau ouvert et plat connus, un plat par créneau ; un cuisinier absent ou manquant est
 * remplacé par la première personne qui a le temps (ou à défaut la première à la maison) ; null (restes) est gardé.
 */
export function parsePlan(data: unknown, slots: readonly PlanSlot[], dishes: readonly Dish[]): DraftEntry[] {
  const meals = (data as { meals?: unknown } | null)?.meals
  if (!Array.isArray(meals)) return []
  const open = openSlots(slots)
  const entries: DraftEntry[] = []
  for (const value of meals) {
    const raw = (value ?? {}) as Record<string, unknown>
    const ref = typeof raw.slot === 'string' ? parseSlotKey(raw.slot) : null
    const target = ref && open.find((s) => sameSlot(s, ref))
    const dish = dishes.find((d) => d.id === raw.dishId)
    if (!target || !dish || entries.some((e) => sameSlot(e, target))) continue
    // null : restes, personne ne cuisine ; un cuisinier absent est remplacé.
    const cookId =
      raw.cookId === null ? null : typeof raw.cookId === 'string' && target.people.includes(raw.cookId) ? raw.cookId : (target.freeCooks[0] ?? target.people[0] ?? null)
    entries.push({ date: target.date, slot: target.slot, dishId: dish.id, cookId, why: typeof raw.why === 'string' ? raw.why.slice(0, 160) : '' })
  }
  return entries
}

const order = (a: SlotRef, b: SlotRef) => a.date.localeCompare(b.date) || (a.slot === b.slot ? 0 : a.slot === 'LUNCH' ? -1 : 1)

/** Alertes par créneau (clé `date|slot`). */
export function draftWarnings(entries: readonly DraftEntry[], slots: readonly PlanSlot[], dishes: readonly Dish[], profiles: readonly Profile[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const warn = (ref: SlotRef, message: string) => {
    const key = slotKey(ref)
    result.set(key, [...(result.get(key) ?? []), message])
  }
  const name = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Quelqu’un'
  const start = slots[0]?.date
  const slotOf = (ref: SlotRef) => slots.find((s) => sameSlot(s, ref))

  for (const dish of dishes) {
    const placed = entries.filter((e) => e.dishId === dish.id).sort(order)
    const [first] = placed
    if (!first) continue
    const firstSlot = slotOf(first)
    // Le premier repas se cuisine : il faut quelqu'un de présent, et du temps pour un plat long.
    if (first.cookId && firstSlot && !firstSlot.people.includes(first.cookId)) warn(first, `${name(first.cookId)} n’est pas là`)
    else if (isLong(dish) && firstSlot) {
      if (firstSlot.freeCooks.length === 0) warn(first, 'Plat long : personne n’a le temps de cuisiner')
      else if (first.cookId && !firstSlot.freeCooks.includes(first.cookId)) warn(first, `Plat long : ${name(first.cookId)} n’a pas le temps de cuisiner`)
    }
    if (start && isFragile(dish) && daysBetween(start, first.date) >= FRAGILE_DAYS) warn(first, 'Ingrédients fragiles : plutôt en début de semaine')

    let eaters = 0
    placed.forEach((entry, i) => {
      eaters += slotOf(entry)?.people.length ?? 0
      const previous = placed[i - 1]
      if (!previous) return
      if (previous.date === entry.date) {
        warn(previous, 'Même plat midi et soir')
        warn(entry, 'Même plat midi et soir')
      } else if (daysBetween(first.date, entry.date) > MAX_LEFTOVER_DAYS) {
        warn(entry, `Restes ${daysBetween(first.date, entry.date)} jours après : ça risque de s’abîmer`)
      }
      if (dish.servings !== null && eaters > dish.servings) warn(entry, `Pas assez de portions (${dish.servings} pour ${eaters})`)
    })
  }
  return result
}

/** Place, modifie (`patch`) ou retire (`null`) le plat d'un créneau. Sans plat, un créneau vide reste vide. */
export function setEntry(entries: readonly DraftEntry[], ref: SlotRef, patch: Partial<Pick<DraftEntry, 'dishId' | 'cookId'>> | null): DraftEntry[] {
  const current = entries.find((e) => sameSlot(e, ref))
  if (patch === null) return entries.filter((e) => e !== current)
  if (current) return entries.map((e) => (e === current ? { ...e, ...patch } : e))
  if (!patch.dishId) return [...entries]
  return [...entries, { date: ref.date, slot: ref.slot, dishId: patch.dishId, cookId: patch.cookId ?? null, why: '' }]
}

/** Repas à créer (RPC plan_week). */
export function toPlanWeekMeals(entries: readonly DraftEntry[], slots: readonly PlanSlot[]) {
  return entries.map((e) => ({
    item_id: e.dishId,
    meal_date: e.date,
    slot: e.slot,
    people: slots.find((s) => sameSlot(s, e))?.people ?? [],
    cook_id: e.cookId,
  }))
}

/** Les 7 jours à partir de `start`. */
export const weekDays = (start: IsoDate): IsoDate[] => Array.from({ length: 7 }, (_, i) => addDays(start, i))
