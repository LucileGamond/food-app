// Brouillon de la semaine : plats « À planifier » placés sur les créneaux où l'on mange à la maison, avec qui
// cuisine. L'IA propose (Edge Function plan-week) ; ce module prépare sa demande, relit sa réponse et signale ce qui
// ne respecte pas les règles, y compris après les modifications faites à la main.

import { addDays, formatDay, type IsoDate } from '@/lib/dates'
import { parseSlotKey, slotKey, slotLabel, type MealSlot, type Profile, type SlotRef } from '@/lib/meals'
import { foldText } from '@/lib/text'
import type { SlotPresence } from './presence'

/** Au-delà, un plat est « long » : il faut une personne qui a le temps de cuisiner. */
export const LONG_MINUTES = 45
/** Écart maximal entre deux repas d'un même plat (restes). */
export const MAX_LEFTOVER_DAYS = 2
/** Un plat aux ingrédients fragiles se place dans les 3 premiers jours. */
export const FRAGILE_DAYS = 3
/** Plats envoyés à l'IA au plus (limite de la fonction plan-week). */
export const MAX_PLAN_DISHES = 40

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
  /** Portions fixées sur le plat « À planifier » (priment sur celles de la recette) ; null si non précisé. */
  portions: number | null
  ingredients: string[]
}

/** Portions prévues pour un plat : celles fixées sur le plat, sinon celles de la recette. */
export const dishPortions = (dish: Pick<Dish, 'portions' | 'servings'>) => dish.portions ?? dish.servings

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

/**
 * Ce qui a décidé la présence d'un jour, pour la pastille et le repli :
 *   - `manual` : la présence a été corrigée à la main ;
 *   - `agenda` : un rendez-vous a retiré quelqu'un ou l'a occupé avant le repas ;
 *   - `rule` : seule la règle « midi en semaine au travail » s'applique ;
 *   - `all` : tout le monde est là aux deux repas.
 * Un jour `manual` ou `agenda` s'ouvre tout seul : c'est là qu'il y a quelque chose à regarder.
 */
export type DayKind = 'manual' | 'agenda' | 'rule' | 'all'

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  manual: 'Modifié',
  agenda: 'Agenda',
  rule: 'Habitude',
  all: 'Tout le monde',
}

export function dayKind(slots: readonly PlanSlot[], corrected: boolean, profiles: readonly Profile[]): DayKind {
  const live = slots.filter((s) => !s.past && s.taken.length === 0)
  if (corrected) return 'manual'
  if (live.some((s) => s.fromAgenda)) return 'agenda'
  if (live.some((s) => Object.keys(s.notes).length > 0 || s.people.length < profiles.length)) return 'rule'
  return 'all'
}

export const dayNeedsAttention = (kind: DayKind) => kind === 'manual' || kind === 'agenda'

/** « Midi et soir : Eric et Lucile », « Midi : Eric · Soir : personne », « Repas passés ». */
export function daySummary(slots: readonly PlanSlot[], profiles: readonly Profile[]): string {
  const name = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Quelqu’un'
  const describe = (slot: PlanSlot): string => {
    if (slot.past) return 'repas passé'
    if (slot.taken.length > 0) return `déjà prévu (${slot.taken.join(', ')})`
    if (slot.people.length === 0) return 'personne'
    return slot.people.map(name).join(' et ')
  }
  const parts = slots.map((s) => [slotLabel(s.slot), describe(s)] as const)
  if (parts.length === 0) return ''
  const [first, ...rest] = parts
  if (rest.length > 0 && rest.every((p) => p[1] === first![1])) {
    // « Midi et soir : … » : seul le premier créneau garde sa majuscule.
    return `${[first![0], ...rest.map((p) => p[0].toLowerCase())].join(' et ')} : ${first![1]}`
  }
  return parts.map(([label, who]) => `${label} : ${who}`).join(' · ')
}

