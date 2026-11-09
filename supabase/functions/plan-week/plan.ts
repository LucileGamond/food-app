// Planification de la semaine : les plats « À planifier » répartis sur les créneaux où l'on mange à la maison, avec
// qui cuisine. L'application calcule qui est là et qui a le temps (agenda) ; le modèle choisit. Pas de recherche web.
// Indépendant de Deno pour pouvoir être testé.

import { callTool, HttpError, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import { asRecord, str } from '../_shared/sanitize.ts'

export const MAX_SLOTS = 14
export const MAX_DISHES = 40
const MAX_PEOPLE = 6
const TIMEOUT_MS = 60_000

export interface PlanInput {
  start: string
  people: { id: string; name: string }[]
  slots: { key: string; day: string; slot: 'LUNCH' | 'DINNER'; people: string[]; freeCooks: string[] }[]
  dishes: { id: string; title: string; minutes: number | null; servings: number | null; ingredients: string[]; long: boolean; fragile: boolean }[]
}

export interface PlannedMeal {
  slot: string
  dishId: string
  /** null : restes ; absent : cuisinier inconnu, choisi par l'application. */
  cookId?: string | null
  why: string
}

const TOOL_NAME = 'planifier_semaine'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre la répartition des plats sur les créneaux.',
  input_schema: {
    type: 'object',
    properties: {
      repas: {
        type: 'array',
        description: 'Un élément par créneau rempli ; un plat peut revenir sur plusieurs créneaux (restes).',
        items: {
          type: 'object',
          properties: {
            creneau: { type: 'string', description: 'Créneau, recopié exactement (ex. 2026-11-09|DINNER).' },
            plat_id: { type: 'string', description: 'Id du plat, recopié exactement.' },
            cuisinier_id: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Id de la personne qui cuisine ; null pour des restes.' },
            raison: { type: 'string', description: 'Une phrase courte : pourquoi ce plat ici.' },
          },
          required: ['creneau', 'plat_id', 'cuisinier_id', 'raison'],
        },
      },
    },
    required: ['repas'],
  },
}

export const SYSTEM = [
  'Tu organises les repas de la semaine d’un couple français à partir de sa liste de plats à planifier.',
  'Place chaque plat sur un ou plusieurs créneaux de la liste, et choisis qui cuisine parmi les personnes à la maison.',
  'Règles :',
  '- Jamais le même plat midi et soir le même jour.',
  '- Un plat dont les portions dépassent le nombre de mangeurs donne des restes : place-les sur un créneau proche (au plus 2 jours après), pour qu’ils ne s’abîment pas ; les restes n’ont pas de cuisinier (null).',
  '- Ne dépasse pas les portions : additionne les personnes à la maison de chaque créneau où le plat est servi.',
  '- Un plat long se cuisine sur un créneau où quelqu’un a le temps de cuisiner, et c’est cette personne qui cuisine.',
  '- Les plats aux ingrédients fragiles se placent au début du cycle (les premiers jours).',
  '- Répartis la cuisine équitablement entre les personnes qui ont le temps.',
  '- S’il y a moins de plats que de créneaux, laisse des créneaux vides plutôt que de servir trop de restes.',
  'Recopie exactement les identifiants. Appelle directement l’outil, sans texte.',
].join('\n')

const nullableCount = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max ? v : null)
const ids = (v: unknown, known: Set<string>) => [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, 64)).filter((x) => known.has(x)))]

