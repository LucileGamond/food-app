import type { IsoDate } from './dates'

export type MealSlot = 'LUNCH' | 'DINNER'
export const SLOTS: readonly MealSlot[] = ['LUNCH', 'DINNER']

export interface Profile {
  id: string
  display_name: string
}

export interface RecipeSummary {
  id: string
  is_saved: boolean
  title: string
  notes: string | null
  url: string | null
  tags: string[]
  /** Livre (absent dans les recettes des repas du planning). */
  source?: string | null
}

export interface Meal {
  id: string
  meal_date: IsoDate
  slot: MealSlot
  people: string[]
  recipe: RecipeSummary
}

/** Source de la recette d'un repas : une recette sauvegardée, ou une recette ponctuelle saisie à la volée. */
export type MealRecipeSource =
  | { kind: 'saved'; recipeId: string }
  | { kind: 'adhoc'; title: string; notes: string; url: string }

export function slotLabel(slot: MealSlot): string {
  return slot === 'LUNCH' ? 'Midi' : 'Soir'
}

/** « Lucile », « Lucile et Eric », « Anne, Eric et Lucile » (ordre alphabétique). */
export function peopleLabel(people: readonly string[], profiles: readonly Profile[]): string {
  const names = people
    .map((id) => profiles.find((p) => p.id === id)?.display_name ?? 'Inconnu')
    .sort((a, b) => a.localeCompare(b, 'fr'))
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

export type TextPart = { type: 'text'; value: string } | { type: 'link'; value: string }

const URL_PATTERN = /https?:\/\/[^\s]+/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/

/** Découpe un texte en morceaux texte / lien pour rendre les URL cliquables. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0]
    const url = raw.replace(TRAILING_PUNCTUATION, '')
    const start = match.index
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) })
    parts.push({ type: 'link', value: url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

export function isValidUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export interface MealFormValues {
  people: string[]
  mode: 'saved' | 'adhoc'
  recipeId: string | null
  title: string
  notes: string
  url: string
}

export type MealFormErrors = Partial<Record<'people' | 'recipe' | 'title' | 'url', string>>

export function validateMealForm(values: MealFormValues): MealFormErrors {
  const errors: MealFormErrors = {}
  if (values.people.length === 0) errors.people = 'Choisis au moins une personne'
  if (values.mode === 'saved') {
    if (!values.recipeId) errors.recipe = 'Choisis une recette'
  } else {
    if (values.title.trim() === '') errors.title = 'Le titre est obligatoire'
    const url = values.url.trim()
    if (url !== '' && !isValidUrl(url)) errors.url = 'Lien invalide (http:// ou https://)'
  }
  return errors
}

export function toRecipeSource(values: MealFormValues): MealRecipeSource {
  if (values.mode === 'saved') {
    if (!values.recipeId) throw new Error('Recette manquante')
    return { kind: 'saved', recipeId: values.recipeId }
  }
  return { kind: 'adhoc', title: values.title.trim(), notes: values.notes.trim(), url: values.url.trim() }
}

export interface SlotRef {
  date: IsoDate
  slot: MealSlot
}

export function slotKey({ date, slot }: SlotRef): string {
  return `${date}|${slot}`
}

export function parseSlotKey(key: string): SlotRef | null {
  const [date, slot, ...rest] = key.split('|')
  if (rest.length > 0 || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (slot !== 'LUNCH' && slot !== 'DINNER') return null
  return { date, slot }
}

export const DROP_PREFIX = 'slot:'

/** Créneau visé par un glisser-déposer (identifiant de zone `slot:AAAA-MM-JJ|SLOT`), ou null. */
export function dropTarget(overId: unknown): SlotRef | null {
  if (typeof overId !== 'string' || !overId.startsWith(DROP_PREFIX)) return null
  return parseSlotKey(overId.slice(DROP_PREFIX.length))
}

/** Regroupe les repas par créneau (clé `date|slot`), en conservant l'ordre reçu. */
export function groupMealsBySlot(meals: readonly Meal[]): Map<string, Meal[]> {
  const groups = new Map<string, Meal[]>()
  for (const meal of meals) {
    const key = slotKey({ date: meal.meal_date, slot: meal.slot })
    const list = groups.get(key)
    if (list) list.push(meal)
    else groups.set(key, [meal])
  }
  return groups
}

export function countMealsOnDay(meals: readonly Meal[], date: IsoDate): number {
  return meals.filter((m) => m.meal_date === date).length
}

export function mealCountLabel(count: number): string {
  if (count === 0) return 'Aucun repas'
  return `${count} repas`
}

/** Un déplacement n'a d'effet que si la cible diffère du créneau d'origine. */
export function isMoveNeeded(meal: Pick<Meal, 'meal_date' | 'slot'>, target: SlotRef): boolean {
  return meal.meal_date !== target.date || meal.slot !== target.slot
}
