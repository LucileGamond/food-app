// Estimation des calories et macros d'une recette d'après la table Ciqual (ANSES).
// Le modèle ne fait que choisir, pour chaque ingrédient, l'aliment Ciqual parmi des candidats et estimer son poids ;
// les valeurs nutritionnelles et les totaux sont calculés ici, à partir de la table.

import { callTool, HttpError, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import { CIQUAL, type CiqualFood } from './ciqual.ts'

export const MAX_INGREDIENTS = 60
/** Aliments Ciqual proposés au modèle pour chaque ingrédient. */
export const CANDIDATES = 12

export interface NutritionIngredient {
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
}

export interface NutritionInput {
  title: string
  servings: number | null
  ingredients: NutritionIngredient[]
}

export interface IngredientEstimate {
  name: string
  /** Aliment Ciqual retenu, ou null (non compté). */
  food: { code: string; name: string } | null
  grams: number | null
  kcal: number | null
}

export interface NutritionEstimate {
  /** Par portion si la recette indique son nombre de portions, sinon pour toute la recette. */
  per: 'portion' | 'recette'
  kcal: number
  protein: number
  carbs: number
  fat: number
  ingredients: IngredientEstimate[]
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Recette reçue du navigateur : validée et bornée. */
export function parseInput(body: unknown): NutritionInput {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const raw = Array.isArray(data.ingredients) ? data.ingredients : []
  if (raw.length === 0) throw new HttpError('Aucun ingrédient.', 400)
  if (raw.length > MAX_INGREDIENTS) throw new HttpError(`${MAX_INGREDIENTS} ingrédients au plus.`, 400)
  const ingredients = raw.map((value) => {
    const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const name = str(item.name, 120)
    if (!name) throw new HttpError('Ingrédient invalide.', 400)
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null
    return { name, quantity, unit: str(item.unit, 30) || null, note: str(item.note, 120) || null }
  })
  const servings = typeof data.servings === 'number' && Number.isInteger(data.servings) && data.servings >= 1 && data.servings <= 99 ? data.servings : null
  return { title: str(data.title, 200), servings, ingredients }
}

/** Mots d'un nom, sans accents, au singulier : « Tomates cerises » → [tomate, cerise]. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
}

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'en', 'et', 'ou', 'un', 'une', 'pour', 'avec', 'sans', 'a', 'd', 'l'])
const INDEX = CIQUAL.map((food) => ({ food, words: new Set(words(food[1])), first: words(food[1])[0] ?? '', length: food[1].length }))

/**
 * Aliments Ciqual les plus proches d'un ingrédient : mots en commun, le premier mot de l'aliment en tête
 * (« Oignon, cru » pour « oignons »), les aliments crus et les noms courts d'abord (aliments de base).
 */
export function candidates(name: string, count = CANDIDATES): CiqualFood[] {
  const query = words(name).filter((w) => !STOP.has(w))
  if (query.length === 0) return []
  return INDEX.map((entry) => {
    const common = query.filter((w) => entry.words.has(w)).length
    if (common === 0) return { food: entry.food, score: 0 }
    let score = common * 10 + (common === query.length ? 5 : 0)
    if (entry.first === query[0]) score += 8
    if (entry.words.has('cru') || entry.words.has('crue')) score += 2
    score -= entry.length / 40
    return { food: entry.food, score }
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((s) => s.food)
}

/** Poids connu sans le modèle : g, kg, ou volume compté comme de l'eau (1 ml ≈ 1 g). */
export function knownGrams(quantity: number | null, unit: string | null): number | null {
  if (quantity === null || !unit) return null
  const factor: Record<string, number> = { g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000 }
  return unit in factor ? quantity * factor[unit]! : null
}

const TOOL_NAME = 'estimer_ingredients'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre, pour chaque ingrédient, l’aliment Ciqual retenu et le poids utilisé dans la recette.',
  input_schema: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'Numéro de l’ingrédient reçu (à partir de 0).' },
            code: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Code de l’aliment Ciqual le plus proche parmi les candidats de cet ingrédient ; null si aucun ne convient.',
            },
            grams: {
              anyOf: [{ type: 'number' }, { type: 'null' }],
              description: 'Poids en grammes de la quantité indiquée, tel qu’acheté (1 oignon ≈ 100 g, 1 c. à s. d’huile ≈ 10 g, 1 pincée ≈ 0,5 g) ; null si la quantité n’est pas indiquée et ne peut pas être devinée.',
            },
          },
          required: ['index', 'code', 'grams'],
        },
      },
    },
    required: ['ingredients'],
  },
}