/** Créneaux à remplir : pas encore passés, quelqu'un mange à la maison et rien n'est encore prévu. */
export const openSlots = (slots: readonly PlanSlot[]) => slots.filter((s) => !s.past && s.people.length > 0 && s.taken.length === 0)

const sameSlot = (a: SlotRef, b: SlotRef) => a.date === b.date && a.slot === b.slot
const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export function buildPlanRequest(start: IsoDate, slots: readonly PlanSlot[], dishes: readonly Dish[], profiles: readonly Profile[]): PlanWeekRequest {
  return {
    start,
    people: profiles.map((p) => ({ id: p.id, name: p.display_name })),
    slots: openSlots(slots).map((s) => ({ key: slotKey(s), day: formatDay(s.date), slot: s.slot, people: s.people, freeCooks: s.freeCooks })),
    dishes: dishes.slice(0, MAX_PLAN_DISHES).map((d) => ({
      id: d.id,
      title: d.title,
      minutes: d.minutes,
      servings: dishPortions(d),
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

/** Créneaux où ce plat est placé, du premier au dernier. */
export const dishEntries = (entries: readonly DraftEntry[], dishId: string): DraftEntry[] => entries.filter((e) => e.dishId === dishId).sort(order)

/** Repas de ce plat qui précède le créneau donné : le créneau sert alors des restes. */
export const earlierEntry = (entries: readonly DraftEntry[], ref: SlotRef, dishId: string): DraftEntry | undefined =>
  dishEntries(entries, dishId).find((e) => !sameSlot(e, ref) && order(e, ref) < 0)

/** Couverts de tous les repas d'un plat : ce qu'il faut cuisiner en une fois, restes compris. */
export const plannedEaters = (entries: readonly DraftEntry[], slots: readonly PlanSlot[], dishId: string): number =>
  dishEntries(entries, dishId).reduce((sum, e) => sum + (slots.find((s) => sameSlot(s, e))?.people.length ?? 0), 0)

/** Portions au plus pour un plat (limite de la base). */
const MAX_PORTIONS = 99

/** Portions proposées pour un plat placé : celles fixées, sinon les couverts de tous ses repas. */
export function suggestedPortions(entries: readonly DraftEntry[], slots: readonly PlanSlot[], dish: Pick<Dish, 'id' | 'portions'>): number | null {
  if (dish.portions !== null) return dish.portions
  const eaters = plannedEaters(entries, slots, dish.id)
  return eaters > 0 ? Math.min(eaters, MAX_PORTIONS) : null
}

/**
 * Cuisiniers d'un plat remis d'équerre : son premier repas se cuisine (quelqu'un qui a le temps, sinon quelqu'un de
 * présent), les suivants sont des restes. Un choix fait à la main sur le premier repas est gardé.
 */
function withLeftoverCooks(entries: readonly DraftEntry[], slots: readonly PlanSlot[], dishId: string): DraftEntry[] {
  const [first] = dishEntries(entries, dishId)
  return entries.map((e) => {
    if (e.dishId !== dishId) return e
    if (e !== first) return e.cookId === null ? e : { ...e, cookId: null }
    if (e.cookId !== null) return e
    const slot = slots.find((s) => sameSlot(s, e))
    return { ...e, cookId: slot?.freeCooks[0] ?? slot?.people[0] ?? null }
  })
}

/**
 * Pose un plat sur un créneau (ou le retire avec `null`) : le même plat peut revenir sur plusieurs jours, et seul son
 * premier repas se cuisine. Le plat qui quittait le créneau est remis d'équerre lui aussi.
 */
export function placeDish(entries: readonly DraftEntry[], slots: readonly PlanSlot[], ref: SlotRef, dishId: string | null): DraftEntry[] {
  const previous = entries.find((e) => sameSlot(e, ref))?.dishId ?? null
  let next = dishId === null ? setEntry(entries, ref, null) : setEntry(entries, ref, { dishId, cookId: null })
  for (const id of new Set([previous, dishId].filter((v): v is string => v !== null))) next = withLeftoverCooks(next, slots, id)
  return next
}

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
    if (first.cookId === null) warn(first, 'Personne ne cuisine : c’est le premier repas de ce plat')
    else if (firstSlot && !firstSlot.people.includes(first.cookId)) warn(first, `${name(first.cookId)} n’est pas là`)
    else if (isLong(dish) && firstSlot) {
      if (firstSlot.freeCooks.length === 0) warn(first, 'Plat long : personne n’a le temps de cuisiner')
      else if (!firstSlot.freeCooks.includes(first.cookId)) warn(first, `Plat long : ${name(first.cookId)} n’a pas le temps de cuisiner`)
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
      // Seules des portions fixées à la main peuvent manquer : sinon le plat est cuisiné pour tous ses repas.
      if (dish.portions !== null && eaters > dish.portions) warn(entry, `Pas assez de portions (${dish.portions} pour ${eaters})`)
    })
  }
  return result
}

/**
 * Brouillon ramené aux créneaux encore ouverts : les jours décochés ou les créneaux où plus personne ne mange à la
 * maison perdent leur plat, et le plat touché retrouve son cuisinier s'il a perdu son premier repas.
 */
export function pruneEntries(entries: readonly DraftEntry[], slots: readonly PlanSlot[]): DraftEntry[] {
  const open = openSlots(slots)
  const kept = entries.filter((e) => open.some((s) => sameSlot(s, e)))
  if (kept.length === entries.length) return [...entries]
  let result = kept
  for (const id of new Set(entries.filter((e) => !kept.includes(e)).map((e) => e.dishId))) result = withLeftoverCooks(result, slots, id)
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

/**
 * Repas à créer (RPC plan_week). Un plat est cuisiné en une fois à son premier repas, pour les portions fixées ou, à
 * défaut, pour les couverts de tous ses repas ; ses repas suivants sont des restes (0 : rien à acheter).
 */
export function toPlanWeekMeals(entries: readonly DraftEntry[], slots: readonly PlanSlot[], dishes: readonly Dish[]) {
  return entries.map((e) => {
    const dish = dishes.find((d) => d.id === e.dishId)
    const first = dishEntries(entries, e.dishId)[0] === e
    return {
      item_id: e.dishId,
      meal_date: e.date,
      slot: e.slot,
      people: slots.find((s) => sameSlot(s, e))?.people ?? [],
      cook_id: e.cookId,
      portions: first ? (dish ? suggestedPortions(entries, slots, dish) : null) : 0,
    }
  })
}

/** Les 7 jours à partir de `start`. */
export const weekDays = (start: IsoDate): IsoDate[] => Array.from({ length: 7 }, (_, i) => addDays(start, i))

/** Jours proposés à cocher, à partir d'aujourd'hui. */
export const PLAN_HORIZON_DAYS = 28
/** Du premier au dernier jour coché, au plus (limite de la fonction plan-week : 2 créneaux par jour). */
export const MAX_PLAN_SPAN_DAYS = 14

export const planHorizon = (today: IsoDate): IsoDate[] => Array.from({ length: PLAN_HORIZON_DAYS }, (_, i) => addDays(today, i))

export const defaultPlanDays = (today: IsoDate): IsoDate[] => weekDays(today)

/** Le jour peut être coché : la période (du premier au dernier jour coché) reste dans les 14 jours. */
export function canChooseDay(chosen: readonly IsoDate[], day: IsoDate): boolean {
  if (chosen.length === 0) return true
  const all = [...chosen, day].sort()
  return daysBetween(all[0]!, all.at(-1)!) < MAX_PLAN_SPAN_DAYS
}

/** Coche ou décoche un jour (sans dépasser 14 jours), dans l'ordre. */
export function toggleDay(chosen: readonly IsoDate[], day: IsoDate): IsoDate[] {
  if (chosen.includes(day)) return chosen.filter((d) => d !== day)
  return canChooseDay(chosen, day) ? [...chosen, day].sort() : [...chosen]
}