export function parseInput(body: unknown): PlanInput {
  const data = asRecord(body)
  const start = str(data.start, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) throw new HttpError('Date invalide.', 400)

  const people = (Array.isArray(data.people) ? data.people : []).slice(0, MAX_PEOPLE).map((value) => {
    const raw = asRecord(value)
    return { id: str(raw.id, 64), name: str(raw.name, 60) }
  }).filter((p) => p.id && p.name)
  const known = new Set(people.map((p) => p.id))

  const rawSlots = Array.isArray(data.slots) ? data.slots : []
  if (rawSlots.length === 0) throw new HttpError('Aucun créneau à remplir.', 400)
  if (rawSlots.length > MAX_SLOTS) throw new HttpError(`${MAX_SLOTS} créneaux au plus.`, 400)
  const slots = rawSlots.map((value) => {
    const raw = asRecord(value)
    const key = str(raw.key, 20)
    const match = /^(\d{4}-\d{2}-\d{2})\|(LUNCH|DINNER)$/.exec(key)
    if (!match) throw new HttpError('Créneau invalide.', 400)
    return { key, day: str(raw.day, 40), slot: match[2] as 'LUNCH' | 'DINNER', people: ids(raw.people, known), freeCooks: ids(raw.freeCooks, known) }
  })

  const rawDishes = Array.isArray(data.dishes) ? data.dishes : []
  if (rawDishes.length === 0) throw new HttpError('Aucun plat à planifier.', 400)
  if (rawDishes.length > MAX_DISHES) throw new HttpError(`${MAX_DISHES} plats au plus.`, 400)
  const dishes = rawDishes.map((value) => {
    const raw = asRecord(value)
    const id = str(raw.id, 64)
    const title = str(raw.title, 200)
    if (!id || !title) throw new HttpError('Plat invalide.', 400)
    const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 15)
    return {
      id,
      title,
      minutes: nullableCount(raw.minutes, 24 * 60),
      servings: nullableCount(raw.servings, 50),
      ingredients,
      long: raw.long === true,
      fragile: raw.fragile === true,
    }
  })
  return { start, people, slots, dishes }
}

export function buildUserMessage({ start, people, slots, dishes }: PlanInput): string {
  const names = (list: string[]) => list.map((id) => people.find((p) => p.id === id)?.name ?? id).join(', ')
  return [
    `Début du cycle : ${start}`,
    'Personnes (id | prénom) :',
    ...people.map((p) => `${p.id} | ${p.name}`),
    '',
    'Créneaux à remplir (créneau | jour | repas | à la maison | ont le temps de cuisiner) :',
    ...slots.map((s) => [s.key, s.day, s.slot === 'LUNCH' ? 'midi' : 'soir', names(s.people), names(s.freeCooks)].join(' | ')),
    '',
    'Plats à planifier (id | titre | minutes | portions | long | fragile | ingrédients) :',
    ...dishes.map((d) =>
      [d.id, d.title, d.minutes ?? '?', d.servings ?? '?', d.long ? 'long' : '', d.fragile ? 'fragile' : '', d.ingredients.join(', ')].join(' | '),
    ),
  ].join('\n')
}

/** Placements sur un créneau et un plat connus, un par créneau ; les règles fines sont vérifiées par l'application. */
export function sanitizePlan(output: unknown, input: PlanInput): PlannedMeal[] {
  const raw = asRecord(output).repas
  const meals: PlannedMeal[] = []
  for (const value of Array.isArray(raw) ? raw : []) {
    const item = asRecord(value)
    const slot = input.slots.find((s) => s.key === str(item.creneau, 20))
    const dish = input.dishes.find((d) => d.id === str(item.plat_id, 64))
    if (!slot || !dish || meals.some((m) => m.slot === slot.key)) continue
    const cook = str(item.cuisinier_id, 64)
    const cookId = item.cuisinier_id === null ? { cookId: null } : input.people.some((p) => p.id === cook) ? { cookId: cook } : {}
    meals.push({ slot: slot.key, dishId: dish.id, ...cookId, why: str(item.raison, 160) })
  }
  return meals
}

export async function planWeek(input: PlanInput, options: ModelOptions): Promise<{ meals: PlannedMeal[]; usage: ModelUsage | null }> {
  const { input: output, usage } = await callTool(
    {
      system: SYSTEM,
      tool: TOOL,
      message: buildUserMessage(input),
      maxTokens: 4_000,
      failure: 'La planification a échoué',
      missing: 'réponse sans repas',
      timeoutMs: TIMEOUT_MS,
    },
    options,
  )
  return { meals: sanitizePlan(output, input), usage }
}