const SYSTEM = [
  'Tu aides à calculer les valeurs nutritionnelles d’une recette française avec la table Ciqual de l’ANSES.',
  'Pour chaque ingrédient, choisis parmi ses candidats l’aliment Ciqual qui correspond le mieux à l’ingrédient tel qu’on l’achète (cru en général, sauf s’il est indiqué cuit, en conserve…).',
  'Estime aussi son poids en grammes pour la quantité indiquée et toute la recette. Pour une quantité « à volonté » ou absente, donne un poids raisonnable pour la recette, ou null si c’est négligeable (sel, poivre, herbes pour décorer).',
  'Ne choisis jamais un code absent des candidats de l’ingrédient.',
  `Réponds uniquement en appelant l’outil ${TOOL_NAME}.`,
].join('\n')

/** Message envoyé au modèle : les ingrédients et, pour chacun, ses candidats Ciqual. */
export function buildUserMessage(input: NutritionInput, options: readonly CiqualFood[][]): string {
  const blocks = input.ingredients.map((ingredient, i) => {
    const amount = [ingredient.quantity, ingredient.unit].filter((v) => v !== null).join(' ') || 'quantité non indiquée'
    const list = options[i]!.length ? options[i]!.map((f) => `  - ${f[0]} : ${f[1]}`).join('\n') : '  (aucun candidat)'
    return `${i}. ${ingredient.name}${ingredient.note ? ` (${ingredient.note})` : ''} — ${amount}\n${list}`
  })
  return [`Recette : ${input.title || '(sans titre)'}${input.servings ? ` (${input.servings} portions)` : ''}`, '', ...blocks].join('\n')
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Totaux calculés à partir des choix du modèle, gardés seulement s'ils sont sûrs : code parmi les candidats de
 * l'ingrédient, poids positif et borné. Le poids connu (g, kg, ml…) l'emporte sur celui du modèle.
 */
export function computeEstimate(input: NutritionInput, options: readonly CiqualFood[][], output: unknown): NutritionEstimate {
  const data = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const answers = new Map<number, Record<string, unknown>>()
  for (const value of Array.isArray(data.ingredients) ? data.ingredients : []) {
    if (typeof value !== 'object' || value === null) continue
    const index = (value as Record<string, unknown>).index
    if (typeof index === 'number' && Number.isInteger(index) && !answers.has(index)) answers.set(index, value as Record<string, unknown>)
  }
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  const ingredients = input.ingredients.map((ingredient, i): IngredientEstimate => {
    const answer = answers.get(i)
    const food = options[i]!.find((f) => f[0] === answer?.code) ?? null
    const proposed = typeof answer?.grams === 'number' && Number.isFinite(answer.grams) && answer.grams > 0 && answer.grams <= 20_000 ? answer.grams : null
    const grams = knownGrams(ingredient.quantity, ingredient.unit) ?? proposed
    if (!food || grams === null) return { name: ingredient.name, food: food && { code: food[0], name: food[1] }, grams, kcal: null }
    const part = grams / 100
    totals.kcal += food[2] * part
    totals.protein += (food[3] ?? 0) * part
    totals.carbs += (food[4] ?? 0) * part
    totals.fat += (food[5] ?? 0) * part
    return { name: ingredient.name, food: { code: food[0], name: food[1] }, grams: Math.round(grams), kcal: Math.round(food[2] * part) }
  })
  const divide = input.servings ?? 1
  return {
    per: input.servings ? 'portion' : 'recette',
    kcal: Math.round(totals.kcal / divide),
    protein: round1(totals.protein / divide),
    carbs: round1(totals.carbs / divide),
    fat: round1(totals.fat / divide),
    ingredients,
  }
}

export async function estimateNutrition(input: NutritionInput, options: ModelOptions): Promise<{ estimate: NutritionEstimate; usage: ModelUsage | null }> {
  const choices = input.ingredients.map((i) => candidates(i.name))
  const { input: output, usage } = await callTool(
    {
      system: SYSTEM,
      tool: TOOL,
      message: buildUserMessage(input, choices),
      maxTokens: 4096,
      failure: 'Le calcul des calories a échoué',
      missing: 'réponse vide',
    },
    options,
  )
  const estimate = computeEstimate(input, choices, output)
  if (estimate.ingredients.every((i) => i.kcal === null)) throw new HttpError('Aucun ingrédient n’a pu être reconnu dans la table Ciqual.', 422)
  return { estimate, usage }
}
